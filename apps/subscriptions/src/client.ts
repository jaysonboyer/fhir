import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout } from "node:timers/promises";

// Subscribes to HbA1c results on the server in server.ts (start it first with `pnpm dev`), then creates
// one Observation that matches and one that doesn't, and shows that only the match triggers a notification.
const base = process.env.FHIR_BASE ?? "http://localhost:3003";
const hba1c = "http://loinc.org|4548-4";
const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/fhir+json" },
    body: JSON.stringify(body),
  });
const observation = (code: string, display: string, value: number, unit: string) => ({
  resourceType: "Observation",
  status: "final",
  code: { coding: [{ system: "http://loinc.org", code, display }] },
  subject: { reference: "Patient/p1" },
  valueQuantity: { value, unit },
});

// Our rest-hook endpoint: the server calls this when a matching record changes.
let notifications = 0;
let notified = () => {};
const firstNotification = new Promise<void>((resolve) => (notified = resolve));
const listener = createServer((req, res) => {
  notifications++;
  console.log(`   <- Notification: ${req.method} ${req.url} with an empty body (no payload asked for)`);
  res.end();
  notified();
}).listen(0);
await new Promise((r) => listener.once("listening", r));
const endpoint = `http://localhost:${(listener.address() as AddressInfo).port}/notify`;

const criteria = `Observation?code=${hba1c}`;
console.log(`1. Subscribe: POST ${base}/Subscription\n   criteria: ${criteria}\n   channel: rest-hook -> ${endpoint}`);
const sub = await post("/Subscription", {
  resourceType: "Subscription",
  status: "requested",
  reason: "Tell me about new HbA1c results",
  criteria,
  channel: { type: "rest-hook", endpoint },
});
if (sub.status !== 201) throw new Error(`subscribe failed: ${sub.status} ${await sub.text()}`);
console.log(`   ${sub.status} Created, status: ${(await sub.json()).status}`);

const heartRate = await post("/Observation", observation("8867-4", "Heart rate", 72, "/min"));
console.log(`2. Create a heart rate Observation -> ${heartRate.status}. It doesn't match, so no notification.`);

const a1c = await post("/Observation", observation("4548-4", "Hemoglobin A1c", 6.1, "%"));
console.log(`3. Create an HbA1c Observation -> ${a1c.status}. It matches, so the server notifies us:`);
await Promise.race([
  firstNotification,
  setTimeout(3000).then(() => {
    throw new Error("no notification within 3s");
  }),
]);

console.log(`4. The notification had no data, so search for what changed: GET ${base}/${criteria}`);
const bundle = await (await fetch(`${base}/${criteria}`)).json();
for (const { resource } of bundle.entry) {
  console.log(
    `   Observation/${resource.id}: ${resource.code.coding[0].display} ${resource.valueQuantity.value} ${resource.valueQuantity.unit}`,
  );
}

await setTimeout(300); // give a wrong notification time to arrive, if there were one
console.log(`5. Notifications received: ${notifications} (only the matching Observation)`);
listener.close();
