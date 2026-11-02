import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { handler } from "./server.ts";

test("discovery and patient-greeting", async (t) => {
  const server = createServer(handler).listen(0);
  t.after(() => server.close());
  await new Promise((r) => server.once("listening", r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;

  const discovery = await (await fetch(`${base}/cds-services`)).json();
  assert.equal(discovery.services[0].id, "patient-greeting");

  const res = await fetch(`${base}/cds-services/patient-greeting`, {
    method: "POST",
    body: JSON.stringify({
      hook: "patient-view",
      prefetch: { patient: { resourceType: "Patient", name: [{ given: ["Ada"], family: "Lovelace" }] } },
    }),
  });
  assert.equal((await res.json()).cards[0].summary, "Hello Ada Lovelace!");

  const bad = await fetch(`${base}/cds-services/patient-greeting`, { method: "POST", body: "nope" });
  assert.equal(bad.status, 400);
});

test("health, CORS preflight, 404 and unnamed patient", async (t) => {
  const server = createServer(handler).listen(0);
  t.after(() => server.close());
  await new Promise((r) => server.once("listening", r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;

  const health = await fetch(`${base}/health`);
  assert.deepEqual(await health.json(), { ok: true });

  const preflight = await fetch(`${base}/cds-services/patient-greeting`, { method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");

  const missing = await fetch(`${base}/nope`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("access-control-allow-origin"), "*");

  const unnamed = await fetch(`${base}/cds-services/patient-greeting`, {
    method: "POST",
    body: JSON.stringify({ hook: "patient-view", prefetch: { patient: { resourceType: "Patient" } } }),
  });
  assert.equal((await unnamed.json()).cards[0].summary, "Hello there!");
});
