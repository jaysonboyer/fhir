import { readFileSync } from "node:fs";

// Runs a SQL on FHIR v2 ViewDefinition (https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/) over resources,
// turning nested FHIR JSON into flat rows that any database or spreadsheet can use.

type Json = Record<string, unknown>;
type Column = { name: string; path: string; type?: string; collection?: boolean };
type Select = { column?: Column[]; select?: Select[]; forEach?: string; forEachOrNull?: string; unionAll?: Select[] };
export type ViewDefinition = Select & {
  resource: string;
  where?: { path: string }[];
  constant?: ({ name: string } & Json)[];
};
export type Row = Record<string, unknown>;

// shortcut: FHIRPath subset only; use a real FHIRPath engine for anything beyond the demo.
// Supported: dotted navigation, first(), exists(), join('sep'), where(path = literal), ofType(Type)
// after a choice element, getResourceKey(), getReferenceKey([Type]), and %constants.

/** Splits on `sep` where it is not inside quotes or parentheses. */
function splitTop(expr: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "'") quoted = !quoted;
    else if (!quoted && ch === "(") depth++;
    else if (!quoted && ch === ")") depth--;
    else if (!quoted && depth === 0 && expr.startsWith(sep, i)) {
      parts.push(expr.slice(start, i));
      start = i + sep.length;
      i += sep.length - 1;
    }
  }
  parts.push(expr.slice(start));
  return parts.map((p) => p.trim());
}

function literal(text: string, constants: Json): unknown {
  if (/^'.*'$/.test(text)) return text.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text === "true" || text === "false") return text === "true";
  if (text.startsWith("%")) {
    if (!(text.slice(1) in constants)) throw new Error(`Unknown constant ${text}`);
    return constants[text.slice(1)];
  }
  throw new Error(`Unsupported FHIRPath literal: ${text}`);
}

export function evaluate(expr: string, input: unknown[], constants: Json = {}): unknown[] {
  // A comparison at the top level, such as `status = 'final'`.
  const sides = splitTop(expr, "=");
  if (sides.length === 2) {
    const left = evaluate(sides[0], input, constants);
    if (left.length === 0) return []; // FHIRPath: comparing with nothing gives nothing
    return [left.length === 1 && left[0] === literal(sides[1], constants)];
  }

  const segments = splitTop(expr, ".");
  let items = input;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const call = segment.match(/^(\w+)\((.*)\)$/s);
    if (!call) {
      if (!/^[A-Za-z_]\w*$/.test(segment)) throw new Error(`Unsupported FHIRPath: ${expr}`);
      // `value.ofType(Quantity)` reads the JSON key `valueQuantity` (choice element).
      const ofType = segments[i + 1]?.match(/^ofType\((\w+)\)$/);
      const key = ofType ? `${segment}${ofType[1]}` : segment;
      if (ofType) i++;
      items = items.flatMap((item) => {
        const value = (item as Json)?.[key];
        return value === undefined ? [] : Array.isArray(value) ? value : [value];
      });
      continue;
    }
    const [, name, arg] = call;
    if (name === "first") items = items.slice(0, 1);
    else if (name === "exists") items = [items.length > 0];
    else if (name === "join") items = items.length ? [items.join(String(literal(arg, constants)))] : [];
    else if (name === "where") items = items.filter((item) => evaluate(arg, [item], constants)[0] === true);
    else if (name === "getResourceKey") items = items.map((item) => (item as Json).id);
    else if (name === "getReferenceKey") {
      items = items.flatMap((item) => {
        const [type, id] = String((item as Json).reference ?? "").split("/");
        return id && (!arg || arg === type) ? [id] : [];
      });
    } else throw new Error(`Unsupported FHIRPath function ${name}() in: ${expr}`);
  }
  return items;
}

function columnNames(select: Select): string[] {
  return [...(select.column ?? []).map((c) => c.name), ...(select.select ?? []).flatMap(columnNames)];
}

function rowsFor(select: Select, node: unknown, constants: Json): Row[] {
  if (select.unionAll) throw new Error("unionAll is not supported by this demo runner");
  const path = select.forEach ?? select.forEachOrNull;
  const foci = path ? evaluate(path, [node], constants) : [node];
  if (select.forEachOrNull && foci.length === 0) {
    return [Object.fromEntries(columnNames(select).map((name) => [name, null]))];
  }
  return foci.flatMap((focus) => {
    const own: Row = {};
    for (const column of select.column ?? []) {
      const values = evaluate(column.path, [focus], constants);
      if (column.collection) own[column.name] = values;
      else if (values.length > 1) {
        throw new Error(`Column ${column.name}: ${column.path} returned ${values.length} values; set collection: true`);
      } else own[column.name] = values[0] ?? null;
    }
    // Each nested select adds columns; their rows are combined as a cross join.
    return (select.select ?? []).reduce<Row[]>(
      (rows, nested) => rows.flatMap((row) => rowsFor(nested, focus, constants).map((more) => ({ ...row, ...more }))),
      [own],
    );
  });
}

export function runView(view: ViewDefinition, resources: unknown[]): Row[] {
  const constants: Json = {};
  for (const { name, ...rest } of view.constant ?? []) {
    const key = Object.keys(rest).find((k) => k.startsWith("value"));
    if (!key) throw new Error(`Constant ${name} has no value[x]`);
    constants[name] = rest[key];
  }
  return resources
    .filter((r) => (r as Json).resourceType === view.resource)
    .filter((r) => (view.where ?? []).every((w) => evaluate(w.path, [r], constants)[0] === true))
    .flatMap((r) => rowsFor({ column: view.column, select: view.select }, r, constants));
}

export const readNdjson = (path: string | URL): unknown[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
