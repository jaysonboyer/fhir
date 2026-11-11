import FHIR from "fhirclient";
import { ageOn, OBSERVATION_CODES, type Observation, summarize } from "./observations.ts";

// index.html defines #errors, #loading, #holder and the table cells filled below.
const byId = (id: string) => document.getElementById(id) as HTMLElement;
const show = (id: string, value: string | number | undefined) => {
  byId(id).textContent = value === undefined ? "—" : String(value);
};

try {
  // The authorization server redirects here with ?code=…; ready() trades it for an access token.
  const client = await FHIR.oauth2.ready();
  const query = new URLSearchParams({ patient: `${client.patient.id}`, code: OBSERVATION_CODES });
  const [patient, observations] = await Promise.all([
    client.patient.read(),
    // pageLimit: 0 follows every next link; flat: true returns the resources instead of Bundles.
    client.request<Observation[]>(`Observation?${query}`, { pageLimit: 0, flat: true }),
  ]);

  const name = patient.name?.[0];
  show("fname", name?.given?.join(" "));
  show("lname", name?.family);
  show("gender", patient.gender);
  show("birthdate", patient.birthDate);
  show("age", patient.birthDate && ageOn(patient.birthDate));
  for (const [id, value] of Object.entries(summarize(observations))) show(id, value);
  byId("holder").hidden = false;
} catch (error) {
  byId("errors").textContent = error instanceof Error ? error.message : String(error);
} finally {
  byId("loading").hidden = true;
}
