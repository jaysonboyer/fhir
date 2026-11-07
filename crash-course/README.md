# FHIR crash course for a technical interview

This folder is a study plan for learning FHIR quickly enough to pass a technical
interview. FHIR (Fast Healthcare Interoperability Resources) is a standard from the
organization HL7 that defines how healthcare software represents medical data as
JSON or XML records and exchanges those records over web APIs.

## What this plan assumes

These assumptions shape the plan. If one is wrong, the "Adjusting the plan" section
below says what to change.

- **You have about two weeks.** The main schedule is ten study days of two to three
  hours each. A three-day version is at the end of the schedule.
- **The interview tests understanding, not production code.** Most FHIR interviews ask
  you to explain how the standard works, read a JSON example, and talk through how you
  would design an integration. The plan teaches you to read JSON and web requests, but
  it does not require you to write software.
- **The job is in the United States.** US regulations decide which FHIR features
  companies actually build, so module 7 covers them. If the job is outside the US,
  skip most of module 7.
- **The systems you will hear about use FHIR version R4.** This rests on the version
  research in module 7: R4 is what US regulations require and what large EHR vendors
  serve, even though newer versions exist.

## How each module is built

Every module has the same four parts, so you always know where you are.

1. **Concepts.** The ideas, explained in plain language, each with what it rests on.
2. **Read a real example.** A short JSON or HTTP example with every line explained.
3. **Try it.** A hands-on exercise. Most need only a web browser.
4. **Check yourself.** Questions to answer out loud before you move on. The answers are
   in [09-question-bank.md](09-question-bank.md).

Answering out loud matters because the interview is spoken. Reading an explanation and
recognizing it as correct is a different skill from producing the explanation yourself.

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
| — | [Glossary](glossary.md) | Every term in this course, in one place |

## Ten-day schedule

Each day is two to three hours. The last 20 minutes of every day are spent answering
the previous day's "check yourself" questions out loud, which spaces out your review.

| Day | Study | Hands-on |
|---|---|---|
| 1 | Module 1, then module 2 up to "data types" | Open a Patient record in the browser (module 2 exercise) |
| 2 | Rest of module 2 | Read an Observation and label every field |
| 3 | Module 3, sections on interactions and HTTP | Run read and search requests in the browser |
| 4 | Module 3, search parameters, paging, `_include`, transactions | Build five search URLs from plain-language requests |
| 5 | Module 4 | Look up a US Core profile and find its required elements |
| 6 | Module 5 | Run the SMART launch in this repo, or follow it in the launcher's network log |
| 7 | Module 6 | Read the CDS Hooks service in this repo and the sandbox's request and response |
| 8 | Module 7 | Memorize the version table; practice the "why does FHIR matter right now" answer |
| 9 | Module 8 | Talk through two design questions out loud with a timer |
| 10 | Module 9 mock interview, then re-study whatever you could not answer | Record yourself answering; listen back |

## Three-day schedule

Use this only if the interview is very soon. It covers what interviewers ask about most
often, based on the topics that appear across interview-prep sources and the FHIR
specification's own emphasis. That ranking is my judgment, not a measured fact.

| Day | Study |
|---|---|
| 1 | Module 1, module 2, module 3 (skip transactions) |
| 2 | Module 4 (skip slicing), module 5, the CDS Hooks and bulk data sections of module 6 |
| 3 | The version table in module 7, one design question from module 8, the mock interview in module 9 |

## Adjusting the plan

- **If the job is a developer role**, add the "Try it" exercises that use this repo's
  code in [apps/smart-app](../apps/smart-app) and [apps/cds-services](../apps/cds-services).
  The [repo README](../README.md) explains how to run them.
- **If the job is an analyst, product or implementation role**, spend less time on
  module 3's HTTP details and more on modules 4 and 7, because those roles spend their
  time on data mapping, codes and regulatory requirements.
- **If the job is at a payer** (a health insurer), read the CMS section of module 7
  closely and add the Da Vinci implementation guides it names.
- **If the job is at an EHR vendor or a hospital**, read module 5 and the ONC section of
  module 7 closely.

## What was and was not verified

- **Version and regulation facts** in module 7 were checked with web searches on
  2026-11-07. Several official sites (hl7.org, healthit.gov, cms.gov) could not be
  opened directly from the environment this course was written in, so those facts rest
  on search-engine extracts of the official pages. Each fact in module 7 names its source.
- **Explanations of how FHIR works** rest on the FHIR R4 specification, which has not
  changed since 2019 for the parts covered here. They were written from knowledge of
  that specification, not re-checked line by line. Every module links the specification
  page to check against.
- **The browser exercises** use the public HAPI FHIR test server and the SMART launcher.
  Those sites could not be reached from the environment this course was written in, so
  the exact URLs were not tested. Public test servers also change their data often, so
  expect different patients than the examples show.
