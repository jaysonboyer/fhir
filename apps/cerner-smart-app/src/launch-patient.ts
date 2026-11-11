import { authorize } from "./authorize.ts";

// Standalone patient launch: no EHR, the patient logs in at the FHIR server's authorization server.
// Defaults to Cerner's R4 patient-access sandbox; pass ?iss=<fhir server> to use another.
authorize("launch/patient", "https://fhir-myrecord.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d");
