import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { handler } from "./server.js";

test("discovery and patient-greeting", async (t) => {
  const server = createServer(handler).listen(0);
  t.after(() => server.close());
  await new Promise((r) => server.once("listening", r));
  const base = `http://localhost:${server.address().port}`;

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
