# cerner-smart-app

The [Cerner SMART on FHIR tutorial](https://engineering.cerner.com/smart-on-fhir-tutorial/) app,
rebuilt with `fhirclient` v2 and FHIR R4. It shows a patient table (name, gender, birth date, age)
and the latest height, blood pressure, LDL and HDL. It supports an EHR launch (`launch.html`) and a
standalone patient launch (`launch-patient.html`).

It is separate from [apps/smart-app](../smart-app) (the SMART JS tutorial): its own service
(`cerner-smart-app`), its own port (5174) and its own pages.

## Where it stands

- Works with the SMART launcher (checked with patient Austin Franecki: patient table, height, BP and HDL shown).
- Unit tests, typecheck, build and lint pass.
- **Not yet run against Cerner's sandbox.** That needs the registration below.

## Map from the tutorial

The tutorial uses the old `fhir-client` v0.x, jQuery and DSTU2. This app keeps its pages, scopes
and element ids, and swaps in the current client and R4.

| Tutorial step | Here |
|---|---|
| launch.html, Request Authorization (Cerner rejects wildcard scopes) | [launch.html](launch.html), [src/authorize.ts](src/authorize.ts) |
| Access Token Retrieval, Access FHIR Resource (`FHIR.oauth2.ready(onSuccess, onError)`, `fetchAll`) | [src/app.ts](src/app.ts): `await ready()`, `client.request(..., { pageLimit: 0, flat: true })` |
| `byCodes`, `getBloodPressureValue`, `calculateAge` | [src/observations.ts](src/observations.ts), tested in [src/observations.test.ts](src/observations.test.ts) |
| Displaying the Resource | [index.html](index.html) (same element ids) |
| Standalone patient launch, launch-patient.html | [launch-patient.html](launch-patient.html), [src/launch-patient.ts](src/launch-patient.ts) |
| launch-smart-sandbox.html | not needed: the SMART launcher accepts any client id, so `launch.html` works for both |
| GitHub Pages hosting | skipped; runs locally on :5174 or at the Werkmeister host |
| MPages Integration (embedding in PowerChart) | not done; read it alongside crash course module 10 |

Blood pressure is searched under both the R4 panel code (`85354-9`) and the tutorial's DSTU2 one (`55284-4`).

## Run it with the SMART launcher

No registration needed.

```bash
pnpm install
pnpm --filter cerner-smart-app dev    # http://localhost:5174, fails if the port is taken
```

Open https://launch.smarthealthit.org, set **App Launch URL** to `http://localhost:5174/launch.html`,
click **Launch**, pick a patient.

## Register with Cerner (Oracle Health)

Code console: https://code.cerner.com/developer/smart-on-fhir/apps (the tutorial's link). Sign in
with a free CernerCare / Oracle Health account; you can create one from the sign-in page. Cerner is
now Oracle Health, so if the link has moved, search "Oracle Health code console". The link has not
been checked.

Click **+ New App** and fill in:

| Field | Value |
|---|---|
| App Name | anything, e.g. "cerner-smart-app (local)" |
| SMART Launch URI | `http://localhost:5174/launch.html` |
| Redirect URI | `http://localhost:5174/index.html` |
| App Type | Provider |
| FHIR Spec | **r4** (the tutorial says dstu2; this app uses R4) |
| Authorized | Yes |
| Standard Scopes | keep the required ones |
| User Scopes | none |
| Patient Scopes | Patient read, Observation read |

If the console rejects `http://localhost`, use the Werkmeister host instead:
`https://cerner-smart-app.local.sandbox.com/launch.html` and `.../index.html`, and run the app as a
Werkmeister workspace (run `werkmeister registry sync` first).

Click **Register**. The client id shows in a banner and on the app's details page. It is not a secret.

## Run it against Cerner

1. Create `apps/cerner-smart-app/.env.local` (git-ignored):
   ```
   VITE_CERNER_CLIENT_ID=<your client id>
   ```
   Without it the app sends `my_web_app`, which only the SMART launcher accepts.
2. Restart the dev server so Vite picks up the variable.
3. Wait up to 10 minutes after registering, then in the code console click **Begin Testing**.
4. Pick a patient, note the test username and password in the "Ready to launch" popup, click **Launch**.

## Standalone patient launch

1. Register a second app: App Type **Patient**, FHIR Spec **r4**, SMART Launch URI blank, same
   Redirect URI, Patient Scopes Patient read and Observation read.
2. Put that app's client id in `.env.local` instead and restart.
3. Open `http://localhost:5174/launch-patient.html`. It defaults to Cerner's R4 patient-access sandbox
   (`https://fhir-myrecord.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d`, not yet checked);
   add `?iss=<fhir server>` to use another server.

The tutorial says the patient test credentials are in the
[cerner-fhir-developers group](https://groups.google.com/forum/#!topic/cerner-fhir-developers/edPUbVPIag0).

## Exercises

- LDL is blank on the SMART launcher's Synthea patients, which record it as `18262-6`, not the
  tutorial's `2089-1`. Add it and see how code choice decides what a query finds.
- Open devtools > Network during a Cerner launch and compare the `authorize` and `token` requests
  with the SMART launcher's.
- Drop `patient/Observation.read` from the scope and see what fails.

## Commands

```bash
pnpm --filter cerner-smart-app dev        # dev server on :5174
pnpm --filter cerner-smart-app test       # node --test, observation and age helpers
pnpm --filter cerner-smart-app typecheck
pnpm --filter cerner-smart-app build
```
