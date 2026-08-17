# Phase 2 — Sandboxing for Code Nodes: Security Notes

## What changed

The `code` node no longer runs user-authored JavaScript with `new Function(...)` in the main application context. `lib/sandbox/codeSandbox.ts` now uses Node's built-in `node:vm` module, which requires no native addon and installs cleanly on Vercel and other standard Node deployments.

The code executor calls `runInSandbox()` and preserves the existing `items`, `$json`, and `input` aliases. The sandbox context receives only a structured-cloned copy of the current input.

## Vercel-compatible isolation model

The built-in VM context is a **language-level capability boundary**, not a hard operating-system or V8 security boundary. It is suitable for the current zero-capability Code node because the context receives no `process`, `require`, `fetch`, timers, filesystem handles, credentials, or host objects.

For hostile, untrusted, or high-risk multi-tenant code, run the worker in a separate container, microVM, or isolated process with OS-level resource limits. Do not treat Node's `vm` module alone as a complete defense against a future engine escape. This is the reason the medium-term worker isolation work remains on the architecture roadmap.

## Limits

| Limit | Default | Hard cap | Where |
|---|---:|---:|---|
| Wall-clock timeout | 5000 ms | 30000 ms | `lib/sandbox/codeSandbox.ts` using `vm.Script.runInContext({ timeout })` |
| Memory option | 64 MB | 256 MB API-compatible clamp | Retained in the public options contract; Node's built-in VM does not enforce a separate heap limit |

The timeout is enforced for synchronous script execution. `memoryLimitMb` remains accepted for compatibility with saved node configurations, but it is not a substitute for process/container memory limits.

## What a code node can and cannot do

A code node can read `items`, `$json`, and `input`, perform pure computation, mutate its private copied input, and return a JSON-compatible value. It cannot access process environment variables, require modules, make network requests, access the filesystem, spawn processes, read another node's credentials, or persist state between runs.

There is no capability model yet. Every Code node starts with zero external capabilities, which is safer than starting with a permissive network or filesystem surface.

## Failure modes

| Situation | Result |
|---|---|
| Script throws | `runInSandbox()` returns `{ data: null, error }`; the Code executor surfaces a node error. |
| Script exceeds timeout | Node VM interrupts execution and returns a timeout error. |
| Script allocates excessive memory | The VM option is not a hard heap limit; deploy the worker with container/process memory limits for this protection. |
| Script returns a non-cloneable value | The result-copy step returns an error instead of leaking a live VM object. |
| Deployment runs on Vercel | Dependencies install without compiling `isolated-vm` or requiring C++/node-gyp. |

## Testing

`lib/sandbox/__tests__/codeSandbox.test.ts` covers return values, input aliasing, deep-copy isolation, thrown errors, absence of `process`/`require`/`fetch`, timeout enforcement, timeout cap behavior, and compatibility of the retained memory option. The suite runs with the normal project test command and does not require a native build toolchain.
