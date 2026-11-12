import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// A fake EHR: SMART App Launch authorization server (https://hl7.org/fhir/smart-app-launch/) plus a tiny
// FHIR server at /fhir. It shows the EHR launch: launch -> discovery -> authorize (PKCE) -> code -> token
// -> FHIR calls limited by the granted scopes -> refresh.

// shortcut: one hard-coded public client; real servers register clients ahead of time.
export const CLIENT = {
  client_id: "demo-app",
  redirect_uri: "http://localhost/callback",
  launch_url: "http://localhost/launch",
};
// The simulated user unchecks medications on the approval screen, so this scope is never granted.
export const DENIED_BY_USER = ["patient/MedicationRequest.rs"];
const LAUNCH_CONTEXT = { patient: "123", encounter: "enc-456" };

const resources = [
  { resourceType: "Patient", id: "123", name: [{ given: ["Jane"], family: "Smith" }], birthDate: "1980-02-15" },
  { resourceType: "Patient", id: "999", name: [{ given: ["Other"], family: "Person" }] },
  {
    resourceType: "Observation",
    id: "obs-1",
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code: "4548-4", display: "Hemoglobin A1c" }] },
    subject: { reference: "Patient/123" },
    valueQuantity: { value: 6.1, unit: "%" },
  },
  {
    resourceType: "Observation",
    id: "obs-2",
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }] },
    subject: { reference: "Patient/999" },
    valueQuantity: { value: 64, unit: "/min" },
  },
  {
    resourceType: "MedicationRequest",
    id: "med-1",
    status: "active",
    intent: "order",
    medicationCodeableConcept: { text: "Metformin 500 mg" },
    subject: { reference: "Patient/123" },
  },
];

// The server's signing key for id_tokens; its public half is published at /jwks.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "demo-key", alg: "RS256", use: "sig" };

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");
function signJwt(claims: object) {
  const input = `${b64url(JSON.stringify({ alg: "RS256", kid: jwk.kid, typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  return `${input}.${b64url(sign("sha256", Buffer.from(input), privateKey))}`;
}

type Grant = {
  scope: string;
  patient: string;
  encounter: string;
  challenge: string;
  redirect_uri: string;
  expires: number;
};
type Token = { scope: string[]; patient: string; expires: number };
const launches = new Map<string, typeof LAUNCH_CONTEXT>();
const codes = new Map<string, Grant>();
const accessTokens = new Map<string, Token>();
const refreshTokens = new Map<string, { scope: string; patient: string; encounter: string }>();
const random = () => randomBytes(16).toString("base64url");

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}
const redirect = (res: ServerResponse, to: string) => send(res, 302, undefined, { Location: to });
const oauthError = (res: ServerResponse, status: number, error: string, error_description: string) =>
  send(res, status, { error, error_description });

async function readForm(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return new URLSearchParams(raw);
}

function authorize(res: ServerResponse, q: URLSearchParams, fhirBase: string) {
  // Never redirect to an unregistered redirect_uri: that would hand the code to an attacker.
  if (q.get("client_id") !== CLIENT.client_id || q.get("redirect_uri") !== CLIENT.redirect_uri)
    return oauthError(res, 400, "invalid_request", "unknown client_id or redirect_uri");
  const back = (params: Record<string, string>) =>
    redirect(res, `${CLIENT.redirect_uri}?${new URLSearchParams({ ...params, state: q.get("state") ?? "" })}`);
  if (q.get("response_type") !== "code") return back({ error: "unsupported_response_type" });
  if (q.get("aud") !== fhirBase)
    return back({ error: "invalid_request", error_description: "aud must be the FHIR base" });
  if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge"))
    return back({ error: "invalid_request", error_description: "PKCE with S256 is required" });
  const requested = (q.get("scope") ?? "").split(" ").filter(Boolean);
  const context = launches.get(q.get("launch") ?? "");
  if (requested.includes("launch") && !context)
    return back({ error: "invalid_request", error_description: "unknown launch" });

  // shortcut: no login or approval screen; the "user" approves everything except DENIED_BY_USER.
  const granted = requested.filter((s) => !DENIED_BY_USER.includes(s));
  const code = random();
  codes.set(code, {
    scope: granted.join(" "),
    ...(context ?? LAUNCH_CONTEXT),
    challenge: q.get("code_challenge") ?? "",
    redirect_uri: CLIENT.redirect_uri,
    expires: Date.now() + 60_000,
  });
  back({ code });
}

function issueTokens(res: ServerResponse, base: string, ctx: { scope: string; patient: string; encounter: string }) {
  const scopes = ctx.scope.split(" ");
  const access_token = random();
  accessTokens.set(access_token, { scope: scopes, patient: ctx.patient, expires: Date.now() + 3600_000 });
  const now = Math.floor(Date.now() / 1000);
  const body: Record<string, unknown> = {
    access_token,
    token_type: "Bearer",
    expires_in: 3600,
    scope: ctx.scope,
    patient: ctx.patient,
    encounter: ctx.encounter,
    need_patient_banner: false,
  };
  if (scopes.includes("openid") && scopes.includes("fhirUser"))
    body.id_token = signJwt({
      iss: `${base}/fhir`,
      sub: "pr-1",
      aud: CLIENT.client_id,
      iat: now,
      exp: now + 300,
      fhirUser: `${base}/fhir/Practitioner/pr-1`,
    });
  if (scopes.includes("offline_access") || scopes.includes("online_access")) {
    body.refresh_token = random();
    refreshTokens.set(body.refresh_token as string, ctx);
  }
  send(res, 200, body);
}

async function token(req: IncomingMessage, res: ServerResponse, base: string) {
  const form = await readForm(req);
  if (form.get("client_id") !== CLIENT.client_id) return oauthError(res, 401, "invalid_client", "unknown client_id");
  const grantType = form.get("grant_type");

  if (grantType === "authorization_code") {
    const grant = codes.get(form.get("code") ?? "");
    codes.delete(form.get("code") ?? ""); // a code works once, even if this request fails
    if (!grant || grant.expires < Date.now())
      return oauthError(res, 400, "invalid_grant", "unknown, used or expired code");
    if (form.get("redirect_uri") !== grant.redirect_uri)
      return oauthError(res, 400, "invalid_grant", "redirect_uri differs from the authorize request");
    const challenge = createHash("sha256")
      .update(form.get("code_verifier") ?? "")
      .digest("base64url");
    if (challenge !== grant.challenge) return oauthError(res, 400, "invalid_grant", "code_verifier does not match");
    return issueTokens(res, base, grant);
  }
  if (grantType === "refresh_token") {
    const ctx = refreshTokens.get(form.get("refresh_token") ?? "");
    if (!ctx) return oauthError(res, 400, "invalid_grant", "unknown refresh_token");
    return issueTokens(res, base, ctx);
  }
  oauthError(res, 400, "unsupported_grant_type", "use authorization_code or refresh_token");
}

// Allow a read of `type` when a patient/ scope covers it, only inside the launch patient's compartment.
function fhir(req: IncomingMessage, res: ServerResponse, url: URL) {
  const auth = req.headers.authorization ?? "";
  const tok = accessTokens.get(auth.replace(/^Bearer /, ""));
  if (!tok || tok.expires < Date.now()) return send(res, 401, undefined, { "WWW-Authenticate": "Bearer" });
  const [, , type, id] = url.pathname.split("/"); // /fhir/<type>/<id>
  const allowed = tok.scope.some((s) => s === `patient/${type}.rs` || s === `patient/${type}.read`);
  if (!allowed)
    return send(res, 403, {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "forbidden", diagnostics: `no scope for ${type}` }],
    });
  const inCompartment = (r: (typeof resources)[number]) =>
    r.resourceType === "Patient"
      ? r.id === tok.patient
      : "subject" in r && r.subject?.reference === `Patient/${tok.patient}`;

  if (id) {
    const found = resources.find((r) => r.resourceType === type && r.id === id);
    if (!found || !inCompartment(found)) return send(res, 404, undefined); // outside the compartment looks like "not found"
    return send(res, 200, found);
  }
  const patient = url.searchParams.get("patient");
  if (patient && patient !== tok.patient) return send(res, 403, undefined);
  const matches = resources.filter((r) => r.resourceType === type && inCompartment(r));
  send(res, 200, {
    resourceType: "Bundle",
    type: "searchset",
    total: matches.length,
    entry: matches.map((resource) => ({ resource })),
  });
}

export async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const base = `http://${req.headers.host}`;
  const path = url.pathname;
  if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true });

  // The EHR side: a clinician clicks the app, so the EHR opens its launch URL with iss and launch.
  if (req.method === "GET" && path === "/ehr/launch") {
    const launch = random();
    launches.set(launch, LAUNCH_CONTEXT);
    return redirect(res, `${CLIENT.launch_url}?${new URLSearchParams({ iss: `${base}/fhir`, launch })}`);
  }
  if (req.method === "GET" && path === "/fhir/.well-known/smart-configuration")
    return send(res, 200, {
      issuer: `${base}/fhir`,
      jwks_uri: `${base}/jwks`,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["openid", "fhirUser", "launch", "offline_access", "patient/*.rs"],
      capabilities: [
        "launch-ehr",
        "client-public",
        "context-ehr-patient",
        "context-ehr-encounter",
        "sso-openid-connect",
        "permission-v2",
        "permission-offline",
      ],
    });
  if (req.method === "GET" && path === "/jwks") return send(res, 200, { keys: [jwk] });
  if (req.method === "GET" && path === "/authorize") return authorize(res, url.searchParams, `${base}/fhir`);
  if (req.method === "POST" && path === "/token") return token(req, res, base);
  if (req.method === "GET" && path.startsWith("/fhir/")) return fhir(req, res, url);
  send(res, 404, { error: "not found" });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3005);
  createServer(handler).listen(port, () =>
    console.log(`SMART auth server on http://localhost:${port} — run \`pnpm demo\` to walk an EHR launch`),
  );
}
