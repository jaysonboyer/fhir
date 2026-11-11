# Module 1: What FHIR is and why it exists

Specification to check against: https://hl7.org/fhir/R4/overview.html

## Concepts

### The problem FHIR addresses

A hospital runs many separate software systems: an EHR (electronic health record, the
main system clinicians use to record care), a lab system, a pharmacy system, a billing
system, and others. Each stores patient data in its own format. Whenever one system
needs data from another, someone has to write software that translates between them.

Because every pair of systems needs its own translation, the cost of connecting systems
grows quickly as systems are added. A shared standard reduces that cost: if every system
can produce and accept one agreed format, each system needs only one translation.

### HL7 and its earlier standards

HL7 International is the nonprofit organization that writes most healthcare data
standards used in the US. FHIR is its newest major standard. Interviewers often ask how
FHIR differs from the two older HL7 standards that are still in heavy use.

**HL7 version 2** (usually written "HL7 v2") is a message format from the late 1980s.
A v2 message is a block of text with fields separated by the `|` character. One system
sends a message to another when an event happens, such as a patient being admitted.
Almost every US hospital still uses v2 inside its own walls, and this rests on its long
installed history; FHIR has not replaced it.

**C-CDA** (Consolidated Clinical Document Architecture) is an XML document format. A
C-CDA document is a whole summary of a patient's record, such as a discharge summary,
sent from one organization to another as one file. Much data exchange between US
organizations still uses C-CDA documents.

**FHIR**, first published in 2014, breaks health data into small records called
resources (a Patient, an Observation, a Medication), and gives each one a web address.
Software reads and writes those records with the same kind of HTTP requests that ordinary
websites and mobile apps use. That is the main reason FHIR spread quickly: ordinary web
developers already know the tools.

### A comparison you should be able to give from memory

| | HL7 v2 | C-CDA | FHIR |
|---|---|---|---|
| Unit of data | A message about one event | A whole document | One small record (resource) |
| Format | Pipe-delimited text | XML | JSON, XML (and RDF) |
| How it moves | Pushed between systems, often over a direct network connection | Sent as a file | Requested over a web API (REST), or pushed in messages, documents or notifications |
| Typical use | Inside a hospital, system to system | Between organizations, care summaries | Apps, APIs for patients and payers, newer integrations |

An interviewer may ask "would you replace v2 with FHIR?" A strong answer is that it
depends on the use: v2 works well for high-volume internal event feeds that already
exist, and FHIR is the better choice for new APIs, apps and anything that must be
accessed on request. Many real systems translate v2 messages into FHIR resources.

### What "resource" means

A resource is the basic unit of FHIR: one record of one type, such as one patient or one
blood pressure reading. The FHIR R4 specification defines about 145 resource types. Each
resource type has a fixed list of fields (called elements), and each resource has its own
identifier and web address. Module 2 covers resources in detail.

### The 80 percent rule

FHIR's designers chose to put into the base specification only the elements that most
systems need, often described as the elements that about 80 percent of implementations
use. Anything more specialized goes into an extension (an extra field defined outside the
base specification). This is a stated design principle in the FHIR specification, and it
explains why extensions appear everywhere in real data. Module 4 covers extensions.

### FHIR versions

FHIR has had several releases. Interviewers often ask which version you would use and
why, so learn this table. The dates rest on the FHIR version history; the R6 status
rests on HL7 announcements found on 2026-11-07 (see module 7 for sources).

| Version | Year | Status and what it means for you |
|---|---|---|
| DSTU2 | 2015 | Old. Still appears in older tutorials and some vendor sandboxes. |
| STU3 | 2017 | Old. Some legacy systems still run it. |
| **R4 (4.0.1)** | 2019 | **The version in production almost everywhere.** First release with normative content (see below). US regulations require it. |
| R4B | 2022 | A small update to R4 that changed a few resources (mainly for medication regulation). Rarely deployed. |
| R5 | 2023 | The current official release. Few production systems run it. |
| R6 | not yet final | In normative balloting during 2026. Not published as final as of 2026-11-07. |

**Normative** means HL7 has promised that a part of the specification will stay backward
compatible in future versions. In R4, the core infrastructure (how the API works, the
data types) and a few resources such as Patient and Observation became normative. Most
other resources are labeled with a **maturity level** from 0 to 5 (the FHIR Maturity
Model, or FMM), where a higher number means more real-world testing and less likely
change.

**Why R4 dominates** is a likely interview question. The answer rests on two facts: US
certification rules and CMS rules reference R4-based implementation guides, and the big
EHR vendors built their APIs on R4. Changing versions means changing every connected
system, so the industry moves slowly and on regulatory schedules.

### The FHIR specification is a website, and how to read it

The specification is published at hl7.org/fhir. Each resource has a page with these tabs,
and knowing them helps you look things up during practice:

- **Content**: a table of the resource's elements, their types and cardinality.
- **Examples**: sample records in JSON and XML.
- **Detailed descriptions**: the definition of each element.
- **Mappings**: how each element corresponds to v2, C-CDA and other standards.
- **Profiles & Extensions**: published narrowings and additions.
- **Operations**: special actions defined for the resource.

Always check which version a page belongs to. The address hl7.org/fhir/R4/ is R4;
hl7.org/fhir/ with no version is the current release (R5), which is not what most
production systems use.

### Implementation guides

The base specification is deliberately broad. An **implementation guide** (IG) is a
published document, itself written in FHIR, that narrows the base specification for a
country, region or use case. For example, US Core (module 7) says which resources and
elements a US system must support. Most real FHIR work is governed by an IG, not by the
base specification alone. Module 4 explains how IGs are built.

## Read a real example

This is one HL7 v2 message segment (the patient identification segment, `PID`), shown so
you can see the contrast with FHIR. You do not need to learn v2.

```
PID|1||12345^^^HOSP^MR||Smith^Jane^A||19800215|F
```

The same information as a FHIR Patient resource in JSON:

```json
{
  "resourceType": "Patient",
  "id": "example",
  "identifier": [
    { "system": "http://hospital.example.org/mrn", "value": "12345" }
  ],
  "name": [
    { "family": "Smith", "given": ["Jane", "A"] }
  ],
  "gender": "female",
  "birthDate": "1980-02-15"
}
```

What to notice:

- The v2 segment relies on field position: the fifth field is the name. FHIR labels every
  field by name, so the record is readable without a separate manual.
- v2 writes the birth date as `19800215` and the sex as `F`. FHIR uses a standard date
  format and a fixed list of words for gender.
- The hospital's medical record number (`12345`) becomes an `identifier` with a `system`
  web address saying who issued it. Module 2 explains why that matters.

## Try it

1. Open https://hl7.org/fhir/R4/resourcelist.html in your browser. This lists every R4
   resource type grouped by area (foundation, base, clinical, financial, specialized).
   Find Patient, Observation, Condition, MedicationRequest, Encounter and AllergyIntolerance.
   These six are the ones interviews mention most.
2. Open https://hl7.org/fhir/R4/patient.html and click each tab listed above.
3. On the Patient page, find the maturity level and the word "Normative" near the top.

### Run it in this repo

[apps/v2-to-fhir](../apps/v2-to-fhir/src/convert.ts) converts the `PID` segment above,
inside a lab result message, into a FHIR transaction Bundle. Run
`pnpm --filter v2-to-fhir demo` and it prints each change: position to named field, date
format, MRN to `identifier.system`, and a local lab code mapped to LOINC (plus one it
cannot map). Module 8, worked question 3, covers the design around it.

## Check yourself

1. In two sentences, what is FHIR?
2. What are the main differences between HL7 v2, C-CDA and FHIR?
3. Why do most production systems use R4 rather than R5?
4. What does "normative" mean, and what is a maturity level?
5. What is an implementation guide, and why does most real work depend on one?
