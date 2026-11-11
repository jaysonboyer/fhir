import { generateKeyPairSync, randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { signJwt } from "./jwt.ts";

// Walks the Bulk Data export flow against the server in server.ts (start it first with `pnpm dev`).
// Steps a-d get an access token with SMART Backend Services; steps 1-6 are the export from module 6.
const base = process.env.FHIR_BASE ?? "http://localhost:3002";
const clientId = "demo-bulk-client";

// A real client makes its key pair once and keeps the private key secret; this demo makes a fresh one per run.
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-384" });
const kid = randomUUID();
const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "ES384", use: "sig" }] };

console.log(`a. Register: POST ${base}/register-client (stands in for registering the public JWKS out of band)`);
console.log(`   client_id: ${clientId}, kid: ${kid}`);
const registered = await fetch(`${base}/register-client`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ client_id: clientId, jwks }),
});
if (registered.status !== 201) throw new Error(`register failed: ${registered.status} ${await registered.text()}`);

console.log(`b. Discovery: GET ${base}/.well-known/smart-configuration`);
const config = (await (await fetch(`${base}/.well-known/smart-configuration`)).json()) as { token_endpoint: string };
console.log(`   token_endpoint: ${config.token_endpoint}`);

const header = { alg: "ES384", kid, typ: "JWT" };
const claims = {
  iss: clientId,
  sub: clientId,
  aud: config.token_endpoint,
  exp: Math.floor(Date.now() / 1000) + 300,
  jti: randomUUID(),
};
console.log("c. Sign a client assertion JWT with the private key");
console.log(`   header: ${JSON.stringify(header)}\n   claims: ${JSON.stringify(claims)}`);
const assertion = signJwt(header, claims, privateKey);

const scope = "system/Patient.rs system/Observation.rs";
console.log(`d. Token: POST ${config.token_endpoint}\n   grant_type=client_credentials, scope=${scope}`);
const tokenRes = await fetch(config.token_endpoint, {
  method: "POST",
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertion,
    scope,
  }),
});
const token = (await tokenRes.json()) as { access_token: string; expires_in: number; scope: string };
if (tokenRes.status !== 200) throw new Error(`token failed: ${tokenRes.status} ${JSON.stringify(token)}`);
console.log(
  `   ${tokenRes.status} OK, access_token: ${token.access_token.slice(0, 8)}…, expires_in: ${token.expires_in}`,
);
console.log(`   granted scope: ${token.scope}`);
const auth = { Authorization: `Bearer ${token.access_token}` };

const kickOffUrl = `${base}/Group/demo-members/$export?_type=Patient,Observation`;
console.log(`1. Kick-off: GET ${kickOffUrl}\n   Prefer: respond-async, Authorization: Bearer …`);
const accepted = await fetch(kickOffUrl, {
  headers: { Accept: "application/fhir+json", Prefer: "respond-async", ...auth },
});
const statusUrl = accepted.headers.get("content-location");
if (accepted.status !== 202 || !statusUrl)
  throw new Error(`kick-off failed: ${accepted.status} ${await accepted.text()}`);
console.log(`2. ${accepted.status} Accepted, Content-Location: ${statusUrl}`);

let status = await fetch(statusUrl, { headers: auth });
while (status.status === 202) {
  const wait = Number(status.headers.get("retry-after") ?? 1);
  console.log(`3. Poll: 202 (${status.headers.get("x-progress")}), Retry-After: ${wait}s`);
  await setTimeout(wait * 1000);
  status = await fetch(statusUrl, { headers: auth });
}
if (status.status !== 200) throw new Error(`export failed: ${status.status} ${await status.text()}`);
const manifest = (await status.json()) as { requiresAccessToken: boolean; output: { type: string; url: string }[] };
console.log("4. 200 OK, manifest:");
console.log(JSON.stringify(manifest, null, 2).replace(/^/gm, "   "));

for (const { type, url } of manifest.output) {
  // requiresAccessToken: true means the file downloads need the same Bearer token.
  const lines = (await (await fetch(url, { headers: manifest.requiresAccessToken ? auth : {} })).text())
    .trim()
    .split("\n");
  console.log(`5. Download ${type}: ${lines.length} line(s), one resource per line`);
  for (const line of lines) console.log(`   ${line}`);
}

const deleted = await fetch(statusUrl, { method: "DELETE", headers: auth });
console.log(`6. Clean up: DELETE ${statusUrl} -> ${deleted.status}`);
