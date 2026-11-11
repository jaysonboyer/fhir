import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// A fake FHIR R4 server that implements just enough of Subscription (https://hl7.org/fhir/R4/subscription.html)
// to show the push flow: a client registers criteria + a rest-hook endpoint, and when a matching
// Observation is created the server POSTs a notification to that endpoint instead of the client polling.
// It also supports the topic-based style from the Subscriptions R5 Backport IG 1.1.0
// (https://hl7.org/fhir/uv/subscriptions-backport/), which brings R5's SubscriptionTopic design to R4.

type Coding = { system?: string; code?: string };
type Observation = { resourceType: "Observation"; id?: string; code?: { coding?: Coding[] }; [field: string]: unknown };
type Extension = { url: string; valueString?: string; valueCode?: string };
type Subscription = {
  resourceType: "Subscription";
  id?: string;
  status?: string;
  criteria?: string;
  // FHIR JSON puts extensions on a primitive in a sibling `_name` property.
  _criteria?: { extension?: Extension[] };
  channel?: { type?: string; endpoint?: string; payload?: string; _payload?: { extension?: Extension[] } };
};

const BACKPORT = "http://hl7.org/fhir/uv/subscriptions-backport/StructureDefinition";
// R4 has no SubscriptionTopic resource, so the server names the topics it supports in its CapabilityStatement.
export const TOPIC = "http://example.org/fhir/SubscriptionTopic/new-lab-result";
const contents = ["empty", "id-only", "full-resource"];
const eventCounts = new Map<string, number>();

const subscriptions = new Map<string, Subscription>();
const observations = new Map<string, Observation>();
let nextId = 1;

// shortcut: criteria support only `Observation?code=[system|]code`; a real server supports any search.
export function matches(criteria: string, observation: Observation) {
  const [type, query = ""] = criteria.split("?");
  const token = new URLSearchParams(query).get("code");
  if (type !== "Observation" || !token) return false;
  const [system, code] = token.includes("|") ? token.split("|") : [undefined, token];
  return (
    observation.code?.coding?.some((c) => c.code === code && (system === undefined || c.system === system)) ?? false
  );
}

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/fhir+json", ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

const outcome = (diagnostics: string) => ({
  resourceType: "OperationOutcome",
  issue: [{ severity: "error", code: "invalid", diagnostics }],
});

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function notify(subscription: Subscription, observation: Observation) {
  // R4 rest-hook: with no `payload` the notification is an empty POST and the client searches for
  // what changed; with a payload mime type the changed resource is sent in the body.
  const payload = subscription.channel?.payload;
  fetch(subscription.channel?.endpoint ?? "", {
    method: "POST",
    headers: payload ? { "Content-Type": payload } : {},
    body: payload ? JSON.stringify(observation) : undefined,
  }).catch(() => {
    subscription.status = "error"; // R4 marks a subscription whose endpoint fails as `error`
  });
}

const ext = (list: Extension[] | undefined, name: string) => list?.find((e) => e.url === `${BACKPORT}/${name}`);

// A Backport notification: a `history` Bundle whose first entry is a subscription-status Parameters.
export function notificationBundle(base: string, sub: Subscription, type: string, event?: Observation) {
  const count = String(eventCounts.get(sub.id ?? "") ?? 0);
  const content = ext(sub.channel?._payload?.extension, "backport-payload-content")?.valueCode;
  const parameter: unknown[] = [
    { name: "subscription", valueReference: { reference: `${base}/Subscription/${sub.id}` } },
    { name: "topic", valueCanonical: sub.criteria },
    { name: "status", valueCode: sub.status },
    { name: "type", valueCode: type },
    { name: "events-since-subscription-start", valueString: count },
  ];
  if (event) {
    const part: unknown[] = [
      { name: "event-number", valueString: count },
      { name: "timestamp", valueInstant: new Date().toISOString() },
    ];
    if (content !== "empty")
      part.push({ name: "focus", valueReference: { reference: `${base}/Observation/${event.id}` } });
    parameter.push({ name: "notification-event", part });
  }
  const entry: unknown[] = [
    {
      fullUrl: `urn:uuid:${randomUUID()}`,
      resource: {
        resourceType: "Parameters",
        meta: { profile: [`${BACKPORT}/backport-subscription-status-r4`] },
        parameter,
      },
      request: { method: "GET", url: `${base}/Subscription/${sub.id}/$status` },
      response: { status: "200" },
    },
  ];
  // id-only sends just the focus reference above; full-resource also carries the resource itself.
  if (event && content === "full-resource")
    entry.push({
      fullUrl: `${base}/Observation/${event.id}`,
      resource: event,
      request: { method: "POST", url: "Observation" },
      response: { status: "201" },
    });
  return { resourceType: "Bundle", type: "history", timestamp: new Date().toISOString(), entry };
}

const postBundle = (sub: Subscription, bundle: unknown) =>
  fetch(sub.channel?.endpoint ?? "", {
    method: "POST",
    headers: { "Content-Type": "application/fhir+json" },
    body: JSON.stringify(bundle),
  }).then(
    (r) => r.ok,
    () => false,
  );

async function createTopicSubscription(res: ServerResponse, sub: Subscription, base: string) {
  const content = ext(sub.channel?._payload?.extension, "backport-payload-content")?.valueCode;
  if (!contents.includes(content ?? ""))
    return send(
      res,
      400,
      outcome(`channel._payload needs the backport-payload-content extension: ${contents.join(" | ")}`),
    );
  const saved: Subscription = { ...sub, id: String(nextId++), status: "requested" };
  subscriptions.set(saved.id as string, saved);
  eventCounts.set(saved.id as string, 0);
  // Handshake: prove the endpoint works before sending real events.
  // shortcut: the handshake runs before the 201 so the reply already says active or error; real servers may do it later.
  saved.status = (await postBundle(saved, notificationBundle(base, saved, "handshake"))) ? "active" : "error";
  send(res, 201, saved, { Location: `/Subscription/${saved.id}` });
}

export async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const base = `http://${req.headers.host}`;
  if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });

  if (req.method === "GET" && url.pathname === "/metadata")
    return send(res, 200, {
      resourceType: "CapabilityStatement",
      status: "active",
      kind: "instance",
      fhirVersion: "4.0.1",
      format: ["json"],
      rest: [
        {
          mode: "server",
          resource: [
            {
              type: "Subscription",
              supportedProfile: [`${BACKPORT}/backport-subscription`],
              extension: [
                { url: `${BACKPORT}/capabilitystatement-subscriptiontopic-canonical`, valueCanonical: TOPIC },
              ],
            },
            { type: "Observation" },
          ],
        },
      ],
    });

  if (req.method === "POST" && url.pathname === "/Subscription") {
    const sub = (await readJson(req)) as Subscription | undefined;
    if (sub?.resourceType !== "Subscription") return send(res, 400, outcome("body must be a Subscription"));
    if (sub.channel?.type !== "rest-hook" || !URL.canParse(sub.channel.endpoint ?? ""))
      return send(res, 400, outcome("channel must be rest-hook with an http(s) endpoint"));
    if (sub.criteria === TOPIC) return createTopicSubscription(res, sub, base);
    if (!/^Observation\?code=./.test(sub.criteria ?? ""))
      return send(res, 400, outcome(`criteria must be ${TOPIC} or look like Observation?code=system|code`));
    // shortcut: no handshake ping, so the subscription goes straight from requested to active.
    const saved: Subscription = { ...sub, id: String(nextId++), status: "active" };
    subscriptions.set(saved.id as string, saved);
    return send(res, 201, saved, { Location: `/Subscription/${saved.id}` });
  }

  if (req.method === "POST" && url.pathname === "/Observation") {
    const obs = (await readJson(req)) as Observation | undefined;
    if (obs?.resourceType !== "Observation") return send(res, 400, outcome("body must be an Observation"));
    const saved: Observation = { ...obs, id: String(nextId++) };
    observations.set(saved.id as string, saved);
    send(res, 201, saved, { Location: `/Observation/${saved.id}` });
    for (const sub of subscriptions.values()) {
      if (sub.status !== "active") continue;
      if (sub.criteria !== TOPIC) {
        if (matches(sub.criteria ?? "", saved)) notify(sub, saved);
        continue;
      }
      // The topic fires on every Observation create; the backport filter-criteria extension narrows it.
      const filter = ext(sub._criteria?.extension, "backport-filter-criteria")?.valueString;
      if (filter && !matches(filter, saved)) continue;
      eventCounts.set(sub.id as string, (eventCounts.get(sub.id as string) ?? 0) + 1);
      postBundle(sub, notificationBundle(base, sub, "event-notification", saved)).then((ok) => {
        if (!ok) sub.status = "error";
      });
    }
    return;
  }

  const read = url.pathname.match(/^\/Observation\/([^/]+)$/);
  const stored = read && observations.get(read[1]);
  if (req.method === "GET" && read) return stored ? send(res, 200, stored) : send(res, 404, outcome("not found"));

  if (req.method === "GET" && url.pathname === "/Observation") {
    const criteria = `Observation${url.search}`;
    const found = [...observations.values()].filter((o) => matches(criteria, o));
    return send(res, 200, {
      resourceType: "Bundle",
      type: "searchset",
      total: found.length,
      entry: found.map((resource) => ({ resource })),
    });
  }

  send(res, 404, outcome("not found"));
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3003);
  createServer(handler).listen(port, () =>
    console.log(`Subscriptions server on http://localhost:${port} — run \`pnpm demo\` to subscribe and trigger one`),
  );
}
