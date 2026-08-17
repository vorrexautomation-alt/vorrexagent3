// Regression tests for the Vercel-compatible built-in VM Code node sandbox.
// The sandbox intentionally exposes no host capabilities and applies a hard
// synchronous timeout. For hostile multi-tenant code, deploy the worker with
// OS-level isolation as documented in docs/phase2-sandboxing.md.
import test from "node:test";
import assert from "node:assert/strict";
import { runInSandbox } from "../codeSandbox.ts";

test("returns the value a script returns", async () => {
  const { data, error } = await runInSandbox("return 1 + 1;", null);
  assert.equal(error, null);
  assert.equal(data, 2);
});

test("items / $json / input all alias the same input value", async () => {
  const input = { a: 1 };
  const { data, error } = await runInSandbox("return [items.a, $json.a, input.a];", input);
  assert.equal(error, null);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), [1, 1, 1]);
});

test("input is deep-copied, not passed by reference", async () => {
  const input = { count: 0 };
  const { error } = await runInSandbox("items.count = 999; return items;", input);
  assert.equal(error, null);
  assert.equal(input.count, 0, "host object must be unmodified by sandboxed code");
});

test("a thrown error inside the script is surfaced as `error`, not thrown", async () => {
  const { data, error } = await runInSandbox('throw new Error("boom");', null);
  assert.equal(data, null);
  assert.match(error ?? "", /boom/);
});

test("no access to process, require, or fs", async () => {
  for (const code of ["return typeof process;", "return typeof require;", "return typeof fetch;"]) {
    const { data, error } = await runInSandbox(code, null);
    assert.equal(error, null);
    assert.equal(data, "undefined", `expected ${code} to see nothing global-scoped`);
  }
});

test("an infinite loop is killed by the timeout, not left to hang", async () => {
  const { data, error } = await runInSandbox("while(true) {}", null, { timeoutMs: 200 });
  assert.equal(data, null);
  assert.match(error ?? "", /timed out/i);
});

test("timeoutMs is capped even if a larger value is requested", async () => {
  // Request an absurd timeout; the sandbox should still cap it (see
  // MAX_TIMEOUT_MS in codeSandbox.ts) rather than honor an unbounded wait.
  const start = Date.now();
  await runInSandbox("while(true) {}", null, { timeoutMs: 999_999 });
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 35_000, `expected the hard timeout cap to apply, took ${elapsed}ms`);
});

test("memoryLimitMb remains API-compatible and execution is still timeout-bounded", async () => {
  const { data, error } = await runInSandbox("while(true) {}", null, { memoryLimitMb: 16, timeoutMs: 200 });
  assert.equal(data, null);
  assert.match(error ?? "", /timed out/i);
});
