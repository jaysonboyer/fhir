import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout } from "node:timers/promises";

// The topic-based flow from the Subscriptions R5 Backport IG, run against server.ts (start it first with
// `pnpm dev`). Compare with client.ts, which uses R4's free-form criteria instead of a topic.
const base = process.env.FHIR_BASE ?? "http://localhost:3003";
const BACKPORT = "http://hl7.org/fhir/uv/subscriptions-backport/StructureDefinition";
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

type Param = { name: string; part?: Param[]; [value: string]: unknown };
type Bundle = { type: string; entry: { resource: { parameter: Param[] } }[] };
const param = (list: Param[] | undefined, name: string) => list?.find((p) => p.name === name);

// Our rest-hook endpoint. Every notification, handshake included, is a `history` Bundle.
const received: Bundle[] = [];
let wake = () => {};
const listener = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  received.push(JSON.parse(raw));
  res.end();
  wake();
}).listen(0);
await new Promise((r) => listener.once("listening", r));
const endpoint = `http://localhost:${(listener.address() as AddressInfo).port}/notify`;

async function nextNotification() {
  if (!received.length) {
    const arrived = new Promise<void>((resolve) => (wake = resolve));
    await Promise.race([
      arrived,
      setTimeout(3000).then(() => {
        throw new Error("no notification within 3s");
      }),
    ]);
  }
  return received.shift() as Bundle;
}

console.log(`1. Discover topics: GET ${base}/metadata`);
const capabilities = await (await fetch(`${base}/metadata`)).json();
const subscriptionEntry = capabilities.rest[0].resource.find((r: { type: string }) => r.type === "Subscription");
const topic: string = subscriptionEntry.extension.find(
  (e: { url: string }) => e.url === `${BACKPORT}/capabilitystatement-subscriptiontopic-canonical`,
).valueCanonical;
console.log(`   R4 has no SubscriptionTopic resource, so the CapabilityStatement names it: ${topic}`);

const filter = "Observation?code=http://loinc.org|4548-4";
console.log(`2. Subscribe: POST ${base}/Subscription\n   criteria: ${topic}\n   filter: ${filter}`);
console.log(`   channel: rest-hook -> ${endpoint}, content: id-only`);
const sub = await post("/Subscription", {
  resourceType: "Subscription",
  meta: { profile: [`${BACKPORT}/backport-subscription`] },
  status: "requested",
  reason: "Tell me about new HbA1c results",
  criteria: topic,
  _criteria: { extension: [{ url: `${BACKPORT}/backport-filter-criteria`, valueString: filter }] },
  channel: {
    type: "rest-hook",
    endpoint,
    payload: "application/fhir+json",
    _payload: { extension: [{ url: `${BACKPORT}/backport-payload-content`, valueCode: "id-only" }] },
  },
});
if (sub.status !== 201) throw new Error(`subscribe failed: ${sub.status} ${await sub.text()}`);

const handshake = (await nextNotification()).entry[0].resource.parameter;
console.log(
  `3. <- Handshake: type ${param(handshake, "type")?.valueCode}, status ${param(handshake, "status")?.valueCode}`,
);
console.log(`   Subscription ${sub.status} Created, status now: ${(await sub.json()).status}`);

const heartRate = await post("/Observation", observation("8867-4", "Heart rate", 72, "/min"));
await setTimeout(300);
console.log(`4. Create a heart rate Observation -> ${heartRate.status}. The filter excludes it.`);
console.log(`   Notifications received: ${received.length}`);

const a1c = await post("/Observation", observation("4548-4", "Hemoglobin A1c", 6.1, "%"));
console.log(`5. Create an HbA1c Observation -> ${a1c.status}. It passes the filter, so the server notifies us:`);
const event = await nextNotification();
console.log(JSON.stringify(event, null, 2).replace(/^/gm, "   "));

const status = event.entry[0].resource.parameter;
const focus = param(param(status, "notification-event")?.part, "focus")?.valueReference as { reference: string };
console.log(
  `6. id-only: the Bundle has ${event.entry.length} entry, the status. Read the focus: GET ${focus.reference}`,
);
const resource = await (await fetch(focus.reference)).json();
console.log(
  `   Observation/${resource.id}: ${resource.code.coding[0].display} ${resource.valueQuantity.value} ${resource.valueQuantity.unit}`,
);
listener.close();
