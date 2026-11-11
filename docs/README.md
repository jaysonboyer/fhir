# FHIR crash course for a technical interview

This folder is a study plan for learning FHIR quickly enough to pass a technical
interview. FHIR (Fast Healthcare Interoperability Resources) is a standard from the
organization HL7 that defines how healthcare software represents medical data as
JSON or XML records and exchanges those records over web APIs.

## What this plan assumes

These assumptions shape the plan. If one is wrong, the "Adjusting the plan" section
below says what to change.

- **You are an experienced software engineer who is new to FHIR.** You already know
  REST, HTTP, OAuth 2.0 and JSON. The course still explains them in FHIR terms, so you
  can skim those parts.
- **The interview may include code and system design.** Expect to explain the standard,
  read FHIR JSON, design an integration out loud, and possibly write code against a FHIR
  API or a CDS Hooks request. Module 10 includes a coding track in this repo for that.
- **The role builds products that run inside EHRs.** Module 10 covers running SMART
  apps and CDS services in production across many health systems. If the role is
  something else, see "Adjusting the plan".
- **The job is in the United States.** US regulations decide which FHIR features
  companies actually build, so module 7 covers them. If the job is outside the US,
  skip most of module 7.
- **The systems you will hear about use FHIR version R4.** This rests on the version
  research in module 7: R4 is what US regulations require and what large EHR vendors
  serve, even though newer versions exist.

## How each module is built

Every module has the same four parts, so you always know where you are.

1. **Concepts.** The ideas, each with what it rests on.
2. **Read a real example.** A short JSON or HTTP example with every line explained.
3. **Try it.** A hands-on exercise, in a browser or in this repo.
4. **Check yourself.** Questions to answer out loud before you move on. The answers are
   in [09-question-bank.md](09-question-bank.md).

Answering out loud matters because the interview is spoken. Recognizing a correct
explanation is a different skill from producing one under time pressure.

## The modules

| # | Module | What you will be able to explain |
|---|---|---|
| 1 | [What FHIR is and why it exists](01-what-fhir-is.md) | Where FHIR sits next to HL7 v2 and C-CDA, and the FHIR versions |
| 2 | [Resources and data types](02-resources-and-data-types.md) | How a FHIR record is built, and how to read one |
| 3 | [The REST API and search](03-rest-api-and-search.md) | How software reads, writes and searches FHIR data over HTTP |
| 4 | [Profiles, extensions and terminology](04-profiles-extensions-terminology.md) | How FHIR is narrowed and extended for a country or use case, and how medical codes work |
| 5 | [Security and SMART on FHIR](05-security-smart.md) | How an app gets permission to read a patient's data |
| 6 | [Bulk data, CDS Hooks and subscriptions](06-bulk-cds-hooks-subscriptions.md) | Population exports, decision-support alerts and notifications |
| 7 | [The US regulatory landscape](07-us-regulations.md) | US Core, USCDI, ONC certification, CMS rules and TEFCA, with dated version facts |
| 8 | [Architecture and design questions](08-architecture-and-design.md) | How to answer "design a system that..." questions |
| 9 | [Question bank with answers](09-question-bank.md) | Self-test for every module, plus a mock interview |
| 10 | [Running SMART apps and CDS services in production](10-ehr-embedded-production.md) | Multi-tenant configuration, EHR vendor differences, CDS Hooks security, ordering resources, go-lives, monitoring, and a coding track |
| — | [Glossary](glossary.md) | Every term in this course, in one place |

## How long it takes

The full course takes about **17 to 27 hours**: about 11 to 17 hours of reading and
exercises, plus about 6 to 10 hours for module 10's coding track. These are estimates
for an experienced engineer, not measurements.

| Material | Approximate hours |
|---|---|
| Modules 1 and 2: what FHIR is, how a record is built | 2 to 3 |
| Module 3: skim the HTTP parts, focus on search, paging and transactions | 1.5 to 2 |
| Module 4: profiles and terminology | 1.5 to 2 |
| Modules 5 and 6: skim OAuth, focus on SMART specifics and CDS Hooks | 2 to 3 |
| Module 10 reading | 1.5 to 2 |
| Module 10 coding track | 6 to 10 |
| Modules 7 and 8 | 2 to 3 |
| Module 9 mock interview and re-study | 1 to 2 |

- **The coding track is where the range is widest.** It depends on how far you take each
  exercise. Exercises 1 and 2, the `order-select` service and JWT verification, give the
  most interview value for the time.
- **The three-day schedule takes about 12 to 15 hours**, at four to five hours a day.

## Seven-day schedule

Each day is about two to four hours. The last 20 minutes of every day are spent answering
the previous day's "check yourself" questions out loud, which spaces out your review.

| Day | Study | Hands-on |
|---|---|---|
| 1 | Modules 1 and 2 | Read an Observation and label every field |
| 2 | Modules 3 and 4 | Build the search URLs in module 3; find required elements in a US Core profile |
| 3 | Modules 5 and 6 | Follow a SMART launch in the network log; read this repo's CDS service |
| 4 | Module 10 reading | Coding track exercise 1: the `order-select` service |
| 5 | Modules 7 and 8 | Coding track exercise 2: CDS client JWT verification |
| 6 | Re-read module 10's failure table and testing strategy | Coding track exercises 3 to 6, as time allows |
| 7 | Module 9 mock interview, then re-study whatever you could not answer | Record yourself answering; listen back |

## Three-day schedule

Use this only if the interview is very soon. Each day is four to five hours. It covers
what interviews for EHR-embedded products ask about most, in my judgment. That ranking
is not a measured fact.

| Day | Study |
|---|---|
| 1 | Module 2, module 3 (search, paging, transactions), module 5 (SMART specifics) |
| 2 | Module 6 (CDS Hooks section), module 10, coding track exercise 1 |
| 3 | The version table in module 7, one design question from module 8, the mock interview in module 9 |

## Adjusting the plan

- **If the role builds a FHIR server or data platform** rather than apps that run inside
  EHRs, swap module 10's coding track for work on server behavior: search parameter
  indexing, transaction processing, versioning and bulk export. This course does not
  cover server internals in depth.
- **If the role is analyst, product or implementation work**, skip the coding track and
  spend more time on modules 4 and 7, because those roles spend their time on data
  mapping, codes and regulatory requirements.
- **If the job is at a payer** (a health insurer), read the CMS section of module 7
  closely and add the Da Vinci implementation guides it names.

## What was and was not verified

- **Version and regulation facts** in module 7 were checked with web searches on
  2026-11-07. **Vendor and specification facts** in module 10 were checked on 2026-11-08.
  Several official sites (hl7.org, healthit.gov, cms.gov) could not be opened directly
  from the environment this course was written in, so those facts rest on search-engine
  extracts of the official pages. Each such fact names its source.
- **Explanations of how FHIR works** rest on the FHIR R4 specification, which has not
  changed since 2019 for the parts covered here. They were written from knowledge of
  that specification, not re-checked line by line. Every module links the specification
  page to check against.
- **The browser exercises** use the public HAPI FHIR test server and the SMART launcher.
  Those sites could not be reached from the environment this course was written in, so
  the exact URLs were not tested. Public test servers also change their data often, so
  expect different patients than the examples show.
