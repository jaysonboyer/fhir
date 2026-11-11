import { authorize } from "./authorize.ts";

// EHR launch: the code console ("Begin Testing") or SMART launcher opens launch.html?iss=…&launch=….
authorize("launch");
