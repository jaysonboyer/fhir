# fhir

Playground for learning to build SMART on FHIR apps and CDS Hooks services.
pnpm + Turborepo monorepo; set up for [Werkmeister](../werkmeister) workspaces.

| App | What it is | Tutorial it follows |
|---|---|---|
| [apps/smart-app](apps/smart-app) | Browser app that does a SMART EHR launch and reads the patient's data | SMART JS tutorial |
| [apps/cerner-smart-app](apps/cerner-smart-app) | The Cerner tutorial's app: patient table plus latest height, BP, LDL, HDL; EHR and standalone patient launch | Cerner SMART tutorial |
| [apps/cds-services](apps/cds-services) | CDS Hooks service that returns cards to an EHR | Cerner CDS Services tutorial |
| [apps/cds-services-java](apps/cds-services-java) | The same CDS Hooks service in Java / Spring Boot (needs JDK 25) | Cerner CDS Services tutorial |
| [apps/bulk-export](apps/bulk-export), [apps/subscriptions](apps/subscriptions), [apps/rest-semantics](apps/rest-semantics), [apps/v2-to-fhir](apps/v2-to-fhir), [apps/validation](apps/validation), [apps/sql-on-fhir](apps/sql-on-fhir) | Small demos of common FHIR patterns; see [Crash course demos](#crash-course-demos) | Crash course |

## Run it

```bash
pnpm install
pnpm dev     # smart-app on :5173, cerner-smart-app on :5174, cds-services on :3000, cds-services-java on :3001,
             # bulk-export on :3002, subscriptions on :3003, rest-semantics on :3004
pnpm test
```

Or as a Werkmeister workspace (`werkmeister workspace new`, services `smart-app`, `cerner-smart-app`,
`cds-services`, `cds-services-java`), each served at `https://<service>.local.sandbox.com`. The fragment is
[.werkmeister/services.yaml](.werkmeister/services.yaml); after editing it run
`werkmeister registry sync`.

## Interview crash course

[crash-course/](crash-course/README.md) is a seven-day study plan for a FHIR technical
interview, aimed at an experienced engineer: concepts, worked examples, a question bank,
a mock interview, and a module on running SMART apps and CDS services in production
with a coding track that extends the apps below.

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

Same flow against Oracle Health (Cerner), in its own app. Everything (tutorial-to-code map, code
console registration, running against Cerner, exercises) is in
[apps/cerner-smart-app/README.md](apps/cerner-smart-app/README.md).

### 3. CDS Hooks — [Cerner CDS Services tutorial](https://github.com/cerner/cds-services-tutorial)

`apps/cds-services` implements the tutorial's `patient-greeting` service with plain
`node:http`: [src/server.ts](apps/cds-services/src/server.ts).

Try it: `pnpm dev`, open https://sandbox.cds-hooks.org, **Settings > Add CDS Services**,
enter `http://localhost:3000/cds-services`. The Patient View shows a "Hello …" card.

[apps/cds-services-java](apps/cds-services-java/src/main/java/dev/fhirplayground/cds/CdsServicesApplication.java)
is a line-for-line Spring Boot port; read it next to `server.ts`. Use
`http://localhost:3001/cds-services` in the sandbox to try it.

Exercises:
- Add the tutorial's second service, on the `order-select` hook, that echoes the selected medication.
- Return a card with a `suggestions` action or an app `links` entry that launches `smart-app`.

### Crash course demos

Self-contained demos for the [crash course](crash-course/README.md). No network needed (except
`validation`). Servers are fake, in-memory FHIR servers; each client prints every step. Start the server
with `pnpm --filter <app> dev`, then run `pnpm --filter <app> demo` in a second terminal. Apps without a
server only need `demo`.

| App | Module | Shows |
|---|---|---|
| `v2-to-fhir` (no server) | 1, 8 | HL7 v2 ORU message to a FHIR transaction Bundle, local codes to LOINC |
| `rest-semantics` | 3 | ETag/If-Match conflicts, conditional create, transaction vs batch, paging |
| `validation` (no server) | 4 | Official HL7 validator on a good and a bad US Core Patient (needs Java; downloads ~200 MB) |
| `bulk-export` | 5, 6 | SMART Backend Services token, then Group `$export`: poll, manifest, NDJSON, cleanup |
| `subscriptions` | 6 | R4 criteria `rest-hook` (`demo`) and R5 Backport topic-based (`demo:topic`) notifications |
| `sql-on-fhir` (no server) | 6 | ViewDefinitions flattening bulk NDJSON into tables |

### 4. Your own SMART server — [Server quick start](https://docs.smarthealthit.org/tutorials/server-quick-start/)

Not wired up yet. Next step once 1–3 make sense: run a SMART-enabled FHIR server locally
(the SMART launcher in Docker) instead of the hosted one.
