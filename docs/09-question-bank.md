# Module 9: Question bank with answers

## How to use this file

Answer each question out loud before reading the answer. Mark any question where your
answer missed a point, and return to it the next day. The answers are short on purpose:
they are the points an interviewer listens for, not a script.

## Module 1: What FHIR is

**1. What is FHIR?**
FHIR is an HL7 standard that represents health data as small, typed records called
resources, in JSON or XML, and defines a web API for reading and writing them. It is built
on ordinary web technology, so general web developers can use it.

**2. How do HL7 v2, C-CDA and FHIR differ?**
v2 is pipe-delimited event messages, mostly inside hospitals. C-CDA is whole XML
documents, mostly between organizations. FHIR is individual resources available over a
REST API, and also supports messages, documents and notifications.

**3. Why do most systems use R4?**
US regulations reference R4-based guides, and major EHR vendors built their APIs on R4.
Changing versions requires changing every connected system, so adoption follows
regulation.

**4. What do normative and maturity level mean?**
Normative content is promised to stay backward compatible. Maturity level (FMM 0 to 5)
shows how much real-world testing a non-normative resource has had.

**5. What is an implementation guide?**
A published set of profiles, extensions, value sets and rules that narrows FHIR for a
country or use case, such as US Core. Real systems must conform to the guides their rules
or partners require, so most work depends on one.

## Module 2: Resources and data types

**1. `id` versus `identifier`?**
`id` is the server's local key, used in the URL. `identifier` holds real-world business
identifiers with a `system`. Match across systems on `identifier`.

**2. What does `0..*` mean?**
Optional, any number. Code must expect the element to be missing or empty.

**3. Two modifier elements?**
`Observation.status = entered-in-error` (the result is invalid) and
`AllergyIntolerance.verificationStatus = refuted` (the allergy does not exist). Ignoring
them shows wrong clinical facts.

**4. `Coding` versus `CodeableConcept`?**
A `Coding` is one code from one system. A `CodeableConcept` holds several codings for the
same idea plus text, so different systems can each use a code they understand.

**5. Three forms of `Reference`?**
Relative (`Patient/123`), absolute (a full URL on another server), contained (`#id`).
A reference can also carry only an identifier.

**6. What is `value[x]`?**
A choice element. In JSON the `[x]` becomes the type name, such as `valueQuantity`, and
only one form appears.

**7. Why match on `system` and `code`?**
Display text varies between servers and languages. The system-and-code pair is the stable
meaning.

## Module 3: REST and search

**1. Main interactions?**
read and vread (GET), search (GET with parameters), create (POST to the type), update
(PUT to an id), patch (PATCH), delete (DELETE), history (GET `_history`), capabilities
(GET `metadata`), batch and transaction (POST a Bundle to the base).

**2. `POST /Patient` versus `PUT /Patient/123`?**
POST creates with a server-assigned id. PUT replaces the record at that id, and may
create it if the server allows client-assigned ids.

**3. CapabilityStatement?**
The server's description of its version, resources, interactions, search parameters and
security. Read it first because no server supports everything.

**4. `ETag` and `If-Match`?**
The server returns the version in `ETag`. The client sends it in `If-Match` on update. If
the record changed since, the server returns 412 and nothing is overwritten.

**5. Conditional create?**
`If-None-Exist` with search criteria creates the record only if no match exists, which
prevents duplicates on retry.

**6. Search parameter types and token syntax?**
string, token, reference, date, number, quantity, uri, composite, plus special. A token is
`system|code`.

**7. Chaining versus `_include`?**
Chaining filters results by an element of a referenced resource. `_include` adds
referenced resources to the results. One filters, the other adds.

**8. Why follow `next` links?**
Results are paged. Reading only the first page silently loses data.

**9. Batch versus transaction?**
Batch entries succeed or fail independently. A transaction succeeds or fails as a whole,
and its entries can reference each other with `urn:uuid` placeholders.

**10. Three operations?**
`$everything` (all data for a patient), `$export` (bulk export), `$validate` (check
against profiles).

## Module 4: Profiles, extensions, terminology

**1. What can a profile do?**
Restrict cardinality, limit codes, fix values, add extensions and rules. It cannot loosen
the base, so profiled data always conforms to the base.

**2. Differential and snapshot?**
The differential lists the profile's changes. The snapshot is the full computed result.

**3. Must Support?**
A flag whose meaning each implementation guide defines. In US Core it means, roughly,
send the element when the data exists and be able to process it.

**4. Slicing?**
A way to set separate rules for different items in a list, told apart by a discriminator
element, such as systolic and diastolic components of blood pressure.

**5. Extension versus modifier extension?**
An unknown extension can be ignored. An unknown modifier extension changes meaning, so it
cannot be ignored safely.

**6. Code systems?**
Lab test: LOINC. Billing diagnosis: ICD-10-CM. Medication: RxNorm. Vaccine: CVX. Unit: UCUM.

**7. Binding strengths?**
Required (must use), extensible (use if one fits), preferred (recommended), example
(illustration only).

**8. `$expand` and `$translate`?**
`$expand` lists the codes in a value set. `$translate` maps a code to another system
using a ConceptMap.

## Module 5: Security and SMART

**1. What does SMART add to OAuth?**
Launch context (which patient and encounter), FHIR-based scopes, discovery through
`.well-known/smart-configuration`, and a backend services profile.

**2. EHR launch steps?**
EHR opens the app with `iss` and `launch`; app reads smart-configuration; app redirects to
authorize with scopes, state, `aud` and PKCE; user approves; server redirects back with a
code; app exchanges the code for a token plus patient context; app calls FHIR with the
token.

**3. EHR versus standalone?**
EHR launch starts inside the EHR with a `launch` value and existing context. Standalone
starts outside, with `launch/patient` to choose a patient.

**4. Public client?**
An app whose code runs on the user's device, such as a browser or phone app. Anyone can
read its code, so a secret in it would not be secret.

**5. PKCE?**
Prevents a stolen authorization code from being used. The app sends a hash first and the
original value at token exchange; only the app knows the original.

**6. `patient/Observation.read` in v2?**
`patient/Observation.rs`: read and search. The letters are c, r, u, d, s for create,
read, update, delete, search.

**7. `patient/`, `user/`, `system/`?**
Data about the patient in context; data the logged-in user can access; access for a
backend service with no user.

**8. Backend services?**
The service registers a public key, signs a JWT with its private key, and exchanges it
for a token with the `client_credentials` grant.

**9. Why check granted scope?**
The server or user may grant less than requested, and the app must not call what it is
not allowed to.

## Module 6: Bulk, CDS Hooks, subscriptions

**1. Why asynchronous export?**
Large exports take minutes or hours; a normal request would time out.

**2. `$export` flow?**
Kick-off with `Prefer: respond-async`; 202 with a status URL; poll; 200 with a manifest;
download NDJSON files; optionally DELETE the status URL.

**3. NDJSON?**
One resource per line. Files can be processed line by line without loading a huge Bundle.

**4. Incremental export?**
Pass the previous manifest's `transactionTime` as `_since`.

**5. Hooks?**
Defined workflow points where the EHR calls a CDS service: `patient-view`, `order-select`,
`order-sign`.

**6. Prefetch?**
Data the service declares it needs; the EHR fetches and sends it with the call, so the
service answers quickly without its own FHIR calls.

**7. Card parts?**
`summary`, `indicator`, `source`, optional `detail`, `suggestions` (one-click actions) and
`links`. A `smart` link launches a SMART app.

**8. Subscriptions R4 to R5?**
R4 uses free-form search criteria; R5 uses server-defined SubscriptionTopics. The
Subscriptions Backport guide brings topics to R4.

## Module 7: Regulations

**1. USCDI versus US Core?**
USCDI lists what data must be exchangeable. US Core says how to represent it in FHIR R4.

**2. Baseline versus SVAP?**
The baseline is required for certification. SVAP lists newer versions developers may
adopt voluntarily.

**3. (g)(10)?**
Requires certified EHRs to offer a FHIR R4 API per US Core, secured with SMART, with bulk
export for populations. Inferno tests it.

**4. CMS-0057-F APIs?**
Patient Access (adding prior authorization data), Provider Access, Payer-to-Payer and
Prior Authorization. Due 1 January 2027 for most affected payers.

**5. CRD, DTR, PAS?**
CRD asks the payer at order time through CDS Hooks; DTR collects documentation in a
SMART app using Questionnaires; PAS submits the request.

**6. TEFCA and QHIN?**
A national framework for exchange between networks; a QHIN is an approved network. It is
moving to FHIR in four stages.

## Module 8: Design

See the worked questions in module 8. The check-yourself answers:

1. Clarify, actors and data, access pattern, security, data quality, failure and scale,
   trade-offs.
2. When no user is present, such as a scheduled export.
3. It finds the existing record by business identifier, so repeated messages update
   rather than duplicate.
4. Doing it twice gives the same result. Feeds resend messages.
5. Incremental exports may not report deleted records, so a periodic full export is
   needed to reconcile.
6. Server differences, patient matching, local codes, paging and rate limits, modifier
   elements, partial dates.

## Module 10: Running SMART apps and CDS services in production

**1. What varies per health system?**
FHIR base URL, client IDs per environment, redirect URIs, keys, approved scopes,
identifier systems, code mappings and feature flags. A wrong value breaks every launch at
that site, so a configuration change carries the same risk as a code change.

**2. How is the tenant identified?**
SMART app: from `iss` at launch. CDS service: from the JWT's `iss` and optional `tenant`
claim, and `fhirServer`. Both are looked up in configuration.

**3. Why reject an unknown `iss`?**
Otherwise anyone could launch the app against a server they control and receive the
tokens and data the app sends there.

**4. `order-select` versus `order-sign`?**
`order-select` fires while the clinician is choosing orders and sends `selections`;
`order-sign` fires at the final step. An eligibility suggestion fits `order-select`.

**5. JWT checks?**
Signature against the client's keys, `iss` and `jku` on an allowlist, `aud` equal to the
endpoint URL, expiry, and `jti` replay. Return a generic error on failure.

**6. Missing prefetch?**
Fetch from `fhirServer` with `fhirAuthorization` if provided; otherwise return no cards.
Never return an error for it.

**7. Placer and filler?**
The placer orders, usually the EHR; the filler fulfills, such as a lab. Each assigns an
order number; keeping both lets status and results match the right order.

**8. `$populate`?**
Returns a QuestionnaireResponse pre-filled from data the server has. It saves clinicians
from retyping data the EHR already holds.

**9. Works in sandbox, fails at one site?**
Redirect URI and client ID for that tenant and environment, approved scopes, browser
allowlist domains and cookie needs, network rules, and the site's EHR version.

**10. Monitoring and off switch?**
Per tenant and hook: latency percentiles, errors, timeouts, card rate, acceptance rate,
plus scheduled synthetic launches and hook calls. A per-tenant flag that returns no cards
turns it off without waiting for the health system.

## Mock interview

Run this as a timed session of about 45 minutes. Ask a friend to read the questions, or
read each one, look away, and answer out loud. Record it if you can.

**Warm-up (5 minutes)**
1. Tell me what FHIR is, as if I were a new engineer on the team.
2. What version of FHIR would you use for a new US project, and why?

**Fundamentals (15 minutes)**
3. Here is a Patient resource. (Use the example in module 1.) Walk me through it.
4. How would you find all of a patient's lab results from this year, with their reports?
   Write the request.
5. A search returns 50 results but the total says 2,000. What is happening?
6. Two systems both have this patient. How do you know they are the same person?
7. What is the difference between a profile and an extension?

**Security (10 minutes)**
8. Walk me through how a SMART app gets data for the patient a clinician has open.
9. Our app gets a 403 on MedicationRequest. What do you check?
10. How would a nightly job get access without a user?

**Design (15 minutes)**
11. Design a system that sends a weekly file of all our diabetic patients' latest A1c
    results to a quality-reporting partner.
12. Our CDS service is timing out in the EHR. What do you do?

### Answer notes for the mock interview

- **2.** R4, because US Core and certification require it and vendors serve it; mention R5
  exists and R6 is in ballot.
- **4.** `Observation?patient=<id>&category=laboratory&date=ge2026-01-01` and
  `DiagnosticReport?patient=<id>&category=LAB&date=ge2026-01-01`, or include results from
  DiagnosticReport with `_include=DiagnosticReport:result`. Follow paging.
- **5.** Paging; follow the `next` links.
- **6.** Compare identifiers with the same `system`; never `id`. Use demographics and
  `$match` where there is no shared identifier.
- **9.** The granted `scope` in the token response; whether the app requested
  MedicationRequest; whether the user has access; the CapabilityStatement; do not just
  widen scopes.
- **10.** SMART Backend Services with `system/` scopes.
- **11.** Clarify the cohort definition (which codes define diabetes, which LOINC codes
  define A1c). Backend Services plus Group `$export` with `_type=Patient,Condition,Observation`
  and `_typeFilter` for the A1c code, or a Group of diabetic patients maintained by the
  EHR. Pick the latest Observation per patient, skip `entered-in-error`, map to the
  partner's format, validate, send securely, and log what was sent.
- **12.** Module 8, worked question 5.

The LOINC code commonly used for hemoglobin A1c is `4548-4`; check it on loinc.org before
relying on it.
