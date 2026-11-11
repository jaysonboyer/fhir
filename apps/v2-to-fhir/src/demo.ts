import { get, v2ToFhir } from "./convert.ts";

// An ORU^R01 lab result message carrying module 1's PID segment, with one result whose local
// code maps to LOINC (HbA1c) and one whose local code does not.
const sampleOru = [
  "MSH|^~\\&|LAB|HOSP|EHR|HOSP|202610011000-0500||ORU^R01|MSG00001|P|2.5.1",
  "PID|1||12345^^^HOSP^MR||Smith^Jane^A||19800215|F",
  "OBR|1||LAB-778|HBA1C^Hemoglobin A1c^L|||202610010930-0500",
  "OBX|1|NM|HBA1C^Hemoglobin A1c^L||6.1|%^percent^UCUM|4.0-5.6|H|||F|||202610010930-0500",
  "OBX|2|NM|XLDL7^Calculated LDL (method 7)^L||131|mg/dL^milligrams per deciliter^UCUM|<100|H|||F|||202610010930",
].join("\r"); // v2 ends segments with a carriage return

const { bundle, warnings, message } = v2ToFhir(sampleOru);
const [patientEntry, ...observationEntries] = bundle.entry;
const patient = patientEntry.resource as Record<string, unknown>;
const pid = message.segments.find((s) => s[0] === "PID");
const obx = message.segments.filter((s) => s[0] === "OBX");
const show = (v: unknown) => JSON.stringify(v);

console.log("HL7 v2 message (ORU^R01), one segment per line:");
for (const segment of sampleOru.split("\r")) console.log(`   ${segment}`);

console.log("\n1. Position becomes a named field:");
console.log(`   PID-5 "${pid?.[5]}" -> Patient.name ${show(patient.name)}`);
console.log("   (v2 means 'the 5th field, components family^given^middle'; FHIR says family and given by name)");

console.log("\n2. Date formats:");
console.log(`   PID-7 "${pid?.[7]}" -> Patient.birthDate "${patient.birthDate}"`);
for (const [i, entry] of observationEntries.entries()) {
  const effective = (entry.resource as { effectiveDateTime?: string }).effectiveDateTime;
  console.log(`   OBX-14 "${obx[i]?.[14]}" -> effectiveDateTime "${effective}"`);
}

console.log("\n3. The MRN becomes an identifier with a system saying who issued it:");
console.log(`   PID-3 "${pid?.[3]}" -> identifier ${show(patient.identifier)}`);
console.log(`   PID-8 "${pid?.[8]}" -> gender "${patient.gender}"`);
console.log(
  `   Conditional create, so a known patient is not duplicated: ifNoneExist ${show(
    (patientEntry.request as { ifNoneExist?: string }).ifNoneExist,
  )}`,
);

console.log("\n4. Local lab codes mapped to LOINC (a stand-in for the tenant's ConceptMap):");
for (const [i, entry] of observationEntries.entries()) {
  const codings = (entry.resource as { code: { coding: { system: string; code: string }[] } }).code.coding;
  console.log(`   OBX-3 "${get(message, obx[i], 3)}" -> ${codings.map((c) => `${c.system}|${c.code}`).join(" + ")}`);
}

console.log("\n5. Warnings a real interface engine would route to a person:");
for (const warning of warnings) console.log(`   - ${warning}`);

console.log("\n6. The FHIR transaction Bundle (urn:uuid fullUrls; Observation.subject points at the Patient's):");
console.log(JSON.stringify(bundle, null, 2).replace(/^/gm, "   "));
