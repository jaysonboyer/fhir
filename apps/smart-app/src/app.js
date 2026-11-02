import FHIR from "fhirclient";

// Step 2: the authorization server redirects back here with ?code=…; ready() trades it
// for an access token and returns a client bound to the launch's patient.
const client = await FHIR.oauth2.ready();

const patient = await client.patient.read();
const name = patient.name?.[0];
document.getElementById("patient").textContent =
  `${name?.given?.join(" ") ?? ""} ${name?.family ?? ""} — ${patient.gender}, born ${patient.birthDate}`;
document.getElementById("raw").textContent = JSON.stringify(patient, null, 2);

// Plain FHIR search, scoped to the patient. resolveReferences inlines the Medication resource.
const meds = await client.request(`MedicationRequest?patient=${client.patient.id}`, {
  pageLimit: 0,
  flat: true,
  resolveReferences: "medicationReference",
});
const list = document.getElementById("meds");
for (const med of meds) {
  const li = document.createElement("li");
  li.textContent =
    med.medicationCodeableConcept?.text ?? med.medicationReference?.code?.text ?? "(unnamed medication)";
  list.append(li);
}
if (!meds.length) list.innerHTML = "<li>None found</li>";
