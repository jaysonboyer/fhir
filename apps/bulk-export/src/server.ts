import { createPublicKey, type JsonWebKey, randomUUID, verify } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// A fake FHIR server that implements just enough of Bulk Data Access (https://hl7.org/fhir/uv/bulkdata/)
// to show the async flow: kick-off -> 202 + status URL -> poll -> manifest -> NDJSON files -> DELETE.
// Every export request needs a Bearer token from SMART Backend Services
// (https://hl7.org/fhir/smart-app-launch/backend-services.html): the client signs a JWT with its
// private key and trades it for an access token at /token using the client_credentials grant.

type Resource = { resourceType: string; id: string; subject?: { reference: string }; [field: string]: unknown };

const observation = (id: string, patient: string, code: string, display: string, value: number, unit: string) => ({
  resourceType: "Observation",
  id,
  status: "final",
  code: { coding: [{ system: "http://loinc.org", code, display }] },
  subject: { reference: `Patient/${patient}` },
  valueQuantity: { value, unit },
});

const resources: Resource[] = [
  { resourceType: "Patient", id: "p1", name: [{ given: ["Ada"], family: "Lovelace" }] },
  { resourceType: "Patient", id: "p2", name: [{ given: ["Alan"], family: "Turing" }] },
  // Not a Group member, so a Group export never includes Grace or her Observation.
  { resourceType: "Patient", id: "p3", name: [{ given: ["Grace"], family: "Hopper" }] },
  observation("o1", "p1", "4548-4", "Hemoglobin A1c", 6.1, "%"),
  observation("o2", "p1", "8867-4", "Heart rate", 72, "/min"),
  observation("o3", "p2", "4548-4", "Hemoglobin A1c", 5.4, "%"),
  observation("o4", "p3", "8867-4", "Heart rate", 64, "/min"),
];

const groups: Record<string, string[]> = { "demo-members": ["Patient/p1", "Patient/p2"] };
const exportable = ["Patient", "Observation"];

// How many status polls answer 202 before the job is "done", so the client sees the waiting step.
export const POLLS_BEFORE_DONE = 2;

type Job = { pollsLeft: number; manifest: unknown; files: Map<string, string> };
const jobs = new Map<string, Job>();

// client_id -> its registered public keys (a JWKS). Real servers get these out of band.
const clients = new Map<string, { keys: (JsonWebKey & { kid?: string })[] }>();
// shortcut: jti and token stores live in memory and never shrink; expire entries if this runs for long.
const usedJtis = new Set<string>();
const tokens = new Map<string, { expires: number; scopes: string[] }>();
const TOKEN_SECONDS = 300;
const keyTypes: Record<string, string> = { RS384: "RSA", ES384: "EC" };

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

const oauthError = (res: ServerResponse, status: number, error: string, error_description: string) =>
  send(res, status, { error, error_description });

async function readBody(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}

// Returns why the client assertion is invalid, or the client_id it proves.
function checkAssertion(jwt: string, tokenUrl: string): { error: string } | { clientId: string } {
  try {
    const [h, p, s, extra] = jwt.split(".");
    if (!s || extra !== undefined) return { error: "client_assertion is not a JWT" };
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    const keys = clients.get(claims.iss)?.keys;
    if (!keys || claims.sub !== claims.iss) return { error: "unknown client, or iss and sub differ" };
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return { error: `no registered key with kid ${header.kid}` };
    // Tie the alg to the registered key type so a client can't pick a weaker algorithm.
    if (!keyTypes[header.alg] || jwk.kty !== keyTypes[header.alg])
      return { error: "alg must be RS384 or ES384 and match the key" };
    const key = createPublicKey({ key: jwk, format: "jwk" });
    const signed = Buffer.from(`${h}.${p}`);
    if (!verify("sha384", signed, { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")))
      return { error: "signature does not verify" };
    if (claims.aud !== tokenUrl) return { error: `aud must be ${tokenUrl}` };
    const now = Date.now() / 1000;
    if (typeof claims.exp !== "number" || claims.exp <= now || claims.exp > now + 300)
      return { error: "exp must be in the future and no more than 5 minutes away" };
    // Checked last, so only a correctly signed JWT can use up a jti.
    if (typeof claims.jti !== "string" || usedJtis.has(claims.jti)) return { error: "jti missing or already used" };
    usedJtis.add(claims.jti);
    return { clientId: claims.iss };
  } catch {
    return { error: "client_assertion could not be read" };
  }
}

async function token(req: IncomingMessage, res: ServerResponse) {
  const form = new URLSearchParams(await readBody(req));
  if (form.get("grant_type") !== "client_credentials")
    return oauthError(res, 400, "unsupported_grant_type", "grant_type must be client_credentials");
  if (form.get("client_assertion_type") !== "urn:ietf:params:oauth:client-assertion-type:jwt-bearer")
    return oauthError(res, 400, "invalid_request", "client_assertion_type must be jwt-bearer");
  const result = checkAssertion(form.get("client_assertion") ?? "", `http://${req.headers.host}/token`);
  if ("error" in result) return oauthError(res, 401, "invalid_client", result.error);
  // Backend Services has no user and no patient, so only system/ scopes can be granted.
  const scopes = (form.get("scope") ?? "").split(" ").filter((s) => s.startsWith("system/"));
  if (!scopes.length) return oauthError(res, 400, "invalid_scope", "request at least one system/ scope");
  const accessToken = randomUUID();
  tokens.set(accessToken, { expires: Date.now() + TOKEN_SECONDS * 1000, scopes });
  send(res, 200, {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: TOKEN_SECONDS,
    scope: scopes.join(" "),
  });
}

function bearer(req: IncomingMessage) {
  const grant = tokens.get(req.headers.authorization?.replace(/^Bearer /i, "") ?? "");
  return grant && grant.expires > Date.now() ? grant : undefined;
}

// shortcut: ignores the permission part (.read, .rs); a real server would check it too.
const allows = (scopes: string[], type: string) =>
  scopes.some((s) => s.startsWith(`system/${type}.`) || s.startsWith("system/*."));

const outcome = (diagnostics: string) => ({
  resourceType: "OperationOutcome",
  issue: [{ severity: "error", code: "invalid", diagnostics }],
});

function kickOff(req: IncomingMessage, res: ServerResponse, url: URL, groupId: string, scopes: string[]) {
  const members = groups[groupId];
  if (!members) return send(res, 404, outcome(`Group/${groupId} not found`));
  if (req.headers.prefer !== "respond-async") return send(res, 400, outcome("Prefer: respond-async is required"));
  const types = (url.searchParams.get("_type") ?? exportable.join(",")).split(",");
  const unsupported = types.filter((t) => !exportable.includes(t));
  if (unsupported.length) return send(res, 400, outcome(`unsupported _type: ${unsupported.join(",")}`));
  const forbidden = types.filter((t) => !allows(scopes, t));
  if (forbidden.length) return send(res, 403, outcome(`token has no system/ scope for ${forbidden.join(",")}`));

  const id = randomUUID();
  const base = `http://${req.headers.host}`;
  const inGroup = (r: Resource) => members.includes(r.subject?.reference ?? `${r.resourceType}/${r.id}`);
  const files = new Map<string, string>();
  for (const type of types) {
    const lines = resources.filter((r) => r.resourceType === type && inGroup(r)).map((r) => JSON.stringify(r));
    // NDJSON: one resource per line, no Bundle around them. Types with no data get no file.
    if (lines.length) files.set(`${type}.ndjson`, `${lines.join("\n")}\n`);
  }
  const manifest = {
    transactionTime: new Date().toISOString(),
    request: `${base}${url.pathname}${url.search}`,
    requiresAccessToken: true,
    output: [...files.keys()].map((name) => ({
      type: name.replace(".ndjson", ""),
      url: `${base}/files/${id}/${name}`,
    })),
    error: [],
  };
  jobs.set(id, { pollsLeft: POLLS_BEFORE_DONE, manifest, files });
  send(res, 202, undefined, { "Content-Location": `${base}/jobs/${id}` });
}

export async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true });
  if (req.method === "GET" && path === "/.well-known/smart-configuration")
    return send(res, 200, {
      token_endpoint: `http://${req.headers.host}/token`,
      grant_types_supported: ["client_credentials"],
      token_endpoint_auth_methods_supported: ["private_key_jwt"],
      token_endpoint_auth_signing_alg_values_supported: ["RS384", "ES384"],
      scopes_supported: ["system/*.rs", "system/Patient.rs", "system/Observation.rs"],
      capabilities: ["client-confidential-asymmetric"],
    });
  if (req.method === "POST" && path === "/token") return token(req, res);
  // Demo only: stands in for registering a client and its public JWKS out of band (a form, an email,
  // a vendor portal) before it ever asks for a token. Never expose an open endpoint like this for real.
  if (req.method === "POST" && path === "/register-client") {
    let body: { client_id?: unknown; jwks?: { keys?: unknown } } | undefined;
    try {
      body = JSON.parse(await readBody(req));
    } catch {}
    const keys = body?.jwks?.keys;
    if (typeof body?.client_id !== "string" || !Array.isArray(keys) || !keys.every((k) => typeof k?.kid === "string"))
      return send(res, 400, outcome("body must be { client_id, jwks: { keys: [ { kid, ... } ] } }"));
    clients.set(body.client_id, { keys });
    return send(res, 201, { client_id: body.client_id });
  }

  // Everything below is the export itself, which needs a valid access token.
  const grant = bearer(req);
  if (!grant) return send(res, 401, outcome("a valid Bearer token is required"), { "WWW-Authenticate": "Bearer" });

  const kick = path.match(/^\/Group\/([^/]+)\/\$export$/);
  if (req.method === "GET" && kick) return kickOff(req, res, url, kick[1], grant.scopes);

  const status = path.match(/^\/jobs\/([^/]+)$/);
  const job = status && jobs.get(status[1]);
  if (status && !job) return send(res, 404, outcome("no such export job"));
  if (status && job && req.method === "GET") {
    if (job.pollsLeft > 0) {
      job.pollsLeft--;
      return send(res, 202, undefined, { "Retry-After": "1", "X-Progress": "building files" });
    }
    return send(res, 200, job.manifest);
  }
  if (status && req.method === "DELETE") {
    jobs.delete(status[1]);
    return send(res, 202);
  }

  const file = path.match(/^\/files\/([^/]+)\/([A-Za-z]+\.ndjson)$/);
  const ndjson = file && jobs.get(file[1])?.files.get(file[2]);
  if (req.method === "GET" && ndjson) {
    res.writeHead(200, { "Content-Type": "application/fhir+ndjson" });
    return res.end(ndjson);
  }
  send(res, 404, outcome("not found"));
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3002);
  createServer(handler).listen(port, () =>
    console.log(`Bulk export server on http://localhost:${port} — run \`pnpm demo\` to export Group/demo-members`),
  );
}
