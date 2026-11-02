import FHIR from "fhirclient";

// Step 1 of the SMART launch: the EHR opens this page with ?iss=<fhir server>&launch=<token>.
// authorize() discovers the server's OAuth endpoints (.well-known/smart-configuration)
// and redirects the browser to its authorize URL.
FHIR.oauth2
  .authorize({
    clientId: "my_web_app", // the SMART launcher accepts any id; a real EHR issues one when you register
    scope: "launch openid fhirUser patient/*.read",
    redirectUri: "index.html",
  })
  .catch((error: unknown) => {
    // launch.html defines #status.
    (document.getElementById("status") as HTMLElement).textContent =
      `Launch failed: ${error instanceof Error ? error.message : String(error)}`;
  });
