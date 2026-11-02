---
domain: cds-hooks
summary: CDS Hooks services — stable discovery, declared prefetch, an empty card list for no advice, well-formed cards, CORS on every response.
applies_to:
  - "apps/cds-services/**"
phase: [implement, review]
task_signatures:
  - "cds hooks"
  - "cds-hooks"
  - "cds service"
  - "patient-view"
  - "order-select"
  - "order-sign"
  - "prefetch"
  - "card"
---

# CDS Hooks standard

How a CDS service in this repo answers an EHR. Spec: https://cds-hooks.hl7.org/

## Rules

- **Discovery lists every service.** `GET /cds-services` returns each service's `hook`,
  `id`, `description` and `prefetch`. An `id` is part of the URL EHRs call; never
  rename one in place.
- **Declare what you read as prefetch.** Use templates such as
  `Patient/{{context.patientId}}`. If prefetch is missing, either fetch it from
  `fhirServer` with `fhirAuthorization` or return no cards, and never fail the request.
- **No advice is `{ "cards": [] }`, not an error.** A non-2xx response shows up in the EHR
  as a broken service.
- **Cards are well-formed.** `summary` under 140 characters, `indicator` one of `info`,
  `warning`, `critical`, and `source.label` set.
- **Answer fast.** EHRs time a hook out after a few hundred milliseconds. Do the work
  from prefetch; don't chain FHIR calls on the request path.
- **CORS on every response, including errors and `OPTIONS`.** The CDS Hooks sandbox calls
  the service from the browser.
- **Reject a bad body with 400.** Parse the JSON and validate `hook`, `context` before
  using them.

## Don't

- Don't put PHI from the request into logs.
