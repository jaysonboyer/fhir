# Module 3: The REST API and search

Specification to check against: https://hl7.org/fhir/R4/http.html and
https://hl7.org/fhir/R4/search.html

## Concepts

### What REST means here

Module 1 said FHIR gives every resource a web address. REST (Representational State
Transfer) is the name for the style of web API in which each record has an address and
software uses standard HTTP methods on that address: `GET` to read, `POST` to create,
`PUT` to replace, `PATCH` to change part of a record, `DELETE` to remove.

Every FHIR server has a **base URL**, such as `https://hapi.fhir.org/baseR4`. Every
address in this module is relative to that base.

### The interactions

The specification calls each kind of request an **interaction**. Learn this table; it is
the core of most technical FHIR interviews.

| Interaction | HTTP request | What it does |
|---|---|---|
| read | `GET [base]/Patient/123` | Get the current version of one record |
| vread | `GET [base]/Patient/123/_history/2` | Get a specific past version |
| update | `PUT [base]/Patient/123` | Replace the whole record (or create it with that id, if the server allows) |
| patch | `PATCH [base]/Patient/123` | Change part of a record |
| delete | `DELETE [base]/Patient/123` | Remove the record |
| create | `POST [base]/Patient` | Create a new record; the server assigns the id |
| search | `GET [base]/Patient?name=smith` | Find records matching criteria |
| history | `GET [base]/Patient/123/_history` | List all versions of a record |
| capabilities | `GET [base]/metadata` | Get the server's CapabilityStatement |
| batch / transaction | `POST [base]` with a Bundle | Send many requests at once |

**Create versus update** is a common question. `POST` to the type (`/Patient`) lets the
server choose the `id`. `PUT` to a specific address (`/Patient/123`) replaces that record;
whether a client may create a new record that way depends on the server.

### What the server sends back

FHIR uses standard HTTP status codes. The ones to know:

| Code | Meaning in FHIR |
|---|---|
| 200 OK | Read, search or update succeeded |
| 201 Created | Create succeeded; the `Location` header gives the new address |
| 204 No Content | Success with no body (common for delete) |
| 400 Bad Request | The request could not be parsed |
| 401 Unauthorized | No valid access token (module 5) |
| 403 Forbidden | Token is valid but does not allow this action |
| 404 Not Found | No such record, or the resource type is not supported |
| 409 / 412 | Version conflict (see "concurrency" below) |
| 410 Gone | The record was deleted |
| 422 Unprocessable Entity | The record broke a rule, such as a profile requirement |

When something fails, the body is usually an **OperationOutcome** resource, which lists
each problem with a `severity` (fatal, error, warning, information) and a description.

### CapabilityStatement: asking a server what it supports

`GET [base]/metadata` returns a **CapabilityStatement**, a resource that lists which
FHIR version the server runs, which resource types it serves, which interactions and
search parameters it supports for each, and which security it uses. The first step of
any integration should be to read it, because no server supports the entire
specification. A good interview answer mentions this.

### Versions and concurrency

Each time a record changes, the server increases `meta.versionId` and returns it in the
HTTP `ETag` header. To avoid overwriting someone else's change, a client sends the
version it last saw in an `If-Match` header with its `PUT`. If the record changed since,
the server rejects the update with 412 Precondition Failed. This technique is called
**optimistic locking**: the client does not lock the record, it checks for conflicts when
it writes.

### Conditional interactions

A client often knows a business identifier but not the server's `id`. Conditional
interactions handle this:

- **Conditional create**: `POST /Patient` with header
  `If-None-Exist: identifier=http://hospital.example.org/mrn|12345`. The server creates
  the record only if no record matches. This prevents duplicates when a request is retried.
- **Conditional update**: `PUT /Patient?identifier=http://hospital.example.org/mrn|12345`
  updates the matching record or creates one if none matches.

### Search basics

A search is a `GET` on a resource type with **search parameters** after a `?`. Each
resource type has its own defined parameters; the bottom of each resource's page in the
specification lists them.

```
GET [base]/Observation?patient=123&code=http://loinc.org|85354-9&date=ge2026-01-01
```

This reads as: Observations about patient 123, with the LOINC blood pressure code, dated
on or after 1 January 2026. Multiple parameters joined by `&` must all match (AND).
Multiple values separated by a comma in one parameter match any of them (OR), as in
`code=http://loinc.org|8480-6,http://loinc.org|8462-4`.

### Search parameter types

Every search parameter has a type, and the type decides how values are matched. This
table rests on the specification's search page.

| Type | Matches | Example |
|---|---|---|
| string | Text, starting from the beginning, ignoring case and accents | `name=smi` matches "Smith" |
| token | A code or identifier, as `system|code` | `code=http://loinc.org|85354-9`, `identifier=…|12345`, `gender=female` |
| reference | A link to another resource | `subject=Patient/123` |
| date | A date or range | `date=ge2026-01-01` |
| number | A number | `probability=gt0.8` |
| quantity | A number with units | `value-quantity=gt140|http://unitsofmeasure.org|mm[Hg]` |
| uri | A web address | `url=http://hl7.org/fhir/…` |
| composite | Two values that must match together | `component-code-value-quantity=…` |

For a token, `system|code` matches that exact pair, `|code` matches the code with no
system, and `code` alone matches the code in any system.

### Prefixes for dates and numbers

Date, number and quantity parameters accept a two-letter prefix:

| Prefix | Meaning |
|---|---|
| `eq` | equal (the default) |
| `ne` | not equal |
| `gt`, `lt` | greater than, less than |
| `ge`, `le` | greater or equal, less or equal |
| `sa`, `eb` | starts after, ends before |
| `ap` | approximately |

### Modifiers

A modifier is added after the parameter name with a colon and changes how matching works:

- `name:exact=Smith` matches exactly, case included.
- `name:contains=mit` matches anywhere in the text.
- `code:not=…` excludes a code.
- `code:text=…` searches the code's display text.
- `birthdate:missing=true` finds records where the element is absent.
- `code:below=…` and `code:above=…` match codes lower or higher in a code hierarchy.

### Chaining and reverse chaining

**Chaining** searches on an element of a referenced resource, using a dot:

```
GET [base]/Observation?subject:Patient.name=smith
```

This finds Observations whose subject is a Patient named Smith, in one request.

**Reverse chaining** uses `_has` to find resources that are *referenced by* others:

```
GET [base]/Patient?_has:Observation:patient:code=http://loinc.org|85354-9
```

This finds Patients who have at least one blood pressure Observation.

### Including related resources: `_include` and `_revinclude`

Search results normally contain only the resource type you searched. To get related
records in the same response, and avoid one extra request per record:

- `_include` adds resources that the results *point to*:
  `MedicationRequest?patient=123&_include=MedicationRequest:medication` returns the
  prescriptions and the Medication records they reference.
- `_revinclude` adds resources that *point to* the results:
  `Patient?_id=123&_revinclude=Observation:subject` returns the Patient and every
  Observation about them.

The repo's app does the equivalent with the fhirclient library's `resolveReferences`
option in [apps/smart-app/src/app.ts](../apps/smart-app/src/app.ts).

### Controlling the results

| Parameter | Effect |
|---|---|
| `_count=50` | Page size |
| `_sort=-date` | Sort; a leading `-` means descending |
| `_summary=true` | Return only the summary elements |
| `_elements=id,name` | Return only these elements |
| `_total=accurate` | Ask the server to count all matches |
| `_lastUpdated=ge2026-10-01` | Filter on when records last changed |

### Bundles and paging

A search returns a **Bundle** resource of type `searchset`. A Bundle is a container: it
has an `entry` list, and each entry holds one `resource` plus its `fullUrl` (its full
address). The Bundle also has `link` entries; the one with `relation: "next"` is the
address of the next page.

Servers return results one page at a time. Software that reads only the first page
silently loses data, and that is a common real-world bug. The client must follow `next`
links until there are none. The repo app does this with fhirclient's `pageLimit: 0`.

Bundle types to know:

| Bundle type | Used for |
|---|---|
| `searchset` | Search results |
| `batch` | Many independent requests sent together |
| `transaction` | Many requests that must all succeed or all fail |
| `history` | Results of a history interaction |
| `document` | A clinical document (first entry is a Composition) |
| `message` | A message (first entry is a MessageHeader) |
| `collection` | Any grouping with no processing rules |

### Batch versus transaction

Both are a `POST` to the base URL with a Bundle of requests. The difference is a frequent
interview question:

- In a **batch**, the server processes each request independently. Some can succeed while
  others fail. Entries must not depend on each other.
- In a **transaction**, the server processes all requests as one unit: either every
  request succeeds or none of them take effect. Entries can refer to each other using
  temporary addresses of the form `urn:uuid:…`, which the server replaces with real
  addresses when it creates the records.

Use a transaction when records depend on each other, such as a new Patient and the
Observations about that patient.

### Operations

Some actions do not fit read, write and search. FHIR defines **operations** for these,
written with a `$` in the address. The ones to recognize:

| Operation | What it does |
|---|---|
| `Patient/123/$everything` | Return everything the server holds about one patient |
| `$export` | Bulk export (module 6) |
| `$validate` | Check a resource against the specification or a profile |
| `Patient/$match` | Find likely matching patients using a scoring algorithm |
| `Observation/$lastn` | Most recent observations per code |
| `ValueSet/$expand`, `CodeSystem/$lookup` | Terminology actions (module 4) |

### FHIRPath

**FHIRPath** is a small expression language for selecting elements from a resource, for
example `Patient.name.where(use='official').family`. You will see it in profile rules,
in search parameter definitions and in tools. You only need to recognize it and read
simple expressions.

## Read a real example

A search response, shortened. Labels follow.

```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 42,
  "link": [
    { "relation": "self", "url": "https://example.org/fhir/Observation?patient=123&_count=2" },
    { "relation": "next", "url": "https://example.org/fhir/Observation?patient=123&_count=2&_page=2" }
  ],
  "entry": [
    {
      "fullUrl": "https://example.org/fhir/Observation/a1",
      "resource": { "resourceType": "Observation", "id": "a1", "status": "final" },
      "search": { "mode": "match" }
    },
    {
      "fullUrl": "https://example.org/fhir/Observation/a2",
      "resource": { "resourceType": "Observation", "id": "a2", "status": "final" },
      "search": { "mode": "match" }
    }
  ]
}
```

- `total: 42` but only two entries: this is page one of 21. The `next` link must be
  followed to get the rest. The exact form of the `next` URL is chosen by the server;
  clients must use it as given rather than build it themselves.
- `search.mode` is `match` for results and `include` for records added by `_include`.

## Try it

All of these work in a browser. They use the public HAPI test server, which holds
synthetic (made-up) data. They were not tested from the environment this course was
written in; see the README.

1. `https://hapi.fhir.org/baseR4/metadata` — find `fhirVersion` and the list of resources.
2. `https://hapi.fhir.org/baseR4/Patient?name=smith&_count=5` — find the `next` link.
3. `https://hapi.fhir.org/baseR4/Observation?code=http://loinc.org|85354-9&_count=5`
4. Take a patient `id` from step 2 and open `https://hapi.fhir.org/baseR4/Patient/<id>/$everything`.
5. Turn each request below into a search URL on paper, then try it:
   - Female patients born before 1960.
   - Conditions for patient `<id>`, including the Patient record itself.
   - Observations updated in the last week, newest first, 10 at a time.
   - Patients who have at least one active MedicationRequest.
   - Encounters for patients named Smith, in one request.

Possible answers for step 5, to check after you try:

```
Patient?gender=female&birthdate=lt1960-01-01
Condition?patient=<id>&_include=Condition:patient
Observation?_lastUpdated=ge<date one week ago>&_sort=-_lastUpdated&_count=10
Patient?_has:MedicationRequest:patient:status=active
Encounter?patient.name=smith
```

The fourth line uses reverse chaining. Servers differ in how well they support `_has`,
so it may not work on every server; the CapabilityStatement says whether it is supported.

## Check yourself

1. List the main interactions and the HTTP method for each.
2. What is the difference between `POST /Patient` and `PUT /Patient/123`?
3. What is a CapabilityStatement, and why read it first?
4. How do `ETag` and `If-Match` prevent lost updates?
5. What does conditional create solve?
6. What are the search parameter types, and how is a token written?
7. What is the difference between chaining and `_include`?
8. Why must a client follow `next` links?
9. What is the difference between a batch and a transaction?
10. Name three operations and what they do.
