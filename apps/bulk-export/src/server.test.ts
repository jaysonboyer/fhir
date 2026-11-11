import assert from "node:assert/strict";
import { generateKeyPairSync, type KeyObject, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { signJwt } from "./jwt.ts";
import { handler, POLLS_BEFORE_DONE } from "./server.ts";

const ec = generateKeyPairSync("ec", { namedCurve: "P-384" });
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });

// Starts a server with one registered client holding an ES384 key ("ec") and an RS384 key ("rsa").
async function start(t: { after: (fn: () => void) => void }) {
  const server = createServer(handler).listen(0);
  t.after(() => server.close());
  await new Promise((r) => server.once("listening", r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  const clientId = `client-${randomUUID()}`;
  const jwks = {
    keys: [
      { ...ec.publicKey.export({ format: "jwk" }), kid: "ec" },
      { ...rsa.publicKey.export({ format: "jwk" }), kid: "rsa" },
    ],
  };
  const registered = await fetch(`${base}/register-client`, {
    method: "POST",
    body: JSON.stringify({ client_id: clientId, jwks }),
  });
  assert.equal(registered.status, 201);

  const requestToken = (
    claims: Record<string, unknown> = {},
    { kid = "ec", scope = "system/*.rs", key = ec.privateKey as KeyObject } = {},
  ) => {
    const assertion = signJwt(
      { alg: kid === "rsa" ? "RS384" : "ES384", kid, typ: "JWT" },
      {
        iss: clientId,
        sub: clientId,
        aud: `${base}/token`,
        exp: Math.floor(Date.now() / 1000) + 240,
        jti: randomUUID(),
        ...claims,
      },
      key,
    );
    return fetch(`${base}/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: assertion,
        scope,
      }),
    });
  };
  const auth = async (scope?: string) => {
    const body = await (await requestToken({}, { scope })).json();
    return { Authorization: `Bearer ${body.access_token}` };
  };
  return { base, requestToken, auth };
}

test("group export: kick-off, poll, manifest, NDJSON, delete", async (t) => {
  const { base, auth } = await start(t);
  const headers = await auth();
  const kick = await fetch(`${base}/Group/demo-members/$export?_type=Patient,Observation`, {
    headers: { Prefer: "respond-async", ...headers },
  });
  assert.equal(kick.status, 202);
  const statusUrl = kick.headers.get("content-location") ?? "";

  for (let i = 0; i < POLLS_BEFORE_DONE; i++) {
    const poll = await fetch(statusUrl, { headers });
    assert.equal(poll.status, 202);
    assert.equal(poll.headers.get("retry-after"), "1");
  }
  const done = await fetch(statusUrl, { headers });
  assert.equal(done.status, 200);
  const manifest = await done.json();
  assert.equal(manifest.requiresAccessToken, true);
  assert.deepEqual(
    manifest.output.map((o: { type: string }) => o.type),
    ["Patient", "Observation"],
  );

  assert.equal((await fetch(manifest.output[0].url)).status, 401); // files need the token too
  const patients = (await (await fetch(manifest.output[0].url, { headers })).text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.deepEqual(
    patients.map((p) => p.id),
    ["p1", "p2"],
  );
  const observations = (await (await fetch(manifest.output[1].url, { headers })).text()).trim().split("\n");
  assert.equal(observations.length, 3); // p3's Observation is outside the Group

  assert.equal((await fetch(statusUrl, { method: "DELETE" })).status, 401);
  assert.equal((await fetch(statusUrl, { method: "DELETE", headers })).status, 202);
  assert.equal((await fetch(statusUrl, { headers })).status, 404);
  assert.equal((await fetch(manifest.output[0].url, { headers })).status, 404);
});

test("kick-off errors", async (t) => {
  const { base, auth } = await start(t);
  const headers = await auth();
  const prefer = { headers: { Prefer: "respond-async", ...headers } };
  assert.equal((await fetch(`${base}/Group/demo-members/$export`, { headers })).status, 400); // no Prefer
  assert.equal((await fetch(`${base}/Group/nope/$export`, prefer)).status, 404);
  assert.equal((await fetch(`${base}/Group/demo-members/$export?_type=Condition`, prefer)).status, 400);

  const noToken = await fetch(`${base}/Group/demo-members/$export`, { headers: { Prefer: "respond-async" } });
  assert.equal(noToken.status, 401);
  assert.equal(noToken.headers.get("www-authenticate"), "Bearer");
  const badToken = { Prefer: "respond-async", Authorization: "Bearer made-up" };
  assert.equal((await fetch(`${base}/Group/demo-members/$export`, { headers: badToken })).status, 401);

  // A token for Patient only can't export Observations.
  const patientOnly = { Prefer: "respond-async", ...(await auth("system/Patient.rs")) };
  assert.equal((await fetch(`${base}/Group/demo-members/$export?_type=Patient`, { headers: patientOnly })).status, 202);
  assert.equal(
    (await fetch(`${base}/Group/demo-members/$export?_type=Observation`, { headers: patientOnly })).status,
    403,
  );
});

test("token endpoint: discovery and a good assertion with each algorithm", async (t) => {
  const { base, requestToken } = await start(t);
  const config = await (await fetch(`${base}/.well-known/smart-configuration`)).json();
  assert.equal(config.token_endpoint, `${base}/token`);
  assert.deepEqual(config.token_endpoint_auth_methods_supported, ["private_key_jwt"]);

  const good = await requestToken({}, { scope: "system/Patient.rs user/Patient.rs" });
  assert.equal(good.status, 200);
  const body = await good.json();
  assert.equal(body.token_type, "bearer");
  assert.equal(body.expires_in, 300);
  assert.equal(body.scope, "system/Patient.rs"); // user/ scopes are never granted here

  assert.equal((await requestToken({}, { kid: "rsa", key: rsa.privateKey })).status, 200);
});

test("token endpoint rejects bad assertions", async (t) => {
  const { base, requestToken } = await start(t);
  const now = Math.floor(Date.now() / 1000);
  const rejected = async (res: Response, status: number, error: string) => {
    assert.equal(res.status, status);
    assert.equal((await res.json()).error, error);
  };

  await rejected(await requestToken({ aud: "https://elsewhere.example/token" }), 401, "invalid_client");
  await rejected(await requestToken({ exp: now - 10 }), 401, "invalid_client"); // expired
  await rejected(await requestToken({ exp: now + 3600 }), 401, "invalid_client"); // more than 5 minutes out
  await rejected(await requestToken({}, { kid: "unknown" }), 401, "invalid_client");
  await rejected(await requestToken({}, { key: rsa.privateKey }), 401, "invalid_client"); // signed with the wrong key
  await rejected(await requestToken({ iss: "someone-else" }), 401, "invalid_client");
  await rejected(await requestToken({}, { scope: "user/Patient.rs" }), 400, "invalid_scope");

  const jti = randomUUID();
  assert.equal((await requestToken({ jti })).status, 200);
  await rejected(await requestToken({ jti }), 401, "invalid_client"); // replayed

  const wrongGrant = await fetch(`${base}/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "password" }),
  });
  await rejected(wrongGrant, 400, "unsupported_grant_type");
});
