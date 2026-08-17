// Vercel-compatible sandbox for the Code node.
//
// This implementation uses Node's built-in `node:vm`, so deployment does not
// require a native addon or a C++ toolchain. It intentionally exposes only a
// small context containing a deep-copied input and applies a synchronous
// wall-clock timeout to the script.
//
// Important security boundary: Node's `vm` is a language sandbox, not a hard
// OS/V8 security boundary. Do not expose secrets, host objects, require,
// process, fetch, timers, or filesystem handles to this context. For hostile
// multi-tenant code, run this module in a separate worker/container/VM with
// OS-level isolation.

import vm from "node:vm";

export interface SandboxResult {
  data: unknown;
  error: string | null;
  durationMs: number;
}

export interface SandboxOptions {
  timeoutMs?: number;
  /** Retained for API compatibility. Node's vm has no heap-limit option. */
  memoryLimitMb?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;

function cloneInput(input: unknown): unknown {
  if (typeof structuredClone === "function") return structuredClone(input);
  return JSON.parse(JSON.stringify(input));
}

export async function runInSandbox(code: string, input: unknown, opts: SandboxOptions = {}): Promise<SandboxResult> {
  const requestedTimeout = Number(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const timeoutMs = Math.min(Math.max(1, Number.isFinite(requestedTimeout) ? requestedTimeout : DEFAULT_TIMEOUT_MS), MAX_TIMEOUT_MS);
  const start = Date.now();

  try {
    const copiedInput = cloneInput(input);
    const context = vm.createContext(Object.create(null));
    context.__input = copiedInput;

    const wrapped = `(function () {
      "use strict";
      const items = __input;
      const $json = __input;
      const input = __input;
      ${code}
    })()`;

    const script = new vm.Script(wrapped, { filename: "vorrex-code-node.js" });
    const result = script.runInContext(context, { timeout: timeoutMs, displayErrors: true });
    return { data: structuredClone(result), error: null, durationMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message, durationMs: Date.now() - start };
  }
}
