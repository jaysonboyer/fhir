import FHIR from "fhirclient";
import type Client from "fhirclient/lib/Client";

// Only the fields this page reads; graph: true puts the resolved Medication at medicationReference.
type MedicationRequest = {
  medicationCodeableConcept?: { text?: string };
  medicationReference?: { code?: { text?: string } };
};
type Bundle = { entry?: { resource: MedicationRequest }[] };

// index.html defines #patient, #raw and #meds.
const byId = (id: string) => document.getElementById(id) as HTMLElement;
const patientEl = byId("patient");
const medsEl = byId("meds");

const listItem = (text: string) => Object.assign(document.createElement("li"), { textContent: text });
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const showPatientError = (error: unknown) => {
  patientEl.textContent = messageOf(error);
};
const showMedsError = (error: unknown) => medsEl.replaceChildren(listItem(messageOf(error)));

async function showPatient(client: Client) {
  const patient = await client.patient.read();
  const name = patient.name?.[0];
  patientEl.textContent = `${name?.given?.join(" ") ?? ""} ${name?.family ?? ""} — ${patient.gender}, born ${patient.birthDate}`;
  byId("raw").textContent = JSON.stringify(patient, null, 2);
}

async function showMeds(client: Client) {
  // pageLimit: 0 follows every next link; without flat, that returns one Bundle per page.
  const pages = await client.request<Bundle | Bundle[]>(`MedicationRequest?patient=${client.patient.id}`, {
    resolveReferences: ["medicationReference"],
    graph: true,
    pageLimit: 0,
  });
  const meds = [pages].flat().flatMap((bundle) => (bundle.entry ?? []).map((entry) => entry.resource));
  medsEl.replaceChildren(
    ...meds.map((med) =>
      listItem(med.medicationCodeableConcept?.text ?? med.medicationReference?.code?.text ?? "(unnamed medication)"),
    ),
  );
  if (!meds.length) medsEl.replaceChildren(listItem("No medications found for the selected patient"));
}

// Step 2: the authorization server redirects back here with ?code=…; ready() trades it
// for an access token and returns a client bound to the launch's patient.
try {
  const client = await FHIR.oauth2.ready();
  await Promise.all([showPatient(client).catch(showPatientError), showMeds(client).catch(showMedsError)]);
} catch (error) {
  showPatientError(error);
  showMedsError(error);
}
