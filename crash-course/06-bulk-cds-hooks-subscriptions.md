# Module 6: Bulk data, CDS Hooks and subscriptions

Specifications to check against: https://hl7.org/fhir/uv/bulkdata/ (Bulk Data Access),
https://cds-hooks.hl7.org/ (CDS Hooks) and https://hl7.org/fhir/R4/subscription.html

## Concepts

Module 3 covered the request-and-response style of FHIR: a client asks for specific
records and gets them back. This module covers three patterns for cases where that style
is a poor fit: exporting data for many patients, giving advice inside the EHR at the right
moment, and being told when data changes.

## Part 1: Bulk Data Access

### The problem

Searching one patient at a time works for an app. It does not work for a payer that needs
records for a million members, a researcher building a dataset, or an analytics system
refreshed nightly. Paging through millions of search results would take too long and
load the server too heavily.

### The solution: asynchronous export

The **Bulk Data Access** implementation guide (often called "Flat FHIR") defines the
`$export` operation. Instead of returning data in the response, the server prepares files
in the background and tells the client where to download them. This is called an
**asynchronous** request: the client starts the job, checks back later, and downloads the
result when it is ready.

The current published version is 3.0.0, published in December 2025, and a 4.0.0 version
is in ballot. This rests on searches of HL7's pages recorded in module 7.

### Three levels of export

| Request | Exports |
|---|---|
| `GET [base]/$export` | All data on the server |
| `GET [base]/Patient/$export` | Data for all patients |
| `GET [base]/Group/[id]/$export` | Data for the patients in one Group, such as a payer's members or a hospital's attributed population |

The Group-level export is the one used most in practice, because a client usually has
permission for a specific population, not the whole server.

### The flow, step by step

1. **Kick-off.** The client sends the export request with headers
   `Accept: application/fhir+json` and `Prefer: respond-async`. It can add parameters:
   `_type` (which resource types), `_since` (only records changed after a date, for
   incremental exports), and `_typeFilter` (search criteria per type).
2. **Accepted.** The server replies `202 Accepted` with a `Content-Location` header giving
   a **status URL**.
3. **Polling.** The client requests the status URL repeatedly. While the job runs, the
   server replies `202` and may include a `Retry-After` header saying how long to wait.
4. **Complete.** The server replies `200` with a JSON **manifest** listing the output
   files: one or more per resource type, each with a URL.
5. **Download.** The client downloads each file. The files are **NDJSON** (newline-
   delimited JSON): one complete FHIR resource per line, with no surrounding Bundle. That
   format lets very large files be processed one line at a time.
6. **Clean up.** The client may send `DELETE` to the status URL to tell the server it can
   remove the files.

Bulk export almost always uses SMART Backend Services (module 5) for authorization,
because it runs without a user.

### Example manifest

```json
{
  "transactionTime": "2026-11-01T02:00:00Z",
  "request": "https://example.org/fhir/Group/members-2026/$export?_type=Patient,Observation",
  "requiresAccessToken": true,
  "output": [
    { "type": "Patient", "url": "https://example.org/files/patient-1.ndjson" },
    { "type": "Observation", "url": "https://example.org/files/observation-1.ndjson" },
    { "type": "Observation", "url": "https://example.org/files/observation-2.ndjson" }
  ],
  "error": [
    { "type": "OperationOutcome", "url": "https://example.org/files/errors.ndjson" }
  ]
}
```

- `transactionTime` is the point in time the export reflects. A client doing incremental
  exports passes it as `_since` next time, so it receives only what changed.
- `requiresAccessToken: true` means the file downloads also need the access token.
- `error` lists files of OperationOutcome resources describing records that failed.

## Part 2: CDS Hooks

### The problem

Clinical decision support (CDS) is software that gives clinicians advice, such as "this
drug interacts with one the patient already takes". Advice is useful only if it appears
at the moment of the decision, inside the EHR the clinician is using. Building that advice
inside every EHR separately is expensive.

### The solution: the EHR calls an outside service at defined moments

**CDS Hooks** is an HL7 specification that lets an EHR call an external **CDS service**
at defined points in the clinician's workflow, called **hooks**. The service replies with
**cards** that the EHR displays. CDS Hooks is not itself a FHIR implementation guide, but
it sends FHIR resources in its requests.

The current published version is CDS Hooks 2.0.1. A 3.0.0 ballot version was published in
January 2026; one search result reported that ballot did not pass, which I could not
confirm from a primary source. Details are in module 7.

### Common hooks

| Hook | When the EHR calls it |
|---|---|
| `patient-view` | A clinician opens a patient's chart |
| `order-select` | A clinician selects an order, before finishing it |
| `order-sign` | A clinician is about to sign orders |
| `encounter-start` | A visit or stay begins |
| `encounter-discharge` | A patient is being discharged |
| `appointment-book` | An appointment is being booked |

### The flow

1. **Discovery.** The EHR requests `GET [service base]/cds-services`. The service replies
   with a list of its services, each with a `hook`, an `id`, a `description`, and a
   `prefetch` section. See the `services` list in
   [apps/cds-services/src/server.ts](../apps/cds-services/src/server.ts).
2. **Prefetch.** The `prefetch` section lists FHIR requests, written as templates such as
   `Patient/{{context.patientId}}`, that the service needs. The EHR runs them before
   calling the service and includes the results, so the service does not have to call
   back. This matters because the EHR waits for the reply while the clinician waits.
3. **Hook request.** When the hook fires, the EHR sends `POST [service base]/cds-services/[id]`
   with a JSON body containing `hook`, `hookInstance` (a unique ID for this call),
   `context` (such as the patient ID and the draft orders), `prefetch` (the results), and
   optionally `fhirServer` and `fhirAuthorization` (a token the service can use to request
   more data).
4. **Cards.** The service replies with `{ "cards": [...] }`. An empty list means no advice.

### What a card contains

```json
{
  "cards": [
    {
      "uuid": "4f1c...",
      "summary": "Patient is due for a diabetic eye exam",
      "indicator": "info",
      "detail": "Last retinal exam was more than 12 months ago.",
      "source": { "label": "Diabetes care service" },
      "suggestions": [
        {
          "label": "Order retinal exam",
          "actions": [
            { "type": "create", "description": "Add retinal exam order", "resource": { "resourceType": "ServiceRequest" } }
          ]
        }
      ],
      "links": [
        { "label": "Open diabetes app", "url": "https://app.example.org/launch", "type": "smart" }
      ]
    }
  ]
}
```

- `summary` is the one-line message. The specification says it should be under 140
  characters.
- `indicator` is `info`, `warning` or `critical`, and controls how urgently the EHR shows it.
- `suggestions` are actions the clinician can accept with one click, such as creating or
  removing an order. The `resource` above is shortened.
- `links` with `type: "smart"` launch a SMART app (module 5), which connects CDS Hooks
  to SMART: a card can open an app for more detail.

A service can also offer a **feedback** endpoint, which the EHR calls to report whether
the clinician accepted or overrode a card.

### A connection to payers

The Da Vinci **Coverage Requirements Discovery** (CRD) guide uses CDS Hooks so that a
payer's service can tell a clinician, at order time, whether a service needs prior
authorization. That is one of the guides CMS's prior authorization rule names (module 7).

## Part 3: Subscriptions

### The problem

A client that needs to know when data changes, such as when a lab result arrives, could
search repeatedly. That wastes requests and delays the information. A **subscription**
lets the server notify the client instead.

### How subscriptions changed between versions

This is a good topic for showing you know version differences.

- **R4** has a `Subscription` resource whose `criteria` is a search string, such as
  `Observation?code=http://loinc.org|4548-4`. When a matching record changes, the server
  sends a notification over a `channel`: `rest-hook` (an HTTP request to a URL the client
  provides), `websocket`, `email` or `message`.
- **R5** redesigned this around **SubscriptionTopic** resources. A server publishes topics
  it supports, such as "encounter started", and clients subscribe to a topic with
  filters. This was done because free-form search criteria were hard for servers to
  support efficiently.
- The **Subscriptions R5 Backport** implementation guide brings the topic-based design to
  R4 systems, so R4 servers can use it now.

A notification can carry the full changed resource, only its ID, or nothing (the client
then searches), depending on the `payload` setting. Sending IDs only is common for privacy.

## Part 4: Other exchange patterns, briefly

- **Messaging.** A Bundle of type `message` whose first entry is a MessageHeader, sent
  from one system to another, similar in spirit to HL7 v2. Used less than REST.
- **Documents.** A Bundle of type `document` whose first entry is a **Composition** (the
  document's title, sections and author). Used for fixed, signed summaries. The
  International Patient Summary is an example.

### Analytics: SQL on FHIR

FHIR's nested JSON is hard to analyze with ordinary database tools, which expect flat
tables. **SQL on FHIR** is an HL7 project that defines **ViewDefinition**, a resource
describing how to turn FHIR resources into flat tables using FHIRPath expressions. As of
the searches recorded in module 7, version 2 is still a draft (2.1.0-pre), not a final
publication. Mentioning it shows awareness of how FHIR data is analyzed at scale, which
often comes up with bulk data.

## Read a real example

Read this repo's CDS service in
[apps/cds-services/src/server.ts](../apps/cds-services/src/server.ts) and identify:

- the discovery response and its `prefetch` template;
- where the service reads the prefetched Patient;
- the card's `summary`, `indicator` and `source`;
- the CORS headers (permission headers that let a web page on another site call the
  service), which the CDS Hooks sandbox needs because it runs in a browser.

## Try it

1. Open https://sandbox.cds-hooks.org. Watch the request and response panes on the
   Patient View screen to see a real hook request and its cards.
2. If you can run this repo, follow the README section "CDS Hooks" to connect the repo's
   service to the sandbox.
3. On paper, write the kick-off request for a Group-level export of Patient, Condition
   and Observation records changed since 1 October 2026.

Answer for step 3:

```
GET [base]/Group/[id]/$export?_type=Patient,Condition,Observation&_since=2026-10-01T00:00:00Z
Accept: application/fhir+json
Prefer: respond-async
```

## Check yourself

1. Why does bulk export run asynchronously?
2. Walk through the `$export` flow from kick-off to download.
3. What is NDJSON and why is it used instead of a Bundle?
4. How would you do incremental (only-changed) exports?
5. What is a hook, and name three.
6. What is prefetch, and why does it matter for speed?
7. What are the parts of a card, and what does a `smart` link do?
8. How did subscriptions change from R4 to R5, and how can an R4 server use the new design?
