import FHIR from "fhirclient";

// Cerner rejects wildcard scopes, so each resource is named. online_access asks for a refresh token.
const SCOPES = "patient/Patient.read patient/Observation.read online_access openid profile";

// The code console issues the client id (set it in .env.local); the SMART launcher accepts any id.
const clientId = import.meta.env.VITE_CERNER_CLIENT_ID || "my_web_app";

// launchScope: "launch" for an EHR launch, "launch/patient" for a standalone patient launch.
export function authorize(launchScope: string, iss?: string) {
  // ?iss= in the URL wins over the iss option, so the default only applies when none is given.
  FHIR.oauth2
    .authorize({ clientId, scope: `${launchScope} ${SCOPES}`, redirectUri: "index.html", iss })
    .catch((error: unknown) => {
      // launch.html and launch-patient.html define #status.
      (document.getElementById("status") as HTMLElement).textContent =
        `Launch failed: ${error instanceof Error ? error.message : String(error)}`;
    });
}
