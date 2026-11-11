import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { evaluate, readNdjson, runView, type ViewDefinition } from "./run-view.ts";

const patient = (id: string, names: { family?: string; given?: string[] }[]) => ({
  resourceType: "Patient",
  id,
  name: names,
});

test("forEach makes one row per item and drops resources with none", () => {
  const view: ViewDefinition = {
    resource: "Patient",
    select: [
      { column: [{ name: "id", path: "getResourceKey()" }] },
      { forEach: "name", column: [{ name: "family", path: "family" }] },
    ],
  };
  const rows = runView(view, [patient("a", [{ family: "X" }, { family: "Y" }]), patient("b", [])]);
  assert.deepEqual(rows, [
    { id: "a", family: "X" },
    { id: "a", family: "Y" },
  ]);
});

test("forEachOrNull keeps a resource with none, with null columns", () => {
  const view: ViewDefinition = {
    resource: "Patient",
    select: [
      { column: [{ name: "id", path: "getResourceKey()" }] },
      { forEachOrNull: "name", column: [{ name: "family", path: "family" }] },
    ],
  };
  assert.deepEqual(runView(view, [patient("b", [])]), [{ id: "b", family: null }]);
});

test("where filters resources, and constants feed where() inside paths", () => {
  const view: ViewDefinition = {
    resource: "Observation",
    constant: [{ name: "loinc", valueUri: "http://loinc.org" }],
    where: [{ path: "status = 'final'" }],
    column: [{ name: "code", path: "code.coding.where(system = %loinc).code" }],
  };
  const obs = (status: string) => ({
    resourceType: "Observation",
    status,
    code: {
      coding: [
        { system: "http://snomed.info/sct", code: "1" },
        { system: "http://loinc.org", code: "2" },
      ],
    },
  });
  assert.deepEqual(runView(view, [obs("final"), obs("preliminary"), { resourceType: "Patient" }]), [{ code: "2" }]);
});

test("a non-collection column that returns several values is an error", () => {
  const view: ViewDefinition = { resource: "Patient", column: [{ name: "given", path: "name.given" }] };
  const p = patient("a", [{ given: ["Ada", "King"] }]);
  assert.throws(() => runView(view, [p]), /set collection: true/);
  const asCollection: ViewDefinition = {
    resource: "Patient",
    column: [{ name: "given", path: "name.given", collection: true }],
  };
  assert.deepEqual(runView(asCollection, [p]), [{ given: ["Ada", "King"] }]);
});

test("FHIRPath subset: reference keys, choice types, join, unsupported input", () => {
  const obs = { subject: { reference: "Patient/p1" }, valueQuantity: { value: 6.1 } };
  assert.deepEqual(evaluate("subject.getReferenceKey(Patient)", [obs]), ["p1"]);
  assert.deepEqual(evaluate("subject.getReferenceKey(Group)", [obs]), []);
  assert.deepEqual(evaluate("value.ofType(Quantity).value", [obs]), [6.1]);
  assert.deepEqual(evaluate("given.join(' ')", [{ given: ["Ada", "King"] }]), ["Ada King"]);
  assert.deepEqual(evaluate("missing = 'x'", [{}]), []);
  assert.throws(() => evaluate("name.count()", [{}]), /Unsupported FHIRPath function count/);
  assert.throws(() => evaluate("status != 'final'", [{}]), /Unsupported FHIRPath/);
});

test("the demo views flatten the fixtures", () => {
  const file = (path: string) => new URL(`../${path}`, import.meta.url);
  const resources = [
    ...readNdjson(file("fixtures/Patient.ndjson")),
    ...readNdjson(file("fixtures/Observation.ndjson")),
  ];
  const view = (name: string) => JSON.parse(readFileSync(file(`views/${name}.json`), "utf8")) as ViewDefinition;
  assert.deepEqual(runView(view("patient_demographics"), resources), [
    { id: "p1", family: "Lovelace", given: "Ada" },
    { id: "p2", family: "Turing", given: "Alan" },
  ]);
  assert.deepEqual(runView(view("observation_values"), resources)[0], {
    id: "o1",
    patient_id: "p1",
    value: 6.1,
    unit: "%",
    loinc_code: "4548-4",
    display: "Hemoglobin A1c",
  });
});
