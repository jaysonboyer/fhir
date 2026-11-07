# Module 2: Resources and data types

Specification to check against: https://hl7.org/fhir/R4/resource.html and
https://hl7.org/fhir/R4/datatypes.html

## Concepts

### Every resource shares a common shape

Module 1 defined a resource as one record of one type. Every resource, whatever its type,
starts with the same few elements, defined by the specification's base `Resource` and
`DomainResource` definitions:

- **`resourceType`** names the type, such as `"Patient"`. It is always present in JSON.
- **`id`** is the record's identifier *on this one server*. The server assigns it, and a
  different server holding the same patient will use a different `id`.
- **`meta`** holds information about the record itself rather than about the patient,
  such as `versionId` (which version of the record this is), `lastUpdated`, and
  `profile` (the list of profiles the record claims to follow; module 4).
- **`text`** is a human-readable HTML summary called the **narrative**. The specification
  expects most resources to carry one so that a person can read the record even if their
  software does not understand every field.
- **`extension`** and **`modifierExtension`** hold extra data not in the base definition
  (module 4).
- **`contained`** holds small resources embedded inside this one that have no identity
  of their own. It is used only when the embedded record cannot exist separately.

### `id` versus `identifier`

This distinction is one of the most common interview questions, because confusing them
causes real bugs.

**`id`** is the server's own key for the record. It appears in the web address, as in
`Patient/123`. It means nothing outside that server.

**`identifier`** is a list of business identifiers that exist in the real world, such as
a medical record number, a Social Security number, or an insurance member ID. Each
identifier has a `system` (a web address naming who issued it) and a `value`. The same
person keeps the same identifiers when their record is copied to a different server.

So when you match patients between two systems, you compare `identifier` values with the
same `system`, not `id` values. Comparing `id` values across servers would match
unrelated records.

### Elements, types and cardinality

Each element in a resource has a **type** and a **cardinality**. Cardinality is written
as `min..max` and says how many times the element may appear:

| Cardinality | Meaning |
|---|---|
| `0..1` | Optional, at most one |
| `1..1` | Required, exactly one |
| `0..*` | Optional, any number (a JSON array) |
| `1..*` | Required, at least one |

Most elements in the base specification are optional (`0..1` or `0..*`). This rests on
the 80 percent design rule from module 1. The practical consequence, which interviewers
like to hear, is that software reading FHIR must expect almost any element to be missing
and must not crash when it is. The repo's own data standard
([.werkmeister/standards/fhir-data/STANDARD.md](../.werkmeister/standards/fhir-data/STANDARD.md))
states the same rule.

### Modifier elements

A **modifier element** is an element whose value changes the meaning of the rest of the
record. Examples:

- `Patient.active = false` means the record is no longer in use.
- `Observation.status = "entered-in-error"` means the reading was recorded by mistake
  and must not be treated as a real result.
- `AllergyIntolerance.verificationStatus = "refuted"` means the patient does *not* have
  the allergy.

Software that ignores a modifier element can show wrong clinical information. The
specification marks these elements with "?!" in the content table. Being able to name
one is a good way to show you understand real-world risk.

### Data types

Elements use a fixed set of data types. There are two groups.

**Primitive types** hold one value: `string`, `boolean`, `integer`, `decimal`, `uri`,
`code` (a value from a fixed list), `date`, `dateTime`, `instant`, and a few others.

A detail worth knowing: FHIR dates may be partial. `"1980"`, `"1980-02"` and
`"1980-02-15"` are all valid `date` values. Software that assumes a full date will fail
on real data.

**Complex types** are small structures made of other elements. These are the ones to
know well, because they appear in almost every resource:

| Type | What it holds | Example use |
|---|---|---|
| `Identifier` | `system` + `value` (+ `type`, `use`) | Medical record number |
| `HumanName` | `family`, `given[]`, `prefix`, `use` | A patient's name |
| `Coding` | One code: `system` + `code` + `display` | One LOINC code |
| `CodeableConcept` | A list of `Coding`s plus free `text` | A diagnosis, coded in several systems at once |
| `Quantity` | `value` + `unit` + `system` + `code` | 120 mmHg |
| `Reference` | `reference` (e.g. `"Patient/123"`) + `display` | Which patient an Observation is about |
| `Period` | `start` + `end` | Dates of a hospital stay |
| `ContactPoint` | `system` (phone, email) + `value` + `use` | A phone number |
| `Address` | Lines, city, state, postal code | A home address |

### Coding versus CodeableConcept

A **`Coding`** is one code from one code system. A **`CodeableConcept`** wraps one or more
`Coding`s plus a `text` field. The reason for the wrapper is that one clinical idea is
often coded in several systems at once: a diagnosis might carry both a SNOMED CT code (a
clinical terminology) and an ICD-10-CM code (a billing classification), so that clinical
software and billing software can each use the one they understand. Module 4 covers code
systems.

When reading codes, match on `system` plus `code`, never on `display`. The `display` text
is only a label and different servers word it differently. This also rests on the repo's
data standard.

### References link resources together

A **`Reference`** points from one resource to another. An Observation's `subject` points to
the Patient it is about; a MedicationRequest's `requester` points to the Practitioner who
ordered it. References can take three forms:

1. **Relative**: `"Patient/123"`, meaning Patient 123 on the same server.
2. **Absolute**: `"https://other.example.org/fhir/Patient/123"`, on a different server.
3. **Contained**: `"#med1"`, meaning a resource inside this one's `contained` list.

A reference can also hold only an `identifier` (a business identifier) when the target's
server address is not known.

The `display` in a reference is a convenience label. Do not parse it for data; follow
`reference` instead.

### Choice elements: `value[x]`

Some elements can hold different types. The specification writes these with `[x]`, as in
`Observation.value[x]`. In actual JSON, `[x]` is replaced with the type name:
`valueQuantity` for a number with units, `valueString` for text, `valueCodeableConcept`
for a coded answer, and so on. Only one form appears in a given record.

### Missing data on purpose

When an element is required by a profile but the value is unknown, FHIR uses the
`dataAbsentReason` extension or element to say why (for example `"unknown"`,
`"asked-declined"`, `"not-performed"`). This lets the system say "we asked and the
patient declined" rather than leaving a silent gap.

### The resources you should know by name

Interviews usually focus on a small group of clinical and administrative resources. The
list below rests on which resources US Core (module 7) requires, since that list reflects
what US systems actually exchange.

| Resource | What one record represents |
|---|---|
| Patient | A person receiving care |
| Practitioner | A clinician |
| PractitionerRole | A clinician's role at an organization (specialty, location) |
| Organization | A hospital, clinic, payer or other group |
| Location | A physical place |
| Encounter | One interaction between patient and provider, such as a visit or a stay |
| Observation | A measurement or finding: vital signs, lab results, smoking status |
| Condition | A problem or diagnosis |
| AllergyIntolerance | An allergy or intolerance |
| MedicationRequest | An order or prescription for a medication |
| Medication | The medication itself, when more detail is needed than a code |
| Procedure | Something done to the patient |
| Immunization | A vaccine given |
| DiagnosticReport | A report grouping results, such as a lab panel or a radiology report |
| DocumentReference | A pointer to a document, such as a PDF or a clinical note |
| CarePlan, Goal, CareTeam | Planned care, targets and the people involved |
| Coverage, ExplanationOfBenefit | Insurance coverage, and a processed claim (payer data) |

Infrastructure resources, covered in later modules: Bundle (a group of resources),
OperationOutcome (an error or warning report), CapabilityStatement (what a server
supports), StructureDefinition, ValueSet, CodeSystem.

## Read a real example

A blood pressure reading. Blood pressure is a good example because it has two values
recorded together.

```json
{
  "resourceType": "Observation",
  "id": "bp-1",
  "meta": {
    "profile": ["http://hl7.org/fhir/StructureDefinition/bp"]
  },
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "vital-signs"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      { "system": "http://loinc.org", "code": "85354-9", "display": "Blood pressure panel" }
    ],
    "text": "Blood pressure"
  },
  "subject": { "reference": "Patient/example" },
  "effectiveDateTime": "2026-10-01T09:30:00-05:00",
  "component": [
    {
      "code": { "coding": [{ "system": "http://loinc.org", "code": "8480-6" }] },
      "valueQuantity": {
        "value": 120, "unit": "mmHg",
        "system": "http://unitsofmeasure.org", "code": "mm[Hg]"
      }
    },
    {
      "code": { "coding": [{ "system": "http://loinc.org", "code": "8462-4" }] },
      "valueQuantity": {
        "value": 80, "unit": "mmHg",
        "system": "http://unitsofmeasure.org", "code": "mm[Hg]"
      }
    }
  ]
}
```

Line by line:

- `meta.profile` says this record claims to follow the base specification's vital signs
  blood pressure profile (module 4).
- `status: "final"` is a modifier element. A value of `"entered-in-error"` would mean
  ignore this reading.
- `category` says what kind of observation this is, using a code system defined by HL7.
- `code` says *what was measured*. LOINC code `85354-9` is the blood pressure panel.
  LOINC is the standard code system for lab tests and measurements.
- `subject` is a relative reference to the Patient.
- `effectiveDateTime` is when the measurement applies. It is `effective[x]` with the
  `dateTime` type; a measurement over a time span would use `effectivePeriod`.
- `component` holds the two parts. `8480-6` is systolic (the top number) and `8462-4` is
  diastolic (the bottom number). Each has its own `valueQuantity`.
- `unit` is for display; `system` + `code` is the UCUM unit code that software should use.
  UCUM (Unified Code for Units of Measure) is the standard system for units.

The LOINC codes above are the ones the FHIR vital signs profile specifies. Checking them
against https://hl7.org/fhir/R4/observation-vitalsigns.html is a good exercise.

## Try it

1. Open https://hl7.org/fhir/R4/patient-example.json.html and label every element using
   this module: which are from the common shape, which are complex types, and which
   (if any) are modifier elements.
2. Open https://hl7.org/fhir/R4/observation.html, go to the Content tab, and find every
   element marked with "?!". Write down what each one would mean if set to an unusual value.
3. In the public test server, open
   `https://hapi.fhir.org/baseR4/Patient?_count=1` and find the `id` and any `identifier`.
   (Untested from the environment this course was written in; see the README.)

## Check yourself

1. What is the difference between `id` and `identifier`, and which do you use to match
   patients across systems?
2. What does cardinality `0..*` mean, and what does it imply for code that reads FHIR?
3. Name two modifier elements and explain what goes wrong if software ignores them.
4. What is the difference between `Coding` and `CodeableConcept`, and why does the
   wrapper exist?
5. What are the three forms of a `Reference`?
6. What does `value[x]` mean, and what does it look like in JSON?
7. Why should you match codes on `system` and `code`, not `display`?
