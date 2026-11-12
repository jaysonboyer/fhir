import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// Only the Patient fields this service reads; every one can be missing (FHIR 0..*).
type Patient = { name?: { given?: string[]; family?: string }[] };

// CDS Hooks spec: https://cds-hooks.org — the EHR GETs /cds-services to discover what we offer,
// then POSTs a hook request to /cds-services/<id> and renders the cards we return.
const services = [
  {
    hook: "patient-view",
    id: "patient-greeting",
    title: "Patient greeting",
    description: "Says hello to the patient whose chart was opened.",
    // The EHR fetches this before calling us and sends it in request.prefetch.patient.
    prefetch: { patient: "Patient/{{context.patientId}}" },
  },
  // Stubs that echo the order hooks, so the sandbox's Rx View, Rx Sign and PAMA Imaging tabs call us.
  {
    hook: "order-select",
    id: "order-select-echo",
    title: "Order select echo",
    description: "Lists the draft orders the clinician is picking (fires while the order is still being built).",
  },
  {
    hook: "order-sign",
    id: "order-sign-echo",
    title: "Order sign echo",
    description: "Lists the draft orders about to be signed (the last chance to change them).",
  },
];

// Just the fields we read from a draft MedicationRequest or ServiceRequest in context.draftOrders.
type Concept = { text?: string; coding?: { display?: string; code?: string }[] };
type DraftOrders = {
  entry?: { resource?: { resourceType?: string; medicationCodeableConcept?: Concept; code?: Concept } }[];
};

export function orderCards(hook: string, draftOrders: DraftOrders | undefined) {
  const orders = (draftOrders?.entry ?? []).map(({ resource: r }) => {
    const concept = r?.medicationCodeableConcept ?? r?.code;
    return `${r?.resourceType}: ${concept?.text ?? concept?.coding?.[0]?.display ?? concept?.coding?.[0]?.code ?? "?"}`;
  });
  const summary = `${hook}: ${orders.length} draft order(s)`;
  return {
    cards: [
      {
        summary,
        detail: orders.join("\n") || "No draft orders in context.",
        indicator: hook === "order-sign" ? "warning" : "info",
        source: { label: "fhir playground CDS service" },
      },
    ],
  };
}

export function greetingCards(patient: Patient | undefined) {
  const name = patient?.name?.[0];
  const display = [name?.given?.join(" "), name?.family].filter(Boolean).join(" ") || "there";
  return {
    cards: [
      {
        summary: `Hello ${display}!`,
        indicator: "info",
        source: { label: "fhir playground CDS service" },
      },
    ],
  };
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    // The CDS Hooks sandbox calls us straight from the browser.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

export function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") return send(res, 204);
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
  if (req.method === "GET" && req.url === "/cds-services") return send(res, 200, { services });
  const service = services.find((s) => req.method === "POST" && req.url === `/cds-services/${s.id}`);
  if (service) {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      let hookRequest: { hook?: string; context?: { draftOrders?: DraftOrders }; prefetch?: { patient?: Patient } };
      try {
        hookRequest = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: "body must be JSON" });
      }
      // Print each request so you can read the context the EHR sends for each hook.
      if (!process.env.NODE_TEST_CONTEXT)
        console.log(`POST /cds-services/${service.id}\n${JSON.stringify(hookRequest, null, 2)}`);
      if (service.hook === "patient-view") return send(res, 200, greetingCards(hookRequest.prefetch?.patient));
      send(res, 200, orderCards(service.hook, hookRequest.context?.draftOrders));
    });
    return;
  }
  send(res, 404, { error: "not found" });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer(handler).listen(port, () => console.log(`CDS services on http://localhost:${port}/cds-services`));
}
