import assert from "node:assert/strict";
import { test } from "node:test";
import { get, parse, v2DateTime, v2ToFhir } from "./convert.ts";

const msh = "MSH|^~\\&|LAB|HOSP|EHR|HOSP|202610011000||ORU^R01|1|P|2.5.1";
const pid = "PID|1||12345^^^HOSP^MR~123-45-6789^^^SSA^SS||Smith^Jane^A||19800215|F";
const obx = (n: number, code: string, value: string, status = "F", when = "202610010930-0500") =>
  `OBX|${n}|NM|${code}^Test ${code}^L||${value}|%^percent^UCUM|||||${status}|||${when}`;

test("parse: MSH numbering, components, repetitions and line endings", () => {
  const msg = parse([msh, pid].join("\r\n"));
  assert.equal(msg.segments[0][1], "|"); // MSH-1 is the separator itself
  assert.equal(msg.segments[0][2], "^~\\&");
  assert.equal(get(msg, msg.segments[0], 9, 2), "R01");
  assert.equal(get(msg, msg.segments[1], 5, 2), "Jane");
  assert.equal(get(msg, msg.segments[1], 3, 4, 1), "SSA");
  assert.equal(parse([msh, pid].join("\n")).segments.length, 2);
  assert.throws(() => parse(pid), /must start with an MSH/);
});

test("parse honors the separators MSH declares", () => {
  const msg = parse("MSH#$~\\&#LAB\rPID#1##12345$$$HOSP$MR##Smith$Jane");
  assert.equal(get(msg, msg.segments[1], 5, 2), "Jane");
  assert.equal(get(msg, msg.segments[1], 3, 4), "HOSP");
});

test("v2 dates become FHIR dates; a time without a timezone keeps only the date", () => {
  assert.equal(v2DateTime("19800215"), "1980-02-15");
  assert.equal(v2DateTime("198002"), "1980-02");
  assert.equal(v2DateTime("202610010930-0500"), "2026-10-01T09:30:00-05:00");
  assert.equal(v2DateTime("20261001093015+0100"), "2026-10-01T09:30:15+01:00");
  const warnings: string[] = [];
  assert.equal(v2DateTime("202610010930", warnings), "2026-10-01");
  assert.match(warnings[0], /no timezone/);
  assert.equal(v2DateTime("nope", warnings), undefined);
});

test("PID becomes a Patient with identifier systems, name, gender and birthDate", () => {
  const { bundle } = v2ToFhir([msh, pid].join("\r"));
  const { resource, request } = bundle.entry[0];
  assert.deepEqual(resource, {
    resourceType: "Patient",
    identifier: [
      { system: "http://hospital.example.org/mrn", value: "12345" },
      { system: "http://hl7.org/fhir/sid/us-ssn", value: "123-45-6789" },
    ],
    name: [{ family: "Smith", given: ["Jane", "A"] }],
    gender: "female",
    birthDate: "1980-02-15",
  });
  assert.deepEqual(request, {
    method: "POST",
    url: "Patient",
    ifNoneExist: "identifier=http://hospital.example.org/mrn|12345",
  });
});

type Obs = {
  status: string;
  code: { coding: { system: string; code: string }[] };
  valueQuantity: unknown;
  effectiveDateTime: string;
  subject: { reference: string };
};

test("OBX becomes an Observation: LOINC mapping, unmapped flag, status, value, subject", () => {
  const { bundle, warnings } = v2ToFhir([msh, pid, obx(1, "HBA1C", "6.1"), obx(2, "XLDL7", "131", "P")].join("\r"));
  assert.equal(bundle.type, "transaction");
  const [patient, a1c, ldl] = bundle.entry;
  assert.match(patient.fullUrl, /^urn:uuid:/);

  const a1cObs = a1c.resource as unknown as Obs;
  assert.equal(a1cObs.code.coding[0].system, "http://loinc.org");
  assert.equal(a1cObs.code.coding[0].code, "4548-4");
  assert.equal(a1cObs.code.coding[1].code, "HBA1C"); // the local code is kept alongside
  assert.equal(a1cObs.status, "final");
  assert.deepEqual(a1cObs.valueQuantity, { value: 6.1, unit: "%", system: "http://unitsofmeasure.org", code: "%" });
  assert.equal(a1cObs.effectiveDateTime, "2026-10-01T09:30:00-05:00");
  assert.equal(a1cObs.subject.reference, patient.fullUrl);

  const ldlObs = ldl.resource as unknown as Obs;
  assert.equal(ldlObs.status, "preliminary");
  assert.deepEqual(
    ldlObs.code.coding.map((c: { code: string }) => c.code),
    ["XLDL7"],
  );
  assert.ok(warnings.some((w) => w.includes('"XLDL7"') && w.includes("no LOINC mapping")));
});

test("ADT^A01 gives just the Patient; other message types are rejected", () => {
  const adt = msh.replace("ORU^R01", "ADT^A01");
  assert.equal(v2ToFhir([adt, pid].join("\r")).bundle.entry.length, 1);
  assert.throws(() => v2ToFhir([msh.replace("ORU^R01", "ORM^O01"), pid].join("\r")), /unsupported message type/);
  assert.throws(() => v2ToFhir(msh), /no PID/);
});
