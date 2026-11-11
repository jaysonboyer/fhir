import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Runs the official HL7 FHIR validator (https://github.com/hapifhir/org.hl7.fhir.core) on each fixture
// against US Core 6.1.0, then prints the issues from the OperationOutcome it writes.

export const VALIDATOR_VERSION = "7.0.3";
const cache = fileURLToPath(new URL("../.cache/", import.meta.url));
export const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
export const jar = `${cache}validator_cli-${VALIDATOR_VERSION}.jar`;
const IG = "hl7.fhir.us.core#6.1.0";

type Issue = { severity: string; expression?: string[]; details?: { text?: string }; diagnostics?: string };
export type Outcome = { resourceType: "OperationOutcome"; issue?: Issue[] };

export const hasJava = () => !spawnSync("java", ["-version"]).error;

export async function ensureJar() {
  if (existsSync(jar)) return;
  mkdirSync(cache, { recursive: true });
  const url = `https://github.com/hapifhir/org.hl7.fhir.core/releases/download/${VALIDATOR_VERSION}/validator_cli.jar`;
  console.log(`Downloading validator ${VALIDATOR_VERSION} (one time, about 200 MB)...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  writeFileSync(jar, Buffer.from(await res.arrayBuffer()));
}

// The profile comes from each fixture's meta.profile, the same way a server would know what to check.
export function validate(file: string): Outcome {
  const resource = JSON.parse(readFileSync(`${fixtures}${file}`, "utf8"));
  const output = `${cache}${file.replace(".json", ".outcome.json")}`;
  const args = ["-jar", jar, `${fixtures}${file}`, "-version", "4.0.1", "-ig", IG, "-output", output];
  for (const profile of resource.meta?.profile ?? []) args.push("-profile", profile);
  const run = spawnSync("java", args, { encoding: "utf8" });
  if (!existsSync(output)) throw new Error(`validator wrote no result:\n${run.stdout}\n${run.stderr}`);
  return JSON.parse(readFileSync(output, "utf8"));
}

export const errors = (outcome: Outcome) =>
  (outcome.issue ?? []).filter((i) => i.severity === "error" || i.severity === "fatal");

if (import.meta.main) {
  if (!hasJava()) {
    console.error("`java` was not found. Install a JDK (this repo uses JDK 25) and try again.");
    process.exit(1);
  }
  await ensureJar();
  for (const file of readdirSync(fixtures).filter((f) => f.endsWith(".json"))) {
    console.log(`\n${file} (first run downloads US Core and its dependencies, which takes a while)`);
    const outcome = validate(file);
    for (const issue of outcome.issue ?? []) {
      const where = issue.expression?.join(", ") ?? "";
      console.log(`  ${issue.severity.padEnd(11)} ${where}\n              ${issue.details?.text ?? issue.diagnostics}`);
    }
    console.log(`  => ${errors(outcome).length} error(s)`);
  }
}
