import { randomUUID } from "node:crypto";

// Converts an HL7 v2 ADT^A01 or ORU^R01 message into a FHIR R4 transaction Bundle:
// PID -> Patient, each OBX -> Observation. Module 1 and module 8 (worked question 3) explain why.

export type V2Message = { segments: string[][]; component: string; repetition: string };

// shortcut: v2 escape sequences (\F\, \S\, \T\, \R\, \E\) are not decoded; add that before real feeds.
export function parse(text: string): V2Message {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim());
  if (!lines[0]?.startsWith("MSH")) throw new Error("an HL7 v2 message must start with an MSH segment");
  // MSH-1 is the field separator itself and MSH-2 lists the other separators, so read them, never assume.
  const fieldSep = lines[0][3];
  const [component, repetition] = lines[0].slice(4, 6);
  const segments = lines.map((line) => {
    const fields = line.split(fieldSep);
    if (fields[0] === "MSH") fields.splice(1, 0, fieldSep); // so MSH-n is fields[n] like every other segment
    return fields;
  });
  return { segments, component, repetition };
}

/** Field `field`, component `comp` (1-based, as v2 numbers them), repetition `rep` (0-based). */
export function get(msg: V2Message, seg: string[] | undefined, field: number, comp = 1, rep = 0) {
  return seg?.[field]?.split(msg.repetition)[rep]?.split(msg.component)[comp - 1] ?? "";
}

const assigningAuthorities: Record<string, string> = {
  HOSP: "http://hospital.example.org/mrn",
  SSA: "http://hl7.org/fhir/sid/us-ssn",
};
const genders: Record<string, string> = { F: "female", M: "male", O: "other", U: "unknown" };
const statuses: Record<string, string> = { F: "final", P: "preliminary", C: "corrected" };
const localLabSystem = "http://hospital.example.org/lab-codes";

// A stand-in for a ConceptMap: in production this is the tenant's code mapping, often a $translate call.
export const localToLoinc: Record<string, { code: string; display: string }> = {
  HBA1C: { code: "4548-4", display: "Hemoglobin A1c/Hemoglobin.total in Blood" },
  GLU: { code: "2345-7", display: "Glucose [Mass/volume] in Serum or Plasma" },
};

/** v2 DT/DTM (YYYY[MM[DD[HHMM[SS]]]][+/-ZZZZ]) to a FHIR date or dateTime. */
export function v2DateTime(value: string, warnings: string[] = []) {
  const m = value.match(/^(\d{4})(\d{2})?(\d{2})?(?:(\d{2})(\d{2})(\d{2})?(?:\.\d+)?)?([+-]\d{4})?$/);
  if (!m) {
    if (value) warnings.push(`unreadable v2 date "${value}" dropped`);
    return undefined;
  }
  const [, y, mo, d, h, mi, s = "00", zone] = m;
  const date = [y, mo, d].filter(Boolean).join("-");
  if (!h) return date;
  // A FHIR dateTime with a time must carry a timezone; v2 often omits it, so keep only the date.
  if (!zone) {
    warnings.push(`"${value}" has a time but no timezone, so only the date ${date} was kept`);
    return date;
  }
  return `${date}T${h}:${mi}:${s}${zone.slice(0, 3)}:${zone.slice(3)}`;
}

export function v2ToFhir(text: string) {
  const msg = parse(text);
  const warnings: string[] = [];
  const find = (name: string) => msg.segments.filter((s) => s[0] === name);
  const msh = find("MSH")[0];
  const type = `${get(msg, msh, 9, 1)}^${get(msg, msh, 9, 2)}`;
  if (type !== "ADT^A01" && type !== "ORU^R01") throw new Error(`unsupported message type ${type}`);
  const pid = find("PID")[0];
  if (!pid) throw new Error("message has no PID segment");

  // PID-3 can repeat: one identifier per repetition, each with its issuer in component 4.
  const identifier = (pid[3] ?? "").split(msg.repetition).map((_, rep) => {
    const authority = get(msg, pid, 3, 4, rep);
    const system = assigningAuthorities[authority];
    if (!system) warnings.push(`no system known for assigning authority "${authority}"`);
    return { ...(system && { system }), value: get(msg, pid, 3, 1, rep), type: get(msg, pid, 3, 5, rep) };
  });
  const mrn = identifier.find((i) => i.type === "MR" && i.system) ?? identifier.find((i) => i.system);
  const genderCode = get(msg, pid, 8);
  if (genderCode && !genders[genderCode]) warnings.push(`unknown v2 sex "${genderCode}" dropped`);
  const patient = {
    resourceType: "Patient",
    identifier: identifier.map(({ system, value }) => ({ ...(system && { system }), value })),
    name: [
      {
        family: get(msg, pid, 5, 1),
        given: [get(msg, pid, 5, 2), get(msg, pid, 5, 3)].filter(Boolean),
      },
    ],
    gender: genders[genderCode],
    birthDate: v2DateTime(get(msg, pid, 7), warnings),
  };
  const patientUrl = `urn:uuid:${randomUUID()}`;

  const obr = find("OBR")[0];
  const observations = find("OBX").map((obx) => {
    const localCode = get(msg, obx, 3, 1);
    const text = get(msg, obx, 3, 2);
    const loinc = localToLoinc[localCode];
    if (!loinc) warnings.push(`local code "${localCode}" (${text}) has no LOINC mapping, kept as a local code only`);
    const coding = [
      ...(loinc ? [{ system: "http://loinc.org", ...loinc }] : []),
      { system: localLabSystem, code: localCode, display: text },
    ];
    const statusCode = get(msg, obx, 11);
    if (!statuses[statusCode]) warnings.push(`OBX-11 status "${statusCode}" not mapped, used "unknown"`);

    const valueType = get(msg, obx, 2);
    const raw = get(msg, obx, 5);
    const unitIsUcum = get(msg, obx, 6, 3) === "UCUM";
    let value: Record<string, unknown> = {};
    if (valueType === "NM" && Number.isFinite(Number(raw))) {
      const unit = get(msg, obx, 6, 1);
      value = {
        valueQuantity: {
          value: Number(raw),
          unit,
          ...(unitIsUcum && { system: "http://unitsofmeasure.org", code: unit }),
        },
      };
    } else if (valueType === "ST") value = { valueString: raw };
    else warnings.push(`OBX value type "${valueType}" with value "${raw}" not converted`);

    return {
      resourceType: "Observation",
      status: statuses[statusCode] ?? "unknown",
      code: { coding, text },
      subject: { reference: patientUrl },
      // OBX-14 is when this result was observed; fall back to OBR-7 for the whole order.
      effectiveDateTime: v2DateTime(get(msg, obx, 14) || get(msg, obr, 7), warnings),
      ...value,
    };
  });

  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        fullUrl: patientUrl,
        resource: patient,
        // Conditional create: the server makes the Patient only if no Patient has this MRN yet.
        request: {
          method: "POST",
          url: "Patient",
          ...(mrn && { ifNoneExist: `identifier=${mrn.system}|${mrn.value}` }),
        },
      },
      ...observations.map((resource) => ({
        fullUrl: `urn:uuid:${randomUUID()}`,
        resource,
        request: { method: "POST", url: "Observation" },
      })),
    ],
  };
  return { bundle, warnings, message: msg };
}
