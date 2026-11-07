# Module 7: The US regulatory landscape

Every fact in this module was checked with web searches on **2026-11-07**. The official
sites could not be opened directly from the environment this course was written in, so
most facts rest on search-engine extracts of official pages. Where sources disagreed, the
disagreement is stated. Sources are listed at the end. Recheck the version table in the
week before your interview, because these facts change during the year.

## Concepts

### Why regulation matters in a technical interview

Modules 1 to 6 described what FHIR can do. In the US, what companies actually build is
decided largely by federal rules that require specific FHIR guides at specific versions by
specific dates. An interviewer who asks "why are we building this?" or "which version of
US Core do we support?" expects an answer grounded in these rules.

### The two federal agencies

- **ASTP/ONC** (the Assistant Secretary for Technology Policy and Office of the National
  Coordinator for Health IT, part of the US Department of Health and Human Services)
  writes rules for **health IT developers**, mainly EHR vendors, through its
  **Certification Program**. A certified EHR must pass tests showing it supports
  specified standards.
- **CMS** (the Centers for Medicare & Medicaid Services) writes rules for **payers** that
  serve Medicare Advantage, Medicaid, CHIP and the federal insurance marketplaces, and for
  hospitals and clinicians in its payment programs.

### The law behind both

The **21st Century Cures Act** (2016) directed ONC to require standardized APIs and
prohibited **information blocking**, meaning practices that unreasonably interfere with
access to or exchange of electronic health information. The patient-access FHIR APIs that
exist today trace back to this law. This rests on general knowledge of the Act, which is
widely documented; it was not re-searched for this course.

### USCDI and US Core: what data, and how to send it

These two names are often confused, and interviewers ask about the difference.

- **USCDI** (United States Core Data for Interoperability) is a list, published by ONC,
  of the **data elements** that must be exchangeable: for example allergies, medications,
  lab results, vital signs. It does not say how to format them. ONC publishes a new
  version roughly every year.
- **US Core** is the HL7 FHIR implementation guide that says **how** to represent the
  USCDI elements in FHIR R4: which resources, which profiles, which code systems, which
  search parameters a server must support.

So a new USCDI version is followed by a new US Core version that maps it.

### Required versions versus allowed versions

ONC's rules set a **baseline** version that certified systems must support. Its
**Standards Version Advancement Process (SVAP)** lets developers voluntarily adopt newer
versions that ONC has approved. That is why the "latest" version and the "required"
version differ, and why an interviewer may ask which one the company supports.

### The certification criterion for FHIR APIs

The criterion usually cited for FHIR is **§170.315(g)(10)**, "standardized API for patient
and population services". It requires a certified EHR to offer a FHIR R4 API following US
Core, secured with SMART App Launch, including SMART Backend Services and Bulk Data export
for population access. ONC's test tool for it is **Inferno**, an open-source test suite.

### CMS rules for payers

- The **Interoperability and Patient Access rule (CMS-9115-F, 2020)** required affected
  payers to offer a **Patient Access API** (members can get their claims and clinical data
  through apps) and a **Provider Directory API**. The common guides are CARIN Blue Button
  (claims), US Core, Da Vinci PDex (payer clinical data) and Da Vinci Plan-Net
  (directories). This rests on general knowledge of the rule; it was not re-searched.
- The **Interoperability and Prior Authorization rule (CMS-0057-F)**, published in the
  Federal Register on 8 February 2024, adds the requirements in the table below.

| CMS-0057-F requirement | Date |
|---|---|
| Faster prior authorization decisions (7 days standard, 72 hours expedited), specific denial reasons | 1 January 2026 |
| First public prior authorization metrics report | 31 March 2026 |
| Patient Access API must include prior authorization information (drugs excluded) | 1 January 2027 |
| New **Provider Access API** (providers get data on their patients from the payer) | 1 January 2027 |
| New **Payer-to-Payer API** (data follows a member who changes plans) | 1 January 2027 |
| New **Prior Authorization API** | 1 January 2027 |

For Medicaid managed care and marketplace plans, the 2027 dates apply to the first rating
period or plan year starting on or after 1 January 2027.

The Prior Authorization API is usually built with three Da Vinci guides that work in
sequence:

1. **CRD** (Coverage Requirements Discovery): at order time, a CDS Hooks call (module 6)
   asks the payer whether authorization is needed.
2. **DTR** (Documentation Templates and Rules): if documentation is needed, a SMART app
   (module 5) presents the payer's questionnaire and fills what it can from the record.
3. **PAS** (Prior Authorization Support): submits the request and receives the decision.

A separate CMS proposed rule, published in the Federal Register on 14 April 2026, would
extend these API requirements to drug prior authorization with an **October 1, 2027**
compliance date. As of the searches, it was a proposal, not a final rule.

### TEFCA

**TEFCA** (the Trusted Exchange Framework and Common Agreement) is a national framework,
set up under the Cures Act, for exchanging health data between networks. Networks
approved under it are **QHINs** (Qualified Health Information Networks). **The Sequoia
Project** runs it as the **RCE** (Recognized Coordinating Entity).

TEFCA exchange began with older document-based standards. Its **FHIR Roadmap v2**
(December 2023) describes four stages of moving to FHIR:

1. QHINs carry FHIR content inside the older exchange methods.
2. QHINs help participants exchange data directly over FHIR APIs, using shared services
   such as directories.
3. QHINs exchange data with each other over FHIR.
4. FHIR is used end to end, between participants on different networks.

Search results also report that TEFCA FHIR exchange uses the HL7 UDAP security guide
(module 5). Sources disagree on which US Core version TEFCA requires, so I have left that
out.

## The version table

This is the table to memorize. "Status" is as of 2026-11-07.

| Specification | Latest published | Status and notes |
|---|---|---|
| FHIR base | R5 (5.0.0) | R4 (4.0.1) is what production systems and US rules use. R6 had normative ballots in January and July 2026 and is not final. |
| US Core | 9.0.0 (STU 9) | Maps USCDI v6. Version 10.0.0 is in ballot and maps USCDI v7. |
| USCDI | v7 | Published 23 July 2026. |
| ONC certification baseline | USCDI v3 with US Core 6.1.0 | Required since 1 January 2026 under the HTI-1 rule. |
| ONC 2026 SVAP (voluntary) | USCDI v6, US Core 9.0.0 | Developers may adopt these voluntarily. |
| HTI-5 proposed rule | Proposed 29 December 2025 | Would set USCDI v3.1 as the baseline and remove 34 certification criteria. Not final as of an October 2026 source. |
| SMART App Launch | 2.2.0 (STU 2.2) | Published April 2024. US certification has referenced 2.0.0. No newer version found. |
| Bulk Data Access | 3.0.0 (STU 3) | Published December 2025. 4.0.0 is in ballot. |
| CDS Hooks | 2.0.1 | 3.0.0 ballot published January 2026; one source says it did not pass. Unconfirmed. |
| SQL on FHIR v2 | Draft only | 2.1.0-pre, not an official publication. |
| CMS-0057-F APIs | — | Due 1 January 2027. |

What each row rests on is listed under "Sources".

### Known uncertainties in this table

- **HTI-5 may have been finalized** after the most recent source found (October 2026). If
  it was, the certification baseline row changes. Check healthit.gov.
- **The HTI-2 proposal** to require USCDI v4 was reported withdrawn in December 2025 by
  secondary sources. I could not confirm that from an ONC page.
- **The CDS Hooks 3.0 ballot result** comes from one search extract of an HL7 project page.
- **US Core 10.0.0** was still a continuous-build ballot version on the dates captured.

## How to use this in an interview

A short answer to "why does FHIR matter right now?" that rests on the facts above:

> Federal rules now require it on both sides of US healthcare. ONC certification requires
> EHRs to offer FHIR R4 APIs following US Core and SMART, which gives patients and
> apps standardized access. CMS's prior authorization rule requires payers to offer
> Provider Access, Payer-to-Payer and Prior Authorization FHIR APIs by 1 January 2027,
> built on the Da Vinci guides. TEFCA is moving national network exchange onto FHIR as
> well. So most US interoperability work in the next few years is FHIR work.

Practice saying this in your own words; do not memorize it word for word.

## Try it

1. Open the US Core USCDI mapping page (https://hl7.org/fhir/us/core/uscdi.html) and find
   which US Core profile carries "Vital Signs" and "Laboratory" data.
2. Find the current status of HTI-5 on healthit.gov and update the table if it changed.
3. Explain, out loud and without notes, how CRD, DTR and PAS work together.

## Check yourself

1. What is the difference between USCDI and US Core?
2. What is the difference between ONC's baseline and SVAP?
3. What does the (g)(10) criterion require, and what tool tests it?
4. Which four APIs does CMS-0057-F involve, and when are they due?
5. How do CRD, DTR and PAS fit together, and which earlier modules do they rely on?
6. What is TEFCA, and what is a QHIN?

## Sources

Searches run 2026-11-07. Pages are listed by what they support.

- FHIR R6 ballots: [HL7 Confluence, 2026 T1 Updates on Standards Development](https://confluence.hl7.org/spaces/HL7/blog/2026/05/15/453916549/2026+T1+-+Updates+on+Standards+Development);
  [HL7 FMG Release Plan for R6](https://confluence.hl7.org/spaces/FMG/pages/256509111/Release+Plan+for+R6);
  [HL7 September 2026 early ballot announcement](https://www.hl7.org/documentcenter/public/ballots/2026SEP/Announcements/2026Sep_HL7_Announcement_of_FHIR_R6_Early_Ballot_Opening_for_September_Ballot_Cycle.pdf)
- US Core: [US Core 9.0.0 home](https://www.hl7.org/fhir/us/core/);
  [US Core USCDI mapping](https://hl7.org/fhir/us/core/STU9/uscdi.html);
  [US Core 10.0.0-ballot continuous build](https://build.fhir.org/ig/HL7/US-Core/)
- USCDI v7: [ONC Standards Bulletin 2026-2](https://healthit.gov/standards-and-technology/onc-standards-bulletin/onc-standards-bulletin-2026-2/);
  [USCDI Version 7 (July 2026)](https://isp.healthit.gov/sites/default/files/2026-07/USCDI-Version-7-July-2026.pdf)
- 2026 SVAP: [ONC blog, 2026 Approved SVAP Standards](https://healthit.gov/blog/standards/advancements-in-health-it-oncs-2026-approved-svap-standards/)
- HTI-1 baseline: [HTI-1 overview and key dates fact sheet](https://healthit.gov/wp-content/uploads/2025/03/Overview-and-Key-Dates-2024_508.pdf);
  [ONC Standards Bulletin 2024-1](https://healthit.gov/standards-and-technology/onc-standards-bulletin/onc-standards-bulletin-2024-1/)
- HTI-5: [Covington, HTI-5 proposed rule](https://www.covingtondigitalhealth.com/2026/01/hhs-proposes-changes-to-the-health-it-certification-program-and-information-blocking-regulations-in-hti-5-proposed-rule/);
  [Healthcare IT News, HTI-5](https://www.healthcareitnews.com/news/astponc-seeks-relaxation-health-it-certification-criteria-hti-5);
  [AHA comments, February 2026](https://www.aha.org/lettercomment/2026-02-27-aha-comments-astponc-health-care-technology-interoperability-proposed-rule)
- HTI-2 withdrawal (secondary): [Holland & Knight, January 2026](https://www.hklaw.com/en/insights/publications/2026/01/astp-oncs-year-end-moves-mark-a-strategic-pivot)
- SMART App Launch: [SMART App Launch 2.2.0](https://hl7.org/fhir/smart-app-launch/);
  [HL7 STU publication notice, April 2024](http://standups.hl7.org/2024/04/30/stu-publication-of-hl7-fhir-implementation-guide-smart-application-launch-framework-release-2-2/)
- Bulk Data: [Bulk Data Access IG 3.0.0](https://hl7.org/fhir/uv/bulkdata/STU3/en/index.html);
  [Bulk Data 4.0.0-ballot build](https://build.fhir.org/ig/HL7/bulk-data/)
- CDS Hooks: [CDS Hooks home (2.0.1)](https://cds-hooks.hl7.org/);
  [CDS Hooks 3.0.0-ballot](http://cds-hooks.hl7.org/2026Jan/);
  [HL7 CDS Hooks Confluence page](https://confluence.hl7.org/spaces/CDS/pages/111122163/CDS+Hooks)
- SQL on FHIR: [SQL on FHIR continuous build](https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/ValueSet-ExportStatusCodes.xml.html)
- CMS-0057-F: [CMS final rule page](https://www.cms.gov/initiatives/burden-reduction/overview/interoperability/policies-regulations/cms-interoperability-prior-authorization-final-rule-cms-0057-f);
  [Federal Register, 8 February 2024](https://www.federalregister.gov/documents/2024/02/08/2024-00895/medicare-and-medicaid-programs-patient-protection-and-affordable-care-act-advancing-interoperability);
  [CMS APIs and implementation guides](https://www.cms.gov/priorities/burden-reduction/overview/interoperability/implementation-guides-standards/application-programming-interfaces-apis-relevant-standards-implementation-guides-igs)
- Drug prior authorization proposal: [Federal Register, 14 April 2026](https://www.federalregister.gov/documents/2026/04/14/2026-07205/medicare-and-medicaid-programs-patient-protection-and-affordable-care-act-interoperability-standards)
- TEFCA: [Sequoia Project, FHIR Roadmap for TEFCA Exchange](https://rce.sequoiaproject.org/wp-content/uploads/2023/12/FHIR-Roadmap-for-TEFCA-Exchange.pdf);
  [RCE TEFCA and FHIR](https://rce.sequoiaproject.org/rce-tefca-on-fhir)
