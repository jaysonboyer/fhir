---
domain: fhir-data
summary: Reading FHIR R4 data — search scoped to the patient, follow paging, resolve references in one call, match codes by system and code, expect missing elements, never log PHI.
applies_to:
  - "apps/**"
phase: [implement, review]
task_signatures:
  - "fhir"
  - "observation"
  - "medicationrequest"
  - "condition"
  - "bundle"
  - "loinc"
  - "snomed"
  - "rxnorm"
---

# FHIR data standard

How code in this repo reads FHIR resources, in an app or a CDS service. The servers
here are FHIR R4. Spec: https://hl7.org/fhir/R4/

## Rules

- **Scope every search to the patient.** `Observation?patient=<id>&code=...`, never an
  unscoped search filtered in code.
- **Follow paging.** A search returns a Bundle with a `next` link. Use
  `client.request(url, { pageLimit: 0, flat: true })` or follow `link[relation=next]`;
  reading only the first page silently drops data.
- **Resolve references in the same call.** `resolveReferences` (fhirclient) or
  `_include`, not one request per reference.
- **Match codes by system and code, never display text.** For example
  `http://loinc.org|85354-9` for blood pressure. Display strings vary by server.
- **Expect any element to be missing.** Cardinality `0..*` is the norm: `name`, `telecom`
  and `valueQuantity` can be absent or empty. Guard every read and show a fallback,
  don't throw.
- **No PHI in logs, fixtures or commits.** The sandboxes serve synthetic patients; keep
  it that way. Test fixtures are made-up resources.

## Don't

- Don't assume `name[0]` is the official name; check `use` when it matters.
- Don't parse a `Reference.display` to get data; follow `Reference.reference`.
