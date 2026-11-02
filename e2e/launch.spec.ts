import { expect, type Page, test } from "@playwright/test";

// Synthetic patients from the SMART launcher's R4 sandbox (https://launch.smarthealthit.org/v/r4/fhir):
//   Austin Franecki   84afbe27-2a55-4f53-b1de-3513e21dae68  male, 1920-04-23, 12 MedicationRequests
//   Clemente Kreiger  d78af07c-9cb9-4f31-9b11-c45a28f2eec8  male, 1984-07-02, no MedicationRequests
// Each launch is the launcher's base64url-encoded options for a provider EHR launch as practitioner
// Albertine Orn (52919099-6a7a-442c-b0d5-2b02c0dd4b74), login and authorization skipped
// (smart-launcher-v2 src/isomorphic/codec.ts `encode`). The launcher shows provider login unless
// exactly one provider is set, because the app's scope includes fhirUser.
const AUSTIN_LAUNCH =
  "WzAsIjg0YWZiZTI3LTJhNTUtNGY1My1iMWRlLTM1MTNlMjFkYWU2OCIsIjUyOTE5MDk5LTZhN2EtNDQyYy1iMGQ1LTJiMDJjMGRkNGI3NCIsIkFVVE8iLDEsMSwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0";
const CLEMENTE_LAUNCH =
  "WzAsImQ3OGFmMDdjLTljYjktNGYzMS05YjExLWM0NWEyOGYyZWVjOCIsIjUyOTE5MDk5LTZhN2EtNDQyYy1iMGQ1LTJiMDJjMGRkNGI3NCIsIkFVVE8iLDEsMSwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0";
const ISS = "https://launch.smarthealthit.org/v/r4/fhir";
const NO_MEDS = "No medications found for the selected patient";

async function ehrLaunch(page: Page, launch: string) {
  await page.goto(`/launch.html?${new URLSearchParams({ iss: ISS, launch })}`);
  await page.waitForURL(/\/index\.html/);
  await expect(page.locator("#raw")).toContainText('"resourceType": "Patient"');
}

test("EHR launch shows the patient and their medications", async ({ page }) => {
  await ehrLaunch(page, AUSTIN_LAUNCH);
  const patient = page.locator("#patient");
  for (const text of ["Austin", "Franecki", "male", "1920-04-23"]) await expect(patient).toContainText(text);
  const meds = page.locator("#meds li");
  await expect(meds.first()).toBeVisible();
  await expect(meds.first()).not.toHaveText(NO_MEDS);
  expect(await meds.count()).toBeGreaterThanOrEqual(1);
});

test("EHR launch for a patient with no medications says so", async ({ page }) => {
  await ehrLaunch(page, CLEMENTE_LAUNCH);
  await expect(page.locator("#meds")).toHaveText(NO_MEDS);
});

test("launch.html without iss and launch shows the error instead of hanging", async ({ page }) => {
  await page.goto("/launch.html");
  await expect(page.locator("#status")).toContainText("Launch failed:");
});
