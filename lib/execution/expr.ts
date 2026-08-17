// Minimal n8n-style expression resolver.
//
// The canvas's field placeholders and helpText (see nodeDefinitions.ts —
// e.g. httpRequest's URL, If/Filter/Switch conditions, every messaging
// node's "message" field) all use `{{$json.someField}}` to mean "the
// current input item's someField". Nothing previously resolved these —
// they were purely cosmetic hints — so a workflow author following the
// UI's own placeholders got the literal string "{{$json.status}}" sent to
// Slack instead of the value. This resolves that subset of n8n's
// expression syntax:
//   {{$json}}            -> the whole input value (JSON.stringified if not already a string)
//   {{$json.a.b.c}}      -> dot-path lookup into the input object
//   {{$json["a b"]}}     -> bracket lookup, for keys with spaces/special chars
// Anything else inside {{ }} (function calls, $node references, etc.) is
// left untouched rather than guessed at — this is a pragmatic subset, not
// a full expression engine.

import type { NodeData } from "./types";

function getPath(input: unknown, path: string): unknown {
  if (path === "") return input;
  const parts = path
    .replace(/\[["']?([^"'\]]+)["']?\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur: unknown = input;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const EXPR_RE = /\{\{\s*\$json(\.[^}]*|\[[^\]]*\])?\s*\}\}/g;

export function resolveString(str: string, input: NodeData): string {
  if (!str.includes("{{")) return str;
  return str.replace(EXPR_RE, (_match, accessor: string | undefined) => {
    if (!accessor) return stringify(input);
    const path = accessor.startsWith(".") ? accessor.slice(1) : accessor;
    return stringify(getPath(input, path));
  });
}

// Same {{$json...}} syntax as resolveString, but for building a SQL
// query safely: instead of stringifying each match and splicing it
// straight into the query text (which is how a webhook body ends up as
// live SQL — see runPostgresQuery / the mysql executor in
// executors/index.ts), every match is pulled OUT into a `values` array
// and replaced with a driver placeholder, so the query text sent to the
// database never contains attacker-controlled bytes — the driver binds
// `values` separately from `text`. `makePlaceholder` lets the caller
// pick the driver's placeholder syntax ($1, $2... for pg; ? for mysql2,
// which doesn't number its placeholders).
export function resolveQueryParams(
  str: string,
  input: NodeData,
  makePlaceholder: (paramIndex: number) => string
): { text: string; values: unknown[] } {
  if (!str.includes("{{")) return { text: str, values: [] };
  const values: unknown[] = [];
  const text = str.replace(EXPR_RE, (_match, accessor: string | undefined) => {
    const path = accessor ? (accessor.startsWith(".") ? accessor.slice(1) : accessor) : "";
    values.push(getPath(input, path));
    return makePlaceholder(values.length);
  });
  return { text, values };
}

// Deep-resolves every string found in a value (string, or nested
// object/array of strings) against the current input. Non-string leaves
// (numbers, booleans, null) pass through unchanged.
export function resolveDeep<T>(value: T, input: NodeData): T {
  if (typeof value === "string") return resolveString(value, input) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, input)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveDeep(v, input);
    }
    return out as unknown as T;
  }
  return value;
}
