# fhir repo standards

Standards for this repo's code only. Werkmeister loads them on top of the global tree
(`overrides.standards_dir`) in any workspace that checks this repo out. Same layout and
frontmatter as the global tree; check them with `werkmeister standards check`.

| Domain | Covers |
|---|---|
| `smart` | SMART App Launch: OAuth with fhirclient, scopes, tokens, patient context |
| `fhir-data` | Reading FHIR R4 resources: search, paging, references, codes, missing data, PHI |
| `cds-hooks` | CDS Hooks services: discovery, prefetch, card shape, CORS |
