---
domain: smart
summary: SMART App Launch in the browser — let fhirclient run OAuth, ask for the narrowest scopes, keep tokens and patient context where the library puts them.
applies_to:
  - "apps/smart-app/**"
phase: [implement, review]
task_signatures:
  - "smart launch"
  - "smart on fhir"
  - "fhirclient"
  - "oauth2.authorize"
  - "scope"
  - "launch.html"
---

# SMART launch standard

How a browser app in this repo launches from an EHR (or the SMART launcher) and gets a
token. Spec: https://hl7.org/fhir/smart-app-launch/

## Rules

- **Let fhirclient run the OAuth flow.** `FHIR.oauth2.authorize()` on the launch page,
  `FHIR.oauth2.ready()` on the redirect page. It handles discovery
  (`.well-known/smart-configuration`), `state`, PKCE and the token exchange; a hand-rolled
  version gets one of those wrong.
- **Ask for the narrowest scopes that work.** `patient/*.read` is fine against the hosted
  launcher. For anything aimed at a real EHR, list resource scopes
  (`patient/Patient.read patient/MedicationRequest.read`) and add `launch` /
  `launch/patient`, `openid fhirUser` only when the code uses them.
- **The browser app is a public client.** No client secret in front-end code or `.env`
  files the bundler can inline; a secret shipped to the browser is public.
- **Patient and server come from the launch.** Read the patient from
  `client.patient.id` and the server from the launch's `iss`. Never take a patient id
  from your own query string, and never hardcode an `iss` outside a standalone-launch
  example.
- **Leave token storage to fhirclient.** It keeps state in `sessionStorage`. Don't copy
  tokens into `localStorage`, cookies or logs.

## Don't

- Don't call the FHIR server with `fetch` and a token you pulled out of the client; use
  `client.request()` so refresh and headers stay right.
- Don't widen scopes to make a 403 go away without saying which resource needed it.
