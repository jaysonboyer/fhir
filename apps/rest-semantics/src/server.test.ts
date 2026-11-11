import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { handler } from "./server.ts";

const server = createServer(handler).listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://localhost:${(server.address() as AddressInfo).port}`;
test.after(() => server.close());

const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(path.startsWith("http") ? path : `${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const patient = (family: string, extra: object = {}) => ({ resourceType: "Patient", name: [{ family }], ...extra });
const total = async () => (await (await call("GET", "/Patient?_count=0")).json()).total;

test("create, read, version history, If-Match", async () => {
  const created = await call("POST", "/Patient", patient("Versioned"));
  assert.equal(created.status, 201);
  const p = await created.json();
  assert.equal(created.headers.get("location"), `/Patient/${p.id}/_history/1`);
  assert.equal(created.headers.get("etag"), 'W/"1"');

  const updated = await call("PUT", `/Patient/${p.id}`, { ...p, gender: "other" }, { "If-Match": 'W/"1"' });
  assert.equal(updated.status, 200);
  assert.equal(updated.headers.get("etag"), 'W/"2"');

  const stale = await call("PUT", `/Patient/${p.id}`, { ...p, gender: "male" }, { "If-Match": 'W/"1"' });
  assert.equal(stale.status, 412);

  assert.equal((await (await call("GET", `/Patient/${p.id}`)).json()).gender, "other");
  assert.equal((await (await call("GET", `/Patient/${p.id}/_history/1`)).json()).gender, undefined);
  assert.equal((await call("GET", `/Patient/${p.id}/_history/9`)).status, 404);
  assert.equal((await call("PUT", `/Patient/${p.id}`, { ...p, id: "other" })).status, 400);
});

test("conditional create: reuse one match, 412 on several", async () => {
  const id = { system: "urn:test", value: "cond-1" };
  const header = { "If-None-Exist": "identifier=urn:test|cond-1" };
  const first = await call("POST", "/Patient", patient("Cond", { identifier: [id] }), header);
  assert.equal(first.status, 201);
  const second = await call("POST", "/Patient", patient("Cond", { identifier: [id] }), header);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).id, (await first.json()).id);

  await call("POST", "/Patient", patient("Cond", { identifier: [id] })); // unconditional: now two match
  assert.equal((await call("POST", "/Patient", patient("Cond"), header)).status, 412);
});

test("transaction rewrites urn:uuid references and is all-or-nothing", async () => {
  const urn = "urn:uuid:11111111-1111-4111-8111-111111111111";
  const ok = await call("POST", "/", {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      { fullUrl: urn, resource: patient("TxParent"), request: { method: "POST", url: "Patient" } },
      {
        resource: patient("TxChild", { link: [{ other: { reference: urn }, type: "seealso" }] }),
        request: { method: "POST", url: "Patient" },
      },
    ],
  });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.type, "transaction-response");
  const [parentLoc, childLoc] = body.entry.map((e: { response: { location: string } }) => e.response.location);
  const child = await (await call("GET", childLoc.split("/_history")[0])).json();
  assert.equal(child.link[0].other.reference, parentLoc.split("/_history")[0].slice(1));

  const before = await total();
  const failed = await call("POST", "/", {
    resourceType: "Bundle",
    type: "transaction",
    entry: [patient("TxGood"), patient("TxBad", { gender: "F" })].map((resource) => ({
      resource,
      request: { method: "POST", url: "Patient" },
    })),
  });
  assert.equal(failed.status, 400);
  assert.equal(await total(), before);
});

test("batch entries succeed or fail on their own", async () => {
  const before = await total();
  const res = await call("POST", "/", {
    resourceType: "Bundle",
    type: "batch",
    entry: [
      { resource: patient("BatchGood"), request: { method: "POST", url: "Patient" } },
      { resource: patient("BatchBad", { gender: "F" }), request: { method: "POST", url: "Patient" } },
      { request: { method: "GET", url: "Patient/does-not-exist" } },
    ],
  });
  assert.equal(res.status, 200);
  const statuses = (await res.json()).entry.map((e: { response: { status: string } }) => e.response.status);
  assert.deepEqual(statuses, ["201 Created", "400 Bad Request", "404 Not Found"]);
  assert.equal(await total(), before + 1);
});

test("paging follows server-chosen next links; name search filters", async () => {
  for (const family of ["Pager", "Pager", "Pager"]) await call("POST", "/Patient", patient(family));
  const seen: string[] = [];
  let url: string | undefined = "/Patient?name=pager&_count=2";
  while (url) {
    const bundle = await (await call("GET", url)).json();
    assert.equal(bundle.total, 3);
    seen.push(...bundle.entry.map((e: { resource: { id: string } }) => e.resource.id));
    url = bundle.link.find((l: { relation: string }) => l.relation === "next")?.url;
  }
  assert.equal(seen.length, 3);
  assert.equal(new Set(seen).size, 3);
  assert.equal((await call("GET", "/Patient?_page_token=nope")).status, 404);
});

test("bad requests", async () => {
  assert.equal((await call("POST", "/Patient", { resourceType: "Observation" })).status, 400);
  assert.equal((await fetch(`${base}/Patient`, { method: "POST", body: "nope" })).status, 400);
  assert.equal((await call("POST", "/", { resourceType: "Bundle", type: "collection" })).status, 400);
  assert.equal((await call("GET", "/nope")).status, 404);
});
