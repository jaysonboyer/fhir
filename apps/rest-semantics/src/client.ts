// Walks the write side of the FHIR REST API against the server in server.ts (start it first with `pnpm dev`).
const base = process.env.FHIR_BASE ?? "http://localhost:3004";
const json = { "Content-Type": "application/fhir+json" };
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(path.startsWith("http") ? path : `${base}${path}`, {
    method,
    headers: { ...json, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const diagnostics = async (res: Response) => (await res.json()).issue[0].diagnostics;
const count = async () => (await (await call("GET", "/Patient?_count=0")).json()).total;
const mrn = { system: "http://hospital.example.org/mrn", value: "12345" };
const ada = { resourceType: "Patient", identifier: [mrn], name: [{ family: "Lovelace", given: ["Ada"] }] };

console.log("1. Create: POST /Patient");
const created = await call("POST", "/Patient", ada);
const patient = await created.json();
console.log(`   ${created.status}, Location: ${created.headers.get("location")}, ETag: ${created.headers.get("etag")}`);

const ifNoneExist = `identifier=${mrn.system}|${mrn.value}`;
console.log(`2. Conditional create: POST /Patient with If-None-Exist: ${ifNoneExist}`);
const again = await call("POST", "/Patient", ada, { "If-None-Exist": ifNoneExist });
console.log(`   ${again.status}, id ${(await again.json()).id}: the existing Patient, no duplicate made`);

console.log(`3. Update: PUT /Patient/${patient.id} with If-Match: W/"1"`);
const updated = await call("PUT", `/Patient/${patient.id}`, { ...patient, gender: "female" }, { "If-Match": 'W/"1"' });
console.log(`   ${updated.status}, ETag: ${updated.headers.get("etag")}`);

console.log(`4. Stale update: PUT again with the old If-Match: W/"1"`);
const stale = await call(
  "PUT",
  `/Patient/${patient.id}`,
  { ...patient, birthDate: "1815-12-10" },
  { "If-Match": 'W/"1"' },
);
console.log(`   ${stale.status}: ${await diagnostics(stale)}`);
console.log("   Without If-Match this write would silently undo step 3's change.");

console.log("5. Transaction: POST / with two new Patients, the second pointing at the first by urn:uuid");
const parent = { fullUrl: "urn:uuid:4b3a8f0e-0000-4000-8000-000000000001" };
const tx = await call("POST", "/", {
  resourceType: "Bundle",
  type: "transaction",
  entry: [
    {
      ...parent,
      resource: { resourceType: "Patient", name: [{ family: "Byron", given: ["Anne"] }] },
      request: { method: "POST", url: "Patient" },
    },
    {
      fullUrl: "urn:uuid:4b3a8f0e-0000-4000-8000-000000000002",
      resource: {
        resourceType: "Patient",
        name: [{ family: "King", given: ["Byron"] }],
        link: [{ other: { reference: parent.fullUrl }, type: "seealso" }],
      },
      request: { method: "POST", url: "Patient" },
    },
  ],
});
const txBody = await tx.json();
for (const e of txBody.entry)
  console.log(`   ${tx.status} ${txBody.type}: ${e.response.status} ${e.response.location}`);
const childId = txBody.entry[1].response.location.split("/")[2];
const child = await (await call("GET", `/Patient/${childId}`)).json();
console.log(`   ${parent.fullUrl} was rewritten to ${child.link[0].other.reference}`);

const good = { resourceType: "Patient", name: [{ family: "Babbage", given: ["Charles"] }] };
const bad = { resourceType: "Patient", name: [{ family: "Typo" }], gender: "F" };
const entries = [good, bad].map((resource) => ({ resource, request: { method: "POST", url: "Patient" } }));

const before = await count();
console.log(`6. Failing transaction: one good Patient and one with gender "F" (not a valid code)`);
const failed = await call("POST", "/", { resourceType: "Bundle", type: "transaction", entry: entries });
console.log(`   ${failed.status}: ${await diagnostics(failed)}`);
console.log(`   Patients before: ${before}, after: ${await count()}. The good entry was rolled back too.`);

console.log("7. The same two entries as a batch");
const batch = await call("POST", "/", { resourceType: "Bundle", type: "batch", entry: entries });
const batchBody = await batch.json();
for (const e of batchBody.entry) console.log(`   ${batch.status} ${batchBody.type}: ${e.response.status}`);
console.log(`   Patients now: ${await count()}. In a batch each entry succeeds or fails on its own.`);

console.log("8. Paging: GET /Patient?_count=2, then follow each `next` link exactly as given");
let url: string | undefined = `${base}/Patient?_count=2`;
for (let n = 1; url; n++) {
  const bundle = await (await call("GET", url)).json();
  const ids = bundle.entry.map((e: { resource: { id: string } }) => e.resource.id).join(", ");
  console.log(`   Page ${n} of ${Math.ceil(bundle.total / 2)} (total ${bundle.total}): Patient ${ids}`);
  url = bundle.link.find((l: { relation: string }) => l.relation === "next")?.url;
  if (url) console.log(`   next: ${url}`);
}
