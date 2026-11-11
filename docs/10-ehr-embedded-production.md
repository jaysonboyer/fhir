# Module 10: Running SMART apps and CDS services against EHRs in production

Specifications to check against: https://cds-hooks.hl7.org/2.0/ (CDS Hooks 2.0, including
its security section), https://hl7.org/fhir/smart-app-launch/ (SMART App Launch 2.2.0),
https://hl7.org/fhir/uv/sdc/ (Structured Data Capture) and the vendor documentation at
https://fhir.epic.com/Documentation.

## Concepts

Modules 5 and 6 explain what the SMART and CDS Hooks specifications say. This module
covers what changes when a product built on them runs inside many health systems' EHRs
at once and has to stay up. A product like that has to be configured per health system,
cope with differences between EHR vendors, survive EHR upgrades, and fail visibly to its
own team before a clinician notices. Interviews for teams building such products
usually spend more time on these problems than on the specifications themselves.

Unless a claim names a source, it rests on general engineering practice and on the
specifications linked above. Claims about Epic rest on the searches listed at the end.

### The shape of an EHR-embedded product

Most products that embed in an EHR have the same four parts:

| Part | What it is | Spec |
|---|---|---|
| SMART app | A web app the EHR opens in a frame or embedded browser, with patient context | SMART App Launch |
| CDS service | A stateless HTTP service the EHR calls at workflow points, which returns cards | CDS Hooks |
| Product backend | The company's own system: eligibility rules, orders, results, status | none; internal |
| Integration configuration | Per-health-system settings: endpoints, client IDs, keys, code mappings | none; internal |

The SMART app and the CDS service are connected: a CDS card can carry a `smart` link
that opens the SMART app in context (module 6). A common pattern is a CDS card that
flags something at order entry, plus a SMART app that lets the clinician act on it
without leaving the EHR.

### One codebase, many health systems

Each health system is a separate **tenant**, meaning a customer whose configuration and
data must be kept separate from every other customer's. Even when every tenant runs the
same EHR vendor, the following differ per tenant and belong in configuration, not code:

- **FHIR base URL** (the `iss`) for each environment, such as test and production.
- **Client IDs.** EHR vendors and health systems issue client IDs per app and per
  environment, so one app has many.
- **Redirect URIs and launch URLs** registered with each tenant.
- **Keys.** The public keys (JWKS URL) registered for Backend Services, and the CDS
  client's keys your CDS service trusts.
- **Approved scopes.** A health system may approve fewer scopes than you request.
- **Identifier systems.** The `system` URI for medical record numbers differs per health
  system (module 2).
- **Code mappings.** EHR order catalogs often use local codes. Mapping them to your own
  test catalog is per-tenant work (module 4, ConceptMap).
- **Feature flags** to enable or disable a capability for one tenant without a deploy.

Two rules follow from this.

First, **identify the tenant from the request, then look it up in configuration.** For a
SMART launch, the tenant comes from `iss`. For a CDS call, it comes from the JWT's `iss`
and optional `tenant` claim and from `fhirServer`. Reject any value that is not in your
configuration. Accepting an unknown `iss` would let anyone point your app at a server
they control and have it send tokens there.

Second, **treat configuration as versioned, validated data.** Keep it in version control,
validate it at startup, and review changes like code. A wrong client ID or redirect URI
breaks a launch for every clinician at that site, so a configuration change is as risky
as a code change.

### EHR vendor differences

"EHR-agnostic" describes a goal, not a free property. The FHIR API is standard, but each
vendor implements a different subset of it:

- **Read support is broad, write support is narrow.** Most certified EHRs support
  reading the US Core resources (module 7). Far fewer resources accept `create` or
  `update`, and that differs by vendor. Check each vendor's documentation and
  CapabilityStatement before designing a flow that writes to the EHR.
- **Search parameters, `_include` and paging behave differently.** Test every query
  against each vendor's sandbox.
- **CDS Hooks support varies.** Epic's documentation lists support for three hooks:
  `patient-view`, `order-select` and `order-sign`. It also says that for both order hooks
  the EHR always sends `draftOrders`, and that apps registered as DSTU2 can only use
  `patient-view`. Other hooks in the CDS Hooks library may not be available in a given EHR.
- **Embedded browsers.** Epic's documentation says it has moved Hyperspace, the
  clinician desktop application, to a web-based framework called Hyperdrive. It says a
  health system embedding an app must list the launch URL's domain, every domain the
  app navigates to afterwards, and whether the app needs JavaScript or cookies, so they
  can be added to Epic's browser allowlist. A SMART app that redirects to an unlisted
  domain, such as a new identity provider or CDN (content delivery network), can fail at
  one site and work at another.
- **App distribution programs.** Epic's former App Orchard program was replaced. Trade
  press reports describe a customer-facing marketplace called Showroom, with Connection
  Hub as its entry tier, and a separate paid Vendor Services program for developers. That
  rests on 2023 news reports; check Epic's current terms before relying on it.

### CDS Hooks in production

Module 6 covered the request and the card. These details matter once a service is live.

**`order-select` versus `order-sign`.** Both send `draftOrders`, a Bundle of the unsigned
orders in the current ordering session. `order-select` also sends `selections`, the IDs
of the orders the clinician just chose, and the hook definition says decision support
should focus on those. `order-select` fires earlier, while the clinician is still
choosing, so it suits suggestions such as "this patient may be eligible for test X".
`order-sign` fires at the last step before signing, so it suits final checks. Firing
cards at both points for the same issue annoys clinicians.

**Alert fatigue.** Clinicians ignore tools that show too many cards. Return no cards
unless the advice is specific to this patient and this moment. Use `info` unless the
situation is genuinely urgent. Track how often each card is accepted or overridden using
the **feedback** endpoint, and treat a low acceptance rate as a defect.

**Authenticating the CDS client.** A CDS service receives PHI (protected health
information) and must check who is calling. In CDS Hooks 2.0 the CDS client sends a
signed JWT as a Bearer token on every request, including discovery. The service should:

- verify the signature against the client's public keys;
- trust only clients on an allowlist of `iss` and `jku` values, where `jku` is the URL
  of the client's public key set;
- check that `aud` equals the URL of the service endpoint being called;
- store each token's `jti` (a unique token ID) for a short time and reject repeats, to
  block replayed requests;
- return a generic error on failure, without saying why validation failed.

The search used for this module did not confirm the exact rules for the `kid` header and
the maximum `exp` lifetime, so read the specification's security section for those. Key
rotation is a common production failure: when a client publishes new keys, a service
that caches keys too long rejects every call.

**Prefetch can be missing or partial.** An EHR may not support every prefetch template,
and a query may return nothing. The service must then either fetch the data itself from
`fhirServer` using `fhirAuthorization`, if the client sent them, or return no cards. It
must never return an error just because prefetch was incomplete.

**Latency.** The clinician waits while the EHR waits for your response, and the EHR gives
up after a short timeout that it chooses. Do the work from prefetch, cache reference data
such as eligibility rules in memory, and set an internal deadline after which you return
`{ "cards": [] }`.

**Cards that act.** A card's `suggestions` propose FHIR changes the clinician can accept,
such as adding an order. When a card has suggestions, its `selectionBehavior` field says
whether the clinician may accept at most one (`at-most-one`) or any number (`any`). A
card's `links` can launch a SMART app, and a link's `appContext` passes extra context
from the card to the app. `overrideReasons` let the clinician give a reason for
dismissing a card, which comes back through feedback.

**Discovery IDs are part of the contract.** EHRs are configured against a service `id`.
Renaming one breaks every tenant using it, so add a new ID and retire the old one.

### Clinical workflow resources you will touch

Ordering, results and questionnaires use a group of resources that modules 2 to 4 only
mentioned. This table rests on the FHIR R4 resource definitions:

| Resource | Role in an ordering and results workflow |
|---|---|
| ServiceRequest | The order for a test or service. Carries the test code, priority, status, reason, requester and specimen. |
| Specimen | The sample collected. Links back to the ServiceRequest. |
| Task | Tracks the work of fulfilling an order between the placer and the filler, with its own status. Useful for order status that changes over time. |
| DiagnosticReport | The result report. Groups Observations and can carry a PDF. |
| Observation | Individual result values. |
| DocumentReference | A pointer to a document such as a PDF report. |
| Questionnaire / QuestionnaireResponse | A form, and a completed form. |
| RiskAssessment | A computed risk score or prediction about the patient. |
| Coverage | The patient's insurance, often needed to place an order. |

A few related terms:

- **Placer and filler.** The **placer** is the system that places an order, usually the
  EHR. The **filler** is the system that fulfills it, such as a reference lab. Each
  assigns its own order number, and both are kept as identifiers on the ServiceRequest.
  Keeping both is what lets status updates and results be matched to the right order.
- **HL7 v2 still carries most lab orders and results** between EHRs and outside labs in
  the US, as order and result messages. A FHIR ordering app may still hand off to a v2
  interface behind the scenes. That rests on general industry knowledge, not on a search
  done for this course.
- **Structured Data Capture (SDC)** is the HL7 implementation guide for advanced forms. Its
  `$populate` operation returns a QuestionnaireResponse with answers pre-filled from data
  the server already has, such as the patient's age or recent results. The current
  published version is STU 4, based on FHIR R4. Pre-filling forms from the record is what
  makes an ordering or risk-assessment form fast enough for clinicians to use.
- **Genomics and oncology guides.** HL7 publishes a Genomics Reporting implementation
  guide for genetic test results and mCODE for cancer data. Know they exist; study them
  only if the role works with that data.

### Production support and go-lives

A **go-live** is the day a health system turns a capability on for real clinicians. The
work around it is configuration, testing in the health system's environments, and fast
response to problems.

Common failures and what causes them:

| Symptom | Common causes |
|---|---|
| SMART launch shows an OAuth error | Redirect URI not registered for this tenant; wrong client ID for this environment; scope not approved |
| Launch works in the sandbox, fails at one site | Domain not on the embedded browser allowlist; cookies or storage blocked in the embedded browser; network rules at the health system |
| App loads with no patient | `launch` scope missing, or the launch parameter expired because the page was reloaded |
| Calls fail partway through a session | Access token expired and no refresh token was requested |
| Every CDS call is rejected | Client rotated its keys and the service cached old ones; clock difference makes valid tokens look expired |
| CDS cards stop appearing | Service timing out; EHR configuration changed; service `id` renamed |
| Data looks wrong after an EHR upgrade | Vendor changed a payload, a code, or a search behavior |

**Observability for this kind of product.**

- **Correlation IDs.** Log the `hookInstance` for every CDS call and a session ID for every
  SMART launch, together with the tenant, so one clinician's problem can be traced
  across systems.
- **No PHI in logs.** Log IDs, codes and timings, not names or results.
- **Metrics per tenant and per hook.** Track latency percentiles, error rate, timeout
  rate, the share of calls that return cards, and acceptance rate from feedback.
- **Synthetic monitoring.** Run a scripted launch and a scripted hook call on a schedule
  against each tenant's test environment, and alert when it fails. This repo's
  [Playwright launch test](../e2e/launch.spec.ts) is a starting point.
- **Fast off switches.** A per-tenant flag that makes the CDS service return no cards, or
  hides the SMART app, removes a broken capability without waiting for the health
  system to change its EHR configuration.

**A go-live checklist** usually covers: client IDs and keys for each environment, allowlist
entries, test patients in the health system's test environment, a scripted smoke test, a
runbook for the failures above, who is on call, and how to turn the capability off.

**EHR upgrades.** Each health system upgrades its EHR on its own schedule. A change that
breaks one tenant may appear months before it reaches the others, so regression tests
should run against each tenant's test environment after its upgrade.

### Testing strategy

| Layer | What it checks | Tools |
|---|---|---|
| Unit | Card logic and eligibility rules on fixture hook requests | Any test runner; this repo uses `node --test` |
| Contract | That your code handles each vendor's real payload shapes | Recorded synthetic payloads per vendor, replayed in tests |
| Sandbox | End-to-end launch and hooks against a real implementation | SMART launcher, CDS Hooks sandbox, vendor sandboxes such as Epic's and Oracle Health's |
| Synthetic monitoring | That production paths work right now, per tenant | Scheduled browser and HTTP checks with alerting |

## Read a real example

An `order-select` request body, shortened. Values are made up.

```json
{
  "hook": "order-select",
  "hookInstance": "d1577c69-dfbe-44ad-ba6d-3e05e953b2ea",
  "fhirServer": "https://ehr.example.org/fhir",
  "context": {
    "userId": "Practitioner/pr-1",
    "patientId": "pt-1",
    "encounterId": "enc-1",
    "selections": ["ServiceRequest/draft-2"],
    "draftOrders": {
      "resourceType": "Bundle",
      "type": "collection",
      "entry": [
        {
          "resource": {
            "resourceType": "ServiceRequest",
            "id": "draft-2",
            "status": "draft",
            "intent": "order",
            "code": { "text": "Example lab test" },
            "subject": { "reference": "Patient/pt-1" }
          }
        }
      ]
    }
  },
  "prefetch": {
    "patient": { "resourceType": "Patient", "id": "pt-1", "birthDate": "1960-04-02" }
  }
}
```

- `hookInstance` is the ID to log for tracing.
- `selections` points into `draftOrders`; advice should be about `draft-2`.
- `fhirServer` is present but `fhirAuthorization` is not, so this service cannot fetch
  more data and must decide from what it was sent.
- The ServiceRequest's `code` has only text. Real EHRs often send local codes, so
  matching it to a test catalog needs the tenant's code mapping.

## Try it: a coding track in this repo

These exercises build on [apps/cds-services](../apps/cds-services) and
[apps/smart-app](../apps/smart-app). Each one practices a section above. The repo
standards in [.werkmeister/standards](../.werkmeister/standards) apply.

1. **An `order-select` service.** Add a service that reads `selections` and
   `draftOrders`, applies a made-up eligibility rule, and returns an `info` card with a
   `smart` link to `smart-app`. Return no cards when the rule does not apply. Write unit
   tests with fixture requests, including one with no prefetch.
2. **CDS client authentication.** Generate a key pair, sign test JWTs with it, and make
   the service verify signature, allowlisted `iss` and `jku`, `aud`, `exp` and `jti`
   replay. Test a rotated key and an expired token.
3. **Tenant configuration.** Add a configuration file keyed by `iss`, validate it at
   startup, and make both apps reject unknown `iss` values.
4. **Logging and metrics.** Log `hookInstance`, tenant and latency for every call, with no
   PHI, and add an internal deadline that returns `{ "cards": [] }`.
5. **A pre-filled questionnaire.** In `smart-app`, show a short Questionnaire and fill
   answers from the patient's Patient and Observation records, which is what `$populate`
   does on a server.
6. **Synthetic monitoring.** Turn the Playwright launch test into a scheduled check that
   reports failures.

## Check yourself

1. Which settings vary per health system, and why should configuration be reviewed like code?
2. How do a SMART app and a CDS service each work out which tenant a request is for?
3. Why must a SMART app reject an unknown `iss`?
4. What is the difference between `order-select` and `order-sign`, and which suits an
   eligibility suggestion?
5. What should a CDS service check in the client's JWT?
6. What should a CDS service do when prefetch is missing?
7. What is the difference between a placer and a filler, and why keep both order numbers?
8. What does SDC `$populate` do, and why does it matter for clinicians?
9. A SMART app works in the sandbox but fails at one health system. What do you check?
10. What would you monitor for a CDS service, and how would you turn it off for one tenant?

## Sources for vendor and specification facts

Searches run 2026-11-08. These pages were reached through search-engine extracts, not
opened directly.

- Epic hooks supported: [Epic on FHIR, CDS Hooks documentation](https://fhir.epic.com/Documentation?docId=cds-hooks)
- Epic Hyperdrive and browser allowlist: [open.epic, Hyperdrive](https://open.epic.com/Hyperdrive);
  [Epic on FHIR documentation](https://fhir.epic.com/Documentation)
- Epic app programs: [Fierce Healthcare, Connection Hub](https://www.fiercehealthcare.com/health-tech/epic-plans-overhaul-its-app-market-opens-new-connection-hub-developers-here-are-key);
  [Fierce Healthcare, Showroom](https://www.fiercehealthcare.com/health-tech/epic-launches-new-showroom-website-3rd-party-apps-services)
- CDS Hooks client authentication: [CDS Hooks 2.0](https://cds-hooks.hl7.org/2.0/);
  [CDS Hooks security considerations](https://cds-hooks.org/security-considerations/)
- `order-select` context: [CDS Hooks Library, order-select](https://cds-hooks.hl7.org/hooks/order-select.html)
- SDC `$populate`: [SDC STU 4, populate](https://hl7.org/fhir/uv/sdc/en/populate.html)
- Lab ordering resources: [SNOMED LOINC guide, HL7 FHIR and laboratory data](https://docs.snomed.org/implementation-guides/loinc-implementation-guide/information-models-and-terminology-binding/5.3-hl7-fhir-and-laboratory-data)
