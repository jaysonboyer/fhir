// Pure helpers for the tutorial's observation table (no fhirclient import, so node --test can load them).

type CodeableConcept = { coding?: { system?: string; code?: string }[] };
type Quantity = { value?: number; unit?: string };
export type Observation = {
  code: CodeableConcept;
  effectiveDateTime?: string;
  valueQuantity?: Quantity;
  component?: { code: CodeableConcept; valueQuantity?: Quantity }[];
};

const LOINC = "http://loinc.org";
const HEIGHT = "8302-2";
const SYSTOLIC = "8480-6";
const DIASTOLIC = "8462-4";
const HDL = "2085-9";
const LDL = "2089-1";
// R4 blood pressure panel is 85354-9; the tutorial's DSTU2 data used 55284-4.
const BP_PANELS = ["85354-9", "55284-4"];

// Value for Observation?code=…: every code the table needs, OR-ed.
export const OBSERVATION_CODES = [HEIGHT, SYSTOLIC, DIASTOLIC, HDL, LDL, ...BP_PANELS]
  .map((code) => `${LOINC}|${code}`)
  .join(",");

const hasCode = (concept: CodeableConcept, code: string) =>
  concept.coding?.some((c) => c.system === LOINC && c.code === code) ?? false;
const format = (q?: Quantity) => (q?.value === undefined ? undefined : `${q.value} ${q.unit ?? ""}`.trim());
const time = (o: Observation) => Date.parse(o.effectiveDateTime ?? "") || 0;

export function summarize(observations: Observation[]) {
  const newestFirst = [...observations].sort((a, b) => time(b) - time(a));
  const latest = (code: string) => format(newestFirst.find((o) => hasCode(o.code, code))?.valueQuantity);
  // Blood pressure arrives as a panel with components, or as a standalone observation.
  const bloodPressure = (code: string) => {
    for (const o of newestFirst) {
      if (hasCode(o.code, code)) return format(o.valueQuantity);
      const component = BP_PANELS.some((panel) => hasCode(o.code, panel))
        ? o.component?.find((c) => hasCode(c.code, code))
        : undefined;
      if (component) return format(component.valueQuantity);
    }
  };
  return {
    height: latest(HEIGHT),
    systolicbp: bloodPressure(SYSTOLIC),
    diastolicbp: bloodPressure(DIASTOLIC),
    ldl: latest(LDL),
    hdl: latest(HDL),
  };
}

// Whole years between a FHIR date ("YYYY", "YYYY-MM" or "YYYY-MM-DD") and today.
export function ageOn(birthDate: string, today = new Date()) {
  const [year, month = 1, day = 1] = birthDate.split("-").map(Number);
  const beforeBirthday = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  return today.getFullYear() - year - (beforeBirthday ? 1 : 0);
}
