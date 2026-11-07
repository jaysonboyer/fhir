# Glossary

Each entry names the module where the term is explained in full.

| Term | Meaning | Module |
|---|---|---|
| Access token | A string an app sends with each request to prove it has permission | 5 |
| ADT message | An HL7 v2 message about admission, discharge or transfer | 8 |
| ASTP/ONC | The US federal office that runs health IT certification | 7 |
| Asynchronous request | A request that starts a job; the result is collected later | 6 |
| Backend Services | The SMART flow for software with no user present | 5 |
| Base URL | The root web address of a FHIR server | 3 |
| Batch | A Bundle of requests processed independently | 3 |
| Binding | The link between an element and a value set, with a strength | 4 |
| Bulk Data / `$export` | The HL7 guide and operation for exporting many patients' data as files | 6 |
| Bundle | A resource that holds a list of other resources | 3 |
| C-CDA | An XML document format for clinical summaries | 1 |
| Canonical URL | A permanent web address identifying a profile, value set or other definition | 4 |
| CapabilityStatement | A resource describing what a server supports | 3 |
| Cardinality | How many times an element may appear, written `min..max` | 2 |
| Card | A piece of advice returned by a CDS service | 6 |
| CDS Hooks | The HL7 standard for EHRs to call decision-support services at workflow points | 6 |
| Chaining | Searching on an element of a referenced resource | 3 |
| CMS | The US agency whose rules govern many payers | 7 |
| Code system | A published list of codes with meanings, such as LOINC | 4 |
| Coding / CodeableConcept | One code / a set of codes for one idea, plus text | 2 |
| Composition | The first resource in a document Bundle | 6 |
| ConceptMap | A resource mapping codes between code systems | 4 |
| Conditional create / update | Create or update chosen by search criteria rather than id | 3 |
| Confidential client | An app that runs on a server and can keep a secret | 5 |
| Contained resource | A resource embedded in another, without its own identity | 2 |
| CRD, DTR, PAS | The three Da Vinci guides used for prior authorization | 7 |
| Da Vinci | A family of HL7 guides for payer–provider exchange | 4, 7 |
| Differential / snapshot | A profile's changes only / the full computed result | 4 |
| Discriminator | The element used to tell slices apart | 4 |
| EHR | Electronic health record system | 1 |
| EHR launch | A SMART launch started from inside the EHR | 5 |
| ETag / If-Match | HTTP headers used to prevent overwriting newer changes | 3 |
| Extension | An element added outside the base specification | 4 |
| FHIRPath | An expression language for selecting elements in resources | 3 |
| FMM (maturity level) | A 0 to 5 rating of how tested a resource is | 1 |
| FSH / SUSHI | A text language for writing profiles / the tool that compiles it | 4 |
| Granular scope | A SMART v2 scope with a search filter added | 5 |
| HL7 International | The organization that publishes FHIR and other health standards | 1 |
| HL7 v2 | An older pipe-delimited message standard | 1 |
| Hook | A defined workflow moment when an EHR calls a CDS service | 6 |
| HTI-1, HTI-5 | ONC rules (HTI-1 final; HTI-5 proposed) setting certification requirements | 7 |
| `id` | The server's local key for a record | 2 |
| Idempotent | Giving the same result when done more than once | 8 |
| `identifier` | A real-world business identifier with an issuing `system` | 2 |
| Implementation guide (IG) | A published narrowing of FHIR for a use case | 1, 4 |
| Inferno | ONC's open-source FHIR test suite | 7 |
| Information blocking | Practices that unreasonably interfere with health data access, prohibited by the Cures Act | 7 |
| Interaction | A kind of FHIR request: read, search, create, and so on | 3 |
| Interface engine | Software that receives, transforms and routes health messages | 8 |
| Invariant | A rule in a profile, written in FHIRPath | 4 |
| JWT / JWKS | A signed JSON message / a published set of public keys | 5 |
| Launch context | The patient, encounter and other records selected when an app launched | 5 |
| LOINC | The code system for tests and measurements | 4 |
| Manifest | The list of output files from a bulk export | 6 |
| Modifier element / modifier extension | An element or extension that changes the meaning of the record | 2, 4 |
| Must Support | An IG flag whose meaning that IG defines | 4 |
| Narrative | The human-readable HTML summary in a resource's `text` | 2 |
| NDJSON | A file format with one JSON record per line | 6 |
| Normative | Content HL7 promises to keep backward compatible | 1 |
| OAuth 2.0 | The web standard for granting apps limited access | 5 |
| Operation | A special action written with `$`, such as `$everything` | 3 |
| OperationOutcome | A resource listing errors and warnings | 3 |
| Optimistic locking | Checking for conflicting changes at write time instead of locking | 3 |
| Paging | Returning search results in pages linked by `next` | 3 |
| PKCE | A technique that stops stolen authorization codes being used | 5 |
| Prefetch | Data the EHR fetches for a CDS service before calling it | 6 |
| Profile | A StructureDefinition that restricts a resource | 4 |
| Public client | An app that cannot keep a secret, such as a browser app | 5 |
| QHIN | A network approved under TEFCA | 7 |
| R4, R4B, R5, R6 | FHIR releases | 1 |
| Reference | An element pointing to another resource | 2 |
| Refresh token | A token used to get new access tokens without logging in again | 5 |
| Resource | One FHIR record of one type | 1, 2 |
| REST | A style of web API using HTTP methods on record addresses | 3 |
| `_revinclude` / `_include` | Add resources that point to / are pointed to by the results | 3 |
| RxNorm | The US code system for medications | 4 |
| Scope | A permission an app asks for, such as `patient/Observation.rs` | 5 |
| Slicing | Separate rules for different items in a list | 4 |
| SMART App Launch | The HL7 guide for app authorization on FHIR | 5 |
| SNOMED CT | A clinical terminology for findings, problems and procedures | 4 |
| SQL on FHIR / ViewDefinition | A draft standard for turning FHIR into flat tables | 6 |
| Standalone launch | A SMART launch started outside the EHR | 5 |
| StructureDefinition | The resource type that defines profiles and extensions | 4 |
| Subscription / SubscriptionTopic | Mechanisms for servers to notify clients of changes | 6 |
| SVAP | ONC's process allowing newer standard versions voluntarily | 7 |
| TEFCA | The US national framework for exchange between networks | 7 |
| Terminology server | A FHIR server that answers questions about codes | 4 |
| Transaction | A Bundle of requests that succeed or fail together | 3 |
| UCUM | The code system for units of measure | 4 |
| UDAP | Certificate-based security practices for app registration and authentication | 5 |
| US Core | The US FHIR implementation guide for core clinical data | 7 |
| USCDI | ONC's list of data elements that must be exchangeable | 7 |
| `value[x]` | A choice element whose JSON name includes the chosen type | 2 |
| Value set | A selection of codes for a purpose | 4 |
