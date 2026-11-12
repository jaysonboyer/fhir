import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { CLIENT, handler } from "./server.ts";

async function start(t: { after: (fn: () => void) => void }) {
  const server = createServer(handler).listen(0);
  t.after(() => server.close());
  await new Promise((r) => server.once("listening", r));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

const location = async (url: string) =>
  new URL((await fetch(url, { redirect: "manual" })).headers.get("location") ?? "");
const verifier = "a-test-verifier-that-is-long-enough-for-pkce-0123456789";
const challenge = createHash("sha256").update(verifier).digest("base64url");
const scope =
  "launch openid fhirUser offline_access patient/Patient.rs patient/Observation.rs patient/MedicationRequest.rs";

async function authorize(base: string, overrides: Record<string, string> = {}) {
  const launch = (await location(`${base}/ehr/launch`)).searchParams.get("launch") ?? "";
  const params = {
    response_type: "code",
    client_id: CLIENT.client_id,
    redirect_uri: CLIENT.redirect_uri,
    scope,
    launch,
    state: "s1",
    aud: `${base}/fhir`,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...overrides,
  };
  return fetch(`${base}/authorize?${new URLSearchParams(params)}`, { redirect: "manual" });
}

const token = (base: string, params: Record<string, string>) =>
  fetch(`${base}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT.client_id, ...params }),
  });

async function getTokens(base: string) {
  const callback = new URL((await authorize(base)).headers.get("location") ?? "");
  const code = callback.searchParams.get("code") ?? "";
  const exchange = {
    grant_type: "authorization_code",
    code,
    redirect_uri: CLIENT.redirect_uri,
    code_verifier: verifier,
  };
  return { code, exchange, res: await token(base, exchange) };
}

test("EHR launch: code with state, token with launch context, denied scope dropped", async (t) => {
  const base = await start(t);
  const callback = new URL((await authorize(base)).headers.get("location") ?? "");
  assert.equal(callback.origin + callback.pathname, CLIENT.redirect_uri);
  assert.equal(callback.searchParams.get("state"), "s1");

  const { res } = await getTokens(base);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.patient, "123");
  assert.equal(body.encounter, "enc-456");
  assert.ok(!body.scope.includes("MedicationRequest"));
  assert.ok(body.id_token.split(".").length === 3 && body.refresh_token);
});

test("authorize rejects unknown redirect_uri without redirecting, and errors redirect back with state", async (t) => {
  const base = await start(t);
  const evil = await authorize(base, { redirect_uri: "http://evil.example/cb" });
  assert.equal(evil.status, 400);
  assert.equal(evil.headers.get("location"), null);

  const noPkce = new URL((await authorize(base, { code_challenge_method: "plain" })).headers.get("location") ?? "");
  assert.equal(noPkce.searchParams.get("error"), "invalid_request");
  assert.equal(noPkce.searchParams.get("state"), "s1");
  const wrongAud = new URL((await authorize(base, { aud: "http://other/fhir" })).headers.get("location") ?? "");
  assert.equal(wrongAud.searchParams.get("error"), "invalid_request");
});

test("token endpoint: wrong verifier, replayed code, refresh", async (t) => {
  const base = await start(t);
  const callback = new URL((await authorize(base)).headers.get("location") ?? "");
  const code = callback.searchParams.get("code") ?? "";
  const bad = await token(base, {
    grant_type: "authorization_code",
    code,
    redirect_uri: CLIENT.redirect_uri,
    code_verifier: "wrong",
  });
  assert.equal((await bad.json()).error, "invalid_grant");

  const { exchange, res } = await getTokens(base);
  const tokens = await res.json();
  assert.equal((await (await token(base, exchange)).json()).error, "invalid_grant"); // replay

  const refreshed = await token(base, { grant_type: "refresh_token", refresh_token: tokens.refresh_token });
  assert.equal(refreshed.status, 200);
  assert.notEqual((await refreshed.json()).access_token, tokens.access_token);
});

test("FHIR access follows granted scopes and the patient compartment", async (t) => {
  const base = await start(t);
  const tokens = await (await getTokens(base)).res.json();
  const get = (path: string, auth = `Bearer ${tokens.access_token}`) =>
    fetch(`${base}/fhir/${path}`, { headers: { Authorization: auth } });

  assert.equal((await get("Patient/123")).status, 200);
  assert.equal((await (await get("Observation?patient=123")).json()).total, 1); // obs-2 belongs to patient 999
  assert.equal((await get("MedicationRequest?patient=123")).status, 403);
  assert.equal((await get("Patient/999")).status, 404);
  assert.equal((await get("Patient/123", "Bearer made-up")).status, 401);
});
