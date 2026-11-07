# Module 5: Security and SMART on FHIR

Specifications to check against: https://hl7.org/fhir/smart-app-launch/ (SMART App
Launch 2.2.0) and https://hl7.org/fhir/R4/security.html

## Concepts

### What problem this module covers

Module 3 showed how software requests data with HTTP. A real FHIR server holding real
patients answers only requests that carry proof of permission. The base FHIR
specification deliberately does not define how to get that proof. **SMART App Launch**
is the HL7 implementation guide that does, and it is the security model nearly every US
EHR uses for its FHIR API. This rests on US certification rules (module 7) requiring it.

The current published version is SMART App Launch 2.2.0. US certification rules have
referenced version 2.0.0 as the required baseline. Both facts rest on the searches
recorded in module 7.

### OAuth 2.0 in plain terms

SMART is built on **OAuth 2.0**, a general web standard for letting one piece of software
act on a user's behalf without seeing that user's password. The parts:

- The **client** is the app that wants data.
- The **authorization server** is the system that logs the user in and asks them to
  approve the app. In healthcare it is usually part of the EHR.
- The **resource server** is the FHIR server holding the data.
- An **access token** is a string the authorization server gives the client. The client
  sends it with each request in the header `Authorization: Bearer <token>`. The FHIR
  server checks it and allows or refuses the request.
- A **scope** is a permission written as text, such as "read this patient's
  observations". The app asks for scopes; the user and server decide which to grant.

SMART adds healthcare-specific pieces to OAuth: how the app learns which patient is
selected, scopes named after FHIR resources, and how the app finds the server's addresses.

### Step by step: the EHR launch

This is the flow the repo's app implements. The file names refer to
[apps/smart-app/src](../apps/smart-app/src).

1. **The EHR opens the app.** A clinician clicks the app inside the EHR. The EHR opens the
   app's launch page with two parameters: `iss` (the FHIR server's base URL) and
   `launch` (a short-lived value that identifies this particular launch).
   See [launch.ts](../apps/smart-app/src/launch.ts).
2. **Discovery.** The app requests `[iss]/.well-known/smart-configuration`, a JSON file
   that lists the server's `authorization_endpoint`, `token_endpoint` and supported
   features.
3. **Authorization request.** The app sends the browser to the `authorization_endpoint`
   with: `response_type=code`, its `client_id`, its `redirect_uri`, the requested
   `scope`, the `launch` value, a random `state` value, `aud` (the FHIR server URL), and
   PKCE values (below).
4. **The user approves.** The server may show a login and an approval screen. In an EHR
   launch, the clinician is usually already logged in.
5. **Redirect back with a code.** The server sends the browser back to the app's
   `redirect_uri` with a one-time `code` and the same `state`. The app checks that `state`
   matches what it sent, which protects against a forged redirect.
6. **Token exchange.** The app sends the `code` to the `token_endpoint` and receives a
   JSON response containing the `access_token`, `expires_in`, the granted `scope`, and
   **launch context**: for example `patient` (the selected patient's `id`) and
   `encounter`. It may also receive an `id_token` and a `refresh_token`.
   See [app.ts](../apps/smart-app/src/app.ts).
7. **FHIR requests.** The app calls the FHIR server with the access token.

### The standalone launch

In a **standalone launch**, the user opens the app directly, outside the EHR, for example
a patient opening a health app on a phone. There is no `launch` parameter. The app
already knows which server to use, and asks for the scope `launch/patient` so that the
server shows a patient picker (or, for a patient user, uses their own record). The rest of
the flow is the same.

### Public and confidential clients

- A **public client** cannot keep a secret: a browser app or a mobile app, whose code
  anyone can inspect. It authenticates with nothing but its `client_id` and PKCE.
- A **confidential client** runs on a server that can keep a secret. It proves its
  identity at the token step, either with a shared secret (**confidential symmetric**) or,
  preferably, by signing a JWT with a private key (**confidential asymmetric**). A JWT
  (JSON Web Token) is a signed JSON message.

The repo's app is a public client. Its data standard forbids putting a client secret in
browser code, because anything shipped to the browser can be read by anyone.

### PKCE

**PKCE** (Proof Key for Code Exchange, pronounced "pixy") prevents a stolen authorization
code from being used. The app creates a random secret value, sends a hash of it with the
authorization request (`code_challenge`, method `S256`), and sends the original value
with the token request (`code_verifier`). Only the app that started the flow knows the
original value. SMART 2.0 and later require PKCE with `S256`. This rests on the SMART 2.0
change list.

### Scopes

Scopes have three parts: **context**, **resource type**, and **permissions**.

- Context `patient/` means data about the patient in context.
- Context `user/` means anything the logged-in user is allowed to see.
- Context `system/` means access for a backend service with no user (below).

SMART version 1 wrote permissions as `.read` or `.write`. SMART version 2 writes them as
letters, any combination of `c` (create), `r` (read), `u` (update), `d` (delete) and
`s` (search):

| Version 1 | Version 2 equivalent |
|---|---|
| `patient/Observation.read` | `patient/Observation.rs` |
| `user/*.read` | `user/*.rs` |
| `patient/MedicationRequest.write` | `patient/MedicationRequest.cud` |

Version 2 also allows **granular scopes** that add a search filter, for example:

```
patient/Observation.rs?category=http://terminology.hl7.org/CodeSystem/observation-category|laboratory
```

which allows reading only lab results.

Other scopes to know:

| Scope | Meaning |
|---|---|
| `launch` | This is an EHR launch; give me the launch context |
| `launch/patient` | Standalone launch; ask the user to choose a patient |
| `openid fhirUser` | Give me an `id_token` saying who the user is, including a link to their Practitioner or Patient record |
| `offline_access` | Give me a refresh token that works after the user closes the app |
| `online_access` | Give me a refresh token that works only while the user is logged in |

A good interview point, also in the repo's SMART standard: ask for the narrowest scopes
that work. Asking for `patient/*.read` is convenient in a test environment but a real EHR
may refuse it, and broad access is a privacy risk.

### Refresh tokens

Access tokens expire, often after about an hour; the exact time is up to the server. A
**refresh token** lets the app get a new access token without sending the user through
the login again. Refresh tokens are sensitive and must be stored securely.

### Backend Services: system-to-system access

Some software has no user present, such as a nightly data export. **SMART Backend
Services**, defined in the same guide, handles this:

1. The service creates a public/private key pair and registers the public key (or a URL
   of its public keys, called a **JWKS URL**) with the server ahead of time.
2. To get a token, it signs a short JWT with its private key and sends it to the token
   endpoint using the OAuth `client_credentials` grant, with
   `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`.
3. The server checks the signature and returns an access token with `system/` scopes.

There is no browser, no user and no refresh token; the service requests a new token when
the old one expires. Bulk data export (module 6) normally uses this flow.

### Other security topics interviewers raise

- **Transport security.** All FHIR traffic with real data must use HTTPS (TLS).
- **Auditing.** FHIR has an **AuditEvent** resource for recording who accessed what, and
  a **Provenance** resource for recording where data came from and who changed it.
- **Consent.** The **Consent** resource records a patient's choices about data sharing,
  although enforcing consent is mostly left to each system.
- **HIPAA.** The US privacy law governing health data. The "minimum necessary" idea in
  HIPAA is the legal reason for asking for narrow scopes.
- **UDAP.** A set of security practices using certificates for app registration and
  authentication, published by HL7 as an implementation guide. Search results indicate
  that TEFCA's FHIR exchange uses it (module 7). That claim rests on a search extract,
  not a source read in full.
- **Token storage in a browser.** The fhirclient library keeps state in
  `sessionStorage`. Copying tokens into `localStorage`, cookies or logs makes them easier
  to steal; the repo's standard forbids this.

## Read a real example

A token response, as the authorization server sends it in step 6. Values are made up.

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "launch openid fhirUser patient/Patient.rs patient/Observation.rs",
  "id_token": "eyJhbGciOi...",
  "refresh_token": "a1b2c3...",
  "patient": "123",
  "encounter": "enc-456",
  "need_patient_banner": false
}
```

- `scope` is what was **granted**, which can be less than what was requested. Apps must
  check it rather than assume.
- `patient` and `encounter` are the launch context: the `id`s of the records the
  clinician had open.
- `need_patient_banner: false` tells the app the EHR already shows the patient's name, so
  the app need not repeat it.

## Try it

These need the SMART launcher, which runs in a browser. They were not tested from the
environment this course was written in.

1. Open https://launch.smarthealthit.org. Choose **Provider EHR Launch**, pick a patient,
   and set the **App Launch URL** to one of the sample apps the page offers.
2. Open your browser's developer tools (F12), go to the **Network** tab, then launch.
   Find these requests in order: `.well-known/smart-configuration`, `authorize`, `token`.
3. Click the `token` request and read its response. Find `access_token`, `scope` and
   `patient`.
4. If you can run this repo, follow the steps in the repo [README](../README.md) section
   "SMART app launch" and do its exercises, which include removing a scope and seeing
   what fails.

## Check yourself

1. What does SMART App Launch add to OAuth 2.0?
2. Walk through the EHR launch in seven steps.
3. What is the difference between an EHR launch and a standalone launch?
4. What is a public client, and why can it not hold a secret?
5. What does PKCE prevent, and how?
6. Translate `patient/Observation.read` to SMART v2 and explain the letters.
7. What is the difference between `patient/`, `user/` and `system/` scopes?
8. How does a backend service get a token without a user?
9. Why should an app check the granted `scope` in the token response?
