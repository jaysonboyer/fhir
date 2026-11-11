import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { errors, fixtures, hasJava, jar, validate } from "./validate.ts";

const usCorePatient = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient";

test("fixtures are JSON Patients that claim US Core Patient", () => {
  for (const file of ["patient-valid.json", "patient-invalid.json"]) {
    const patient = JSON.parse(readFileSync(`${fixtures}${file}`, "utf8"));
    assert.equal(patient.resourceType, "Patient");
    assert.deepEqual(patient.meta.profile, [usCorePatient]);
  }
});

// Slow (the validator loads US Core packages) and needs the jar from `pnpm demo`, so it skips without them.
test("the validator passes the valid Patient and fails the invalid one", (t) => {
  if (!hasJava() || !existsSync(jar)) return t.skip("needs java and the jar downloaded by `pnpm demo`");
  assert.equal(errors(validate("patient-valid.json")).length, 0);
  assert.ok(errors(validate("patient-invalid.json")).length >= 3);
});
