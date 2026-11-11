import assert from "node:assert/strict";
import { test } from "node:test";
import { ageOn, type Observation, summarize } from "./observations.ts";

const loinc = (code: string) => ({ coding: [{ system: "http://loinc.org", code }] });
const quantity = (value: number, unit: string) => ({ value, unit });

test("summarize takes the newest value per code, including BP panel components", () => {
  const observations: Observation[] = [
    { code: loinc("8302-2"), effectiveDateTime: "2020-01-01", valueQuantity: quantity(170, "cm") },
    { code: loinc("8302-2"), effectiveDateTime: "2023-01-01", valueQuantity: quantity(172, "cm") },
    {
      code: loinc("85354-9"),
      effectiveDateTime: "2022-05-01",
      component: [
        { code: loinc("8480-6"), valueQuantity: quantity(120, "mm[Hg]") },
        { code: loinc("8462-4"), valueQuantity: quantity(80, "mm[Hg]") },
      ],
    },
    { code: loinc("8480-6"), effectiveDateTime: "2021-01-01", valueQuantity: quantity(140, "mm[Hg]") },
    { code: loinc("2085-9"), valueQuantity: quantity(55, "mg/dL") },
  ];
  assert.deepEqual(summarize(observations), {
    height: "172 cm",
    systolicbp: "120 mm[Hg]",
    diastolicbp: "80 mm[Hg]",
    ldl: undefined,
    hdl: "55 mg/dL",
  });
});

test("summarize ignores non-LOINC codings", () => {
  const other = {
    code: { coding: [{ system: "http://example.org", code: "8302-2" }] },
    valueQuantity: quantity(1, "m"),
  };
  assert.equal(summarize([other]).height, undefined);
});

test("ageOn counts whole years and handles partial dates", () => {
  const today = new Date(2026, 10, 10); // 2026-11-10
  assert.equal(ageOn("1984-07-02", today), 42);
  assert.equal(ageOn("1984-11-11", today), 41);
  assert.equal(ageOn("1984-11-10", today), 42);
  assert.equal(ageOn("1984", today), 42);
});
