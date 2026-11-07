# fhir

Playground for learning to build SMART on FHIR apps and CDS Hooks services.
pnpm + Turborepo monorepo; set up for [Werkmeister](../werkmeister) workspaces.

| App | What it is | Tutorial it follows |
|---|---|---|
| [apps/smart-app](apps/smart-app) | Browser app that does a SMART EHR launch and reads the patient's data | SMART JS tutorial, Cerner SMART tutorial |
| [apps/cds-services](apps/cds-services) | CDS Hooks service that returns cards to an EHR | Cerner CDS Services tutorial |

## Run it

```bash
pnpm install
pnpm dev     # smart-app on http://localhost:5173, cds-services on http://localhost:3000
pnpm test
```

Or as a Werkmeister workspace (`werkmeister workspace new`, services `smart-app` and/or
`cds-services`), served at `https://smart-app.local.sandbox.com` and
`https://cds-services.local.sandbox.com`. The fragment is
[.werkmeister/services.yaml](.werkmeister/services.yaml); after editing it run
`werkmeister registry sync`.

## Interview crash course

[crash-course/](crash-course/README.md) is a ten-day study plan for a FHIR technical
interview: concepts, worked examples, exercises, a question bank and a mock interview.
It uses the apps below as hands-on material.

## Learning path

Docs hub: https://docs.smarthealthit.org/

### 1. SMART app launch — [SMART JS tutorial](https://docs.smarthealthit.org/tutorials/javascript/)

`apps/smart-app` is where this tutorial ends up. Read the two files in order:

1. [src/launch.ts](apps/smart-app/src/launch.ts) — the EHR opens `launch.html?iss=…&launch=…`;
   `FHIR.oauth2.authorize()` finds the server's OAuth endpoints and redirects to log in.
2. [src/app.ts](apps/smart-app/src/app.ts) — OAuth redirects back to `index.html?code=…`;
   `FHIR.oauth2.ready()` gets the token, then the app reads FHIR resources.

Try it: run `pnpm dev`, open https://launch.smarthealthit.org, set **App Launch URL** to
`http://localhost:5173/launch.html`, click **Launch**, pick a patient.

Exercises:
- Open devtools > Network and follow the redirects: `.well-known/smart-configuration`,
  `authorize`, `token`. Decode the `id_token` at jwt.io.
- Add the patient's latest blood pressure (`Observation?code=http://loinc.org|85354-9`).
- Change `scope` to drop `patient/*.read` and see what fails.
- Switch the launcher to **Provider Standalone Launch** and launch with
  `launch.html?iss=<the launcher's FHIR URL>`.

### 2. A real EHR sandbox — [Cerner SMART tutorial](https://engineering.cerner.com/smart-on-fhir-tutorial/)

Same flow against Oracle Health (Cerner). The tutorial uses the old `fhir-client` v0.x and
DSTU2; skip its code and map the concepts onto `apps/smart-app` (its callback-style
`FHIR.oauth2.ready(onSuccess, onError)` is now a promise, and `smart.patient.api.fetchAll`
is now `client.request(..., { pageLimit: 0 })`). What's new here is
registering the app in the Cerner code console to get a real `clientId` and redirect URI.

### 3. CDS Hooks — [Cerner CDS Services tutorial](https://github.com/cerner/cds-services-tutorial)

`apps/cds-services` implements the tutorial's `patient-greeting` service with plain
`node:http`: [src/server.ts](apps/cds-services/src/server.ts).

Try it: `pnpm dev`, open https://sandbox.cds-hooks.org, **Settings > Add CDS Services**,
enter `http://localhost:3000/cds-services`. The Patient View shows a "Hello …" card.

Exercises:
- Add the tutorial's second service, on the `order-select` hook, that echoes the selected medication.
- Return a card with a `suggestions` action or an app `links` entry that launches `smart-app`.

### 4. Your own SMART server — [Server quick start](https://docs.smarthealthit.org/tutorials/server-quick-start/)

Not wired up yet. Next step once 1–3 make sense: run a SMART-enabled FHIR server locally
(the SMART launcher in Docker) instead of the hosted one.
