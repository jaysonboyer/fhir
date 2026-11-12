import { createHash, createPublicKey, type JsonWebKey, randomBytes, verify } from "node:crypto";

// Plays the SMART app in an EHR launch against the fake EHR in server.ts (start it first with `pnpm dev`).
// There is no browser here, so the client reads each redirect's Location header itself.
const ehr = process.env.EHR_BASE ?? "http://localhost:3005";
const CLIENT_ID = "demo-app";
const REDIRECT_URI = "http://localhost/callback";
const short = (value: string) => `${value.slice(0, 12)}...`;
const b64urlJson = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

async function redirectTarget(url: string) {
  const res = await fetch(url, { redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) throw new Error(`expected a redirect from ${url}, got ${res.status} ${await res.text()}`);
  return new URL(location);
}

console.log("1. The clinician opens the app in the EHR, which redirects to the app's launch URL:");
const launchUrl = await redirectTarget(`${ehr}/ehr/launch`);
const iss = launchUrl.searchParams.get("iss") ?? "";
const launch = launchUrl.searchParams.get("launch") ?? "";
console.log(`   ${launchUrl.origin}${launchUrl.pathname}\n   iss=${iss}\n   launch=${short(launch)}`);

console.log(`2. Discovery: GET ${iss}/.well-known/smart-configuration`);
const config = await (await fetch(`${iss}/.well-known/smart-configuration`)).json();
console.log(`   authorization_endpoint: ${config.authorization_endpoint}\n   token_endpoint: ${config.token_endpoint}`);

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const state = randomBytes(16).toString("base64url");
const requested =
  "launch openid fhirUser offline_access patient/Patient.rs patient/Observation.rs patient/MedicationRequest.rs";
const authorizeUrl = `${config.authorization_endpoint}?${new URLSearchParams({
  response_type: "code",
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  scope: requested,
  launch,
  state,
  aud: iss,
  code_challenge: challenge,
  code_challenge_method: "S256",
})}`;
console.log("3. Authorization request. PKCE: keep code_verifier secret, send its SHA-256 as code_challenge.");
console.log(`   scope: ${requested}\n   state: ${short(state)}  code_challenge: ${short(challenge)}`);

const callback = await redirectTarget(authorizeUrl);
console.log("4. The user approves (they unchecked medications). Redirect back to redirect_uri:");
console.log(
  `   ${callback.origin}${callback.pathname}?code=${short(callback.searchParams.get("code") ?? "")}&state=...`,
);
if (callback.searchParams.get("state") !== state) throw new Error("state mismatch: possible forged redirect");
console.log("   state matches what we sent, so this redirect answers our request");
const code = callback.searchParams.get("code") ?? "";

const tokenRequest = (params: Record<string, string>) =>
  fetch(config.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
  });
const codeExchange = { grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier };
console.log(`5. Token exchange: POST ${config.token_endpoint} with code and code_verifier`);
const tokenRes = await tokenRequest(codeExchange);
const tokens = await tokenRes.json();
if (tokenRes.status !== 200) throw new Error(`token exchange failed: ${JSON.stringify(tokens)}`);
const shown = {
  ...tokens,
  access_token: short(tokens.access_token),
  id_token: short(tokens.id_token),
  refresh_token: short(tokens.refresh_token),
};
console.log(JSON.stringify(shown, null, 2).replace(/^/gm, "   "));
const granted: string[] = tokens.scope.split(" ");
const missing = requested.split(" ").filter((s) => !granted.includes(s));
console.log(`   Granted less than requested. Missing: ${missing.join(" ")}`);

console.log("6. Check the id_token (a JWT) with the server's public key from jwks_uri:");
const [header, payload, signature] = tokens.id_token.split(".");
const claims = b64urlJson(payload);
const { keys } = await (await fetch(config.jwks_uri)).json();
const key = keys.find((k: { kid: string }) => k.kid === b64urlJson(header).kid) as JsonWebKey;
const signed = verify(
  "sha256",
  Buffer.from(`${header}.${payload}`),
  createPublicKey({ key, format: "jwk" }),
  Buffer.from(signature, "base64url"),
);
const valid = signed && claims.iss === iss && claims.aud === CLIENT_ID && claims.exp > Date.now() / 1000;
console.log(`   header: ${JSON.stringify(b64urlJson(header))}\n   claims: ${JSON.stringify(claims)}`);
console.log(`   signature, iss, aud and exp ${valid ? "all check out" : "FAILED"}. Logged-in user: ${claims.fhirUser}`);

const fhir = (path: string, token = tokens.access_token) =>
  fetch(`${iss}/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/fhir+json" } });
console.log(`7. FHIR calls with Authorization: Bearer <access_token>, for launch patient ${tokens.patient}:`);
const patient = await (await fhir(`Patient/${tokens.patient}`)).json();
console.log(`   GET Patient/${tokens.patient} -> ${patient.name[0].given.join(" ")} ${patient.name[0].family}`);
const observations = await (await fhir(`Observation?patient=${tokens.patient}`)).json();
for (const { resource } of observations.entry)
  console.log(
    `   GET Observation -> ${resource.code.coding[0].display} ${resource.valueQuantity.value} ${resource.valueQuantity.unit}`,
  );
if (!granted.includes("patient/MedicationRequest.rs"))
  console.log("   MedicationRequest scope not granted, so the app hides its medications section.");
const meds = await fhir(`MedicationRequest?patient=${tokens.patient}`);
console.log(`   (The server enforces it too: GET MedicationRequest -> ${meds.status})`);
const otherPatient = await fhir("Patient/999");
console.log(
  `   GET Patient/999, a different patient -> ${otherPatient.status}: patient/ scopes cover only the launch patient`,
);

const replay = await tokenRequest(codeExchange);
console.log(`8. Reuse the same code -> ${replay.status} ${(await replay.json()).error}: codes work only once`);

console.log("9. Later the access token expires. Use the refresh_token for a new one, with no user involved:");
const refreshed = await (
  await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token })
).json();
const again = await fhir(`Patient/${tokens.patient}`, refreshed.access_token);
console.log(`   new access_token ${short(refreshed.access_token)} -> GET Patient/${tokens.patient} ${again.status}`);
