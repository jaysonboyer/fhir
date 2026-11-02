import { createServer } from "node:http";

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
];

export function greetingCards(patient) {
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

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    // The CDS Hooks sandbox calls us straight from the browser.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

export function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204);
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
  if (req.method === "GET" && req.url === "/cds-services") return send(res, 200, { services });
  if (req.method === "POST" && req.url === "/cds-services/patient-greeting") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      let hookRequest;
      try {
        hookRequest = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: "body must be JSON" });
      }
      send(res, 200, greetingCards(hookRequest.prefetch?.patient));
    });
    return;
  }
  send(res, 404, { error: "not found" });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer(handler).listen(port, () => console.log(`CDS services on http://localhost:${port}/cds-services`));
}
