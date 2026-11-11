import { readFileSync } from "node:fs";
import { readNdjson, runView, type ViewDefinition } from "./run-view.ts";

// Flattens the bulk-export demo's NDJSON into tables with two SQL on FHIR ViewDefinitions,
// then joins them on the patient key, which is what an analytics warehouse would do with SQL.
const file = (path: string) => new URL(`../${path}`, import.meta.url);
const resources = [...readNdjson(file("fixtures/Patient.ndjson")), ...readNdjson(file("fixtures/Observation.ndjson"))];
console.log(
  `Input: ${resources.length} resources from fixtures/*.ndjson (one per line, as a bulk export writes them)\n`,
);

const tables: Record<string, Record<string, unknown>[]> = {};
for (const name of ["patient_demographics", "observation_values"]) {
  const view = JSON.parse(readFileSync(file(`views/${name}.json`), "utf8")) as ViewDefinition;
  console.log(`ViewDefinition views/${name}.json:`);
  console.log(JSON.stringify(view, null, 2));
  tables[name] = runView(view, resources);
  console.log(`\nResult table ${name}:`);
  console.table(tables[name]);
  console.log();
}

console.log("Join observation_values.patient_id = patient_demographics.id:");
console.table(
  tables.observation_values.map((obs) => {
    const patient = tables.patient_demographics.find((p) => p.id === obs.patient_id);
    return { patient: `${patient?.given} ${patient?.family}`, test: obs.display, value: obs.value, unit: obs.unit };
  }),
);
