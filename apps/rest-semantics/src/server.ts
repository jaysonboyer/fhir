import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse, STATUS_CODES } from "node:http";

// A fake in-memory FHIR R4 server, Patient only, showing the write side of the REST API
// (https://hl7.org/fhir/R4/http.html): versions and ETags, If-Match, If-None-Exist,
// transaction versus batch, and paging by following the server's `next` link.

type Identifier = { system?: string; value?: string };
type Patient = {
  resourceType: "Patient";
  id?: string;
  meta?: { versionId: string; lastUpdated: string };
  identifier?: Identifier[];
  name?: { family?: string; given?: string[] }[];
  gender?: string;
  [field: string]: unknown;
};
type Result = { status: number; body?: unknown; headers?: Record<string, string> };
type Entry = {
  fullUrl?: string;
  resource?: Patient;
  request?: { method?: string; url?: string; ifNoneExist?: string; ifMatch?: string };
};
type Store = Map<string, Patient[]>; // id -> every version, oldest first

let store: Store = new Map();
let nextId = 1;
const pages = new Map<string, { matches: Patient[]; count: number; offset: number }>();

const outcome = (diagnostics: string, code = "invalid") => ({
  resourceType: "OperationOutcome",
  issue: [{ severity: "error", code, diagnostics }],
});
const fail = (status: number, diagnostics: string, code?: string): Result => ({
  status,
  body: outcome(diagnostics, code),
});

function invalid(resource: Patient | undefined) {
  if (resource?.resourceType !== "Patient") return "body must be a Patient";
  const genders = ["male", "female", "other", "unknown"];
  if (resource.gender !== undefined && !genders.includes(resource.gender))
    return `gender must be one of ${genders.join(", ")}`;
}

function located(status: number, patient: Patient): Result {
  const version = patient.meta?.versionId;
  return {
    status,
    body: patient,
    headers: { Location: `/Patient/${patient.id}/_history/${version}`, ETag: `W/"${version}"` },
  };
}

function save(target: Store, id: string, resource: Patient) {
  const versions = target.get(id) ?? [];
  const meta = { versionId: String(versions.length + 1), lastUpdated: new Date().toISOString() };
  const saved: Patient = { ...resource, id, meta };
  target.set(id, [...versions, saved]);
  return saved;
}

const current = (target: Store) => [...target.values()].map((versions) => versions[versions.length - 1]);

function search(target: Store, query: URLSearchParams) {
  const name = query.get("name")?.toLowerCase();
  const [system, value] = (query.get("identifier") ?? "").split("|");
  return current(target).filter(
    (p) =>
      (!name || (p.name ?? []).some((n) => [n.family, ...(n.given ?? [])].join(" ").toLowerCase().includes(name))) &&
      (!query.has("identifier") || (p.identifier ?? []).some((i) => i.system === system && i.value === value)),
  );
}

function create(target: Store, resource: Patient | undefined, ifNoneExist?: string, id?: string): Result {
  const problem = invalid(resource);
  if (problem || !resource) return fail(400, problem ?? "missing body");
  if (ifNoneExist) {
    // Conditional create: only create when the search finds nothing.
    const found = search(target, new URLSearchParams(ifNoneExist));
    if (found.length === 1) return located(200, found[0]);
    if (found.length > 1) return fail(412, `If-None-Exist "${ifNoneExist}" matched ${found.length} Patients`);
  }
  return located(201, save(target, id ?? String(nextId++), resource));
}

function update(target: Store, id: string, resource: Patient | undefined, ifMatch?: string): Result {
  const problem = invalid(resource) ?? (resource?.id === id ? undefined : "body id must match the URL id");
  if (problem || !resource) return fail(400, problem ?? "missing body");
  const versions = target.get(id);
  const latest = versions?.[versions.length - 1].meta?.versionId;
  // Optimistic locking: the client says which version it edited; anything else means someone changed it since.
  if (ifMatch && ifMatch !== `W/"${latest}"`)
    return fail(412, `version conflict: If-Match ${ifMatch} but current version is W/"${latest}"`, "conflict");
  return located(versions ? 200 : 201, save(target, id, resource));
}

function read(target: Store, id: string, version?: string): Result {
  const versions = target.get(id);
  const found = version ? versions?.find((v) => v.meta?.versionId === version) : versions?.[versions.length - 1];
  return found
    ? located(200, found)
    : fail(404, `Patient/${id}${version ? `/_history/${version}` : ""} not found`, "not-found");
}

function run(target: Store, entry: Entry, id?: string): Result {
  const { method, url = "", ifNoneExist, ifMatch } = entry.request ?? {};
  const [type, entryId] = url.split("/");
  if (type !== "Patient") return fail(400, `unsupported request url "${url}"`);
  if (method === "POST" && !entryId) return create(target, entry.resource, ifNoneExist, id);
  if (method === "PUT" && entryId) return update(target, entryId, entry.resource, ifMatch);
  if (method === "GET" && entryId) return read(target, entryId);
  return fail(400, `unsupported request ${method} ${url}`);
}

const responseEntry = ({ status, body, headers }: Result) => ({
  response: {
    status: `${status} ${STATUS_CODES[status]}`,
    location: headers?.Location,
    etag: headers?.ETag,
    outcome: status >= 400 ? body : undefined,
  },
});

function transaction(entries: Entry[]): Result {
  // Work on a copy and only keep it if every entry succeeds: all or nothing.
  const work: Store = new Map([...store].map(([id, versions]) => [id, [...versions]]));
  // Give each new resource its id first, so urn:uuid references can point at it.
  const ids = new Map<string, string>();
  for (const e of entries) {
    if (e.request?.method === "POST" && e.fullUrl?.startsWith("urn:uuid:")) ids.set(e.fullUrl, String(nextId++));
  }
  let json = JSON.stringify(entries);
  for (const [urn, id] of ids) json = json.replaceAll(`"${urn}"`, `"Patient/${id}"`);
  const resolved = JSON.parse(json) as Entry[];

  const results: Result[] = [];
  for (const [i, entry] of resolved.entries()) {
    const result = run(work, entry, ids.get(entries[i].fullUrl ?? ""));
    if (result.status >= 400) {
      const why = JSON.stringify((result.body as ReturnType<typeof outcome>).issue[0].diagnostics);
      return fail(400, `transaction rolled back: entry ${i} failed with ${result.status}: ${why}`, "processing");
    }
    results.push(result);
  }
  store = work;
  return {
    status: 200,
    body: { resourceType: "Bundle", type: "transaction-response", entry: results.map(responseEntry) },
  };
}

function batch(entries: Entry[]): Result {
  // Each entry stands alone: failures are reported per entry and do not undo the others.
  const results = entries.map((entry) => run(store, entry));
  return { status: 200, body: { resourceType: "Bundle", type: "batch-response", entry: results.map(responseEntry) } };
}

function page(base: string, token: string): Result {
  const state = pages.get(token);
  if (!state) return fail(404, "page token expired or unknown", "not-found");
  const { matches, count, offset } = state;
  const link = [{ relation: "self", url: `${base}/Patient?_page_token=${token}` }];
  if (count > 0 && offset + count < matches.length) {
    // The server chooses what `next` looks like; clients follow it as given and never build it.
    const next = randomUUID();
    pages.set(next, { matches, count, offset: offset + count });
    link.push({ relation: "next", url: `${base}/Patient?_page_token=${next}` });
  }
  return {
    status: 200,
    body: {
      resourceType: "Bundle",
      type: "searchset",
      total: matches.length,
      link,
      entry: matches.slice(offset, offset + count).map((resource) => ({
        fullUrl: `${base}/Patient/${resource.id}`,
        resource,
        search: { mode: "match" },
      })),
    },
  };
}

function searchPage(base: string, query: URLSearchParams): Result {
  const token = query.get("_page_token");
  if (token) return page(base, token);
  const first = randomUUID();
  // shortcut: page snapshots live in memory forever; a real server expires them.
  pages.set(first, { matches: search(store, query), count: Number(query.get("_count") ?? 10), offset: 0 });
  return page(base, first);
}

async function readJson(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function route(req: IncomingMessage, url: URL, body: unknown): Result {
  const base = `http://${req.headers.host}`;
  const header = (name: string) => req.headers[name] as string | undefined;
  const path = url.pathname;
  const one = path.match(/^\/Patient\/([^/]+)(?:\/_history\/([^/]+))?$/);

  if (req.method === "GET" && path === "/health") return { status: 200, body: { ok: true } };
  if (req.method === "POST" && path === "/Patient") return create(store, body as Patient, header("if-none-exist"));
  if (req.method === "GET" && path === "/Patient") return searchPage(base, url.searchParams);
  if (req.method === "GET" && one) return read(store, one[1], one[2]);
  if (req.method === "PUT" && one && !one[2]) return update(store, one[1], body as Patient, header("if-match"));
  if (req.method === "POST" && path === "/") {
    const bundle = body as { resourceType?: string; type?: string; entry?: Entry[] } | undefined;
    if (bundle?.resourceType !== "Bundle") return fail(400, "body must be a Bundle");
    if (bundle.type === "transaction") return transaction(bundle.entry ?? []);
    if (bundle.type === "batch") return batch(bundle.entry ?? []);
    return fail(400, "Bundle.type must be transaction or batch");
  }
  return fail(404, "not found", "not-found");
}

export async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const body = req.method === "POST" || req.method === "PUT" ? await readJson(req) : undefined;
  const result =
    (req.method === "POST" || req.method === "PUT") && body === undefined
      ? fail(400, "body must be JSON")
      : route(req, url, body);
  res.writeHead(result.status, { "Content-Type": "application/fhir+json", ...result.headers });
  res.end(result.body === undefined ? undefined : JSON.stringify(result.body));
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3004);
  createServer(handler).listen(port, () =>
    console.log(`REST semantics server on http://localhost:${port} — run \`pnpm demo\` to walk through it`),
  );
}
