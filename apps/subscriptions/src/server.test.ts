import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { handler, matches, TOPIC } from "./server.ts";

async function listen(t: { after: (fn: () => void) => void }) {
  const server = createServer(handler).listen(0);
  t.after(() => server.close());
  await new Promise((r) => server.once("listening", r));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

const obs = (system: string, code: string) => ({
  resourceType: "Observation" as const,
  code: { coding: [{ system, code }] },
});

test("matches criteria by code, with or without a system", () => {
  assert.equal(matches("Observation?code=http://loinc.org|4548-4", obs("http://loinc.org", "4548-4")), true);
  assert.equal(matches("Observation?code=http://loinc.org|4548-4", obs("http://loinc.org", "8867-4")), false);
  assert.equal(matches("Observation?code=http://loinc.org|4548-4", obs("http://other", "4548-4")), false);
  assert.equal(matches("Observation?code=4548-4", obs("http://other", "4548-4")), true);
  assert.equal(matches("Observation?status=final", obs("http://loinc.org", "4548-4")), false);
});

test("a matching Observation notifies the rest-hook endpoint; a non-matching one does not", async (t) => {
  const pings: string[] = [];
  let pinged = () => {};
  const firstPing = new Promise<void>((r) => (pinged = r));
  const hook = createServer((req, res) => {
    pings.push(`${req.method} ${req.url}`);
    res.end();
    pinged();
  }).listen(0);
  t.after(() => hook.close());
  await new Promise((r) => hook.once("listening", r));
  const endpoint = `http://localhost:${(hook.address() as AddressInfo).port}/notify`;

  const base = await listen(t);
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", body: JSON.stringify(body) });

  const sub = await post("/Subscription", {
    resourceType: "Subscription",
    criteria: "Observation?code=http://loinc.org|4548-4",
    channel: { type: "rest-hook", endpoint },
  });
  assert.equal(sub.status, 201);
  assert.equal((await sub.json()).status, "active");

  assert.equal((await post("/Observation", obs("http://loinc.org", "8867-4"))).status, 201);
  assert.equal((await post("/Observation", obs("http://loinc.org", "4548-4"))).status, 201);
  await firstPing;
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(pings, ["POST /notify"]);

  const bundle = await (await fetch(`${base}/Observation?code=http://loinc.org|4548-4`)).json();
  assert.equal(bundle.total, 1);
});

test("rejects bad subscriptions and observations", async (t) => {
  const base = await listen(t);
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", body: JSON.stringify(body) });
  const channel = { type: "rest-hook", endpoint: "http://localhost:9/notify" };
  assert.equal((await post("/Subscription", { resourceType: "Patient" })).status, 400);
  assert.equal(
    (await post("/Subscription", { resourceType: "Subscription", criteria: "Patient?name=x", channel })).status,
    400,
  );
  assert.equal(
    (
      await post("/Subscription", {
        resourceType: "Subscription",
        criteria: "Observation?code=1",
        channel: { type: "websocket" },
      })
    ).status,
    400,
  );
  assert.equal((await post("/Observation", { resourceType: "Patient" })).status, 400);
  assert.equal((await fetch(`${base}/nope`)).status, 404);
});

test("backport topic subscription: handshake, filter, id-only events", async (t) => {
  const BACKPORT = "http://hl7.org/fhir/uv/subscriptions-backport/StructureDefinition";
  type Param = { name: string; part?: Param[]; [value: string]: unknown };
  const bundles: { type: string; entry: { resource: { parameter: Param[] } }[] }[] = [];
  const hook = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    bundles.push(JSON.parse(raw));
    res.end();
  }).listen(0);
  t.after(() => hook.close());
  await new Promise((r) => hook.once("listening", r));
  const endpoint = `http://localhost:${(hook.address() as AddressInfo).port}/notify`;
  const base = await listen(t);
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", body: JSON.stringify(body) });
  const param = (list: Param[] | undefined, name: string) => list?.find((p) => p.name === name);

  const metadata = await (await fetch(`${base}/metadata`)).json();
  assert.equal(JSON.stringify(metadata).includes(TOPIC), true);

  const subscription = (content: string) => ({
    resourceType: "Subscription",
    criteria: TOPIC,
    _criteria: {
      extension: [
        { url: `${BACKPORT}/backport-filter-criteria`, valueString: "Observation?code=http://loinc.org|4548-4" },
      ],
    },
    channel: {
      type: "rest-hook",
      endpoint,
      payload: "application/fhir+json",
      _payload: { extension: [{ url: `${BACKPORT}/backport-payload-content`, valueCode: content }] },
    },
  });
  assert.equal((await post("/Subscription", subscription("everything"))).status, 400);

  const sub = await post("/Subscription", subscription("id-only"));
  assert.equal(sub.status, 201);
  assert.equal((await sub.json()).status, "active");
  assert.equal(bundles.length, 1);
  const handshake = bundles[0].entry[0].resource.parameter;
  assert.equal(param(handshake, "type")?.valueCode, "handshake");
  assert.equal(param(handshake, "events-since-subscription-start")?.valueString, "0");

  await post("/Observation", obs("http://loinc.org", "8867-4")); // filtered out
  await post("/Observation", obs("http://loinc.org", "4548-4"));
  await post("/Observation", obs("http://loinc.org", "4548-4"));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(bundles.length, 3);

  const numbers = bundles.slice(1).map((b) => {
    assert.equal(b.type, "history");
    assert.equal(b.entry.length, 1); // id-only: the status Parameters, no resource entry
    const event = param(b.entry[0].resource.parameter, "notification-event")?.part;
    assert.match(JSON.stringify(param(event, "focus")?.valueReference), /\/Observation\//);
    return param(event, "event-number")?.valueString;
  });
  assert.deepEqual(numbers.sort(), ["1", "2"]);
});

test("backport handshake failure leaves the subscription in error", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/Subscription`, {
    method: "POST",
    body: JSON.stringify({
      resourceType: "Subscription",
      criteria: TOPIC,
      channel: {
        type: "rest-hook",
        endpoint: "http://localhost:9/notify",
        _payload: {
          extension: [
            {
              url: "http://hl7.org/fhir/uv/subscriptions-backport/StructureDefinition/backport-payload-content",
              valueCode: "empty",
            },
          ],
        },
      },
    }),
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).status, "error");
});
