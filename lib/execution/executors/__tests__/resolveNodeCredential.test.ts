// Run with: node --test lib/execution/executors/__tests__/resolveNodeCredential.test.ts
//
// Only exercises the env-var FALLBACK branch of resolveNodeCredential
// (params.__credential is "env", "none", or missing) — that branch never
// touches lib/credentials.ts or supabaseAdmin, so it's testable with zero
// mocking or a live Supabase project. The stored-credential branch
// (params.__credential is a real id) is covered indirectly by
// lib/__tests__/crypto.test.ts (the encryption round-trip it depends on)
// and lib/credentials.ts's query-scoping, which needs a real or mocked
// Supabase client to exercise meaningfully — left for an integration test
// once the project has a test Supabase instance wired up, rather than
// faked here in a way that could pass without proving anything.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveNodeCredential } from "../index.ts";
import type { ExecutionContext } from "../../types.ts";

const ctx: ExecutionContext = { workflowId: "wf-1", clientId: "client-1", triggerData: {} };

test("__credential unset falls back to process.env (legacy behavior)", async () => {
  process.env.TEST_ENV_VAR_A = "value-a";
  try {
    const result = await resolveNodeCredential(ctx, {}, ["TEST_ENV_VAR_A"]);
    assert.deepEqual(result, { TEST_ENV_VAR_A: "value-a" });
  } finally {
    delete process.env.TEST_ENV_VAR_A;
  }
});

test('__credential: "env" falls back to process.env explicitly', async () => {
  process.env.TEST_ENV_VAR_B = "value-b";
  try {
    const result = await resolveNodeCredential(ctx, { __credential: "env" }, ["TEST_ENV_VAR_B"]);
    assert.deepEqual(result, { TEST_ENV_VAR_B: "value-b" });
  } finally {
    delete process.env.TEST_ENV_VAR_B;
  }
});

test('__credential: "none" also falls back to process.env (and throws the same missing-var error if unset)', async () => {
  delete process.env.TEST_ENV_VAR_C;
  await assert.rejects(
    () => resolveNodeCredential(ctx, { __credential: "none" }, ["TEST_ENV_VAR_C"]),
    /Missing required environment variable\(s\): TEST_ENV_VAR_C/
  );
});

test("missing env var produces a clear, actionable error listing every missing name", async () => {
  delete process.env.TEST_ENV_VAR_D;
  delete process.env.TEST_ENV_VAR_E;
  await assert.rejects(
    () => resolveNodeCredential(ctx, {}, ["TEST_ENV_VAR_D", "TEST_ENV_VAR_E"]),
    /TEST_ENV_VAR_D, TEST_ENV_VAR_E/
  );
});

test("a stored-credential id (not env/none) attempts the encrypted-store path, not env vars", async () => {
  // No Supabase config in this test environment, so resolveCredential's
  // underlying supabaseAdmin call is expected to fail — the important
  // assertion is WHICH path was taken: it must NOT silently read
  // process.env even if a same-named var happens to be set, since that
  // would mean a client-scoped stored credential could be shadowed by
  // another client's leftover env var.
  process.env.SOME_LEGACY_VAR = "should-not-be-used";
  try {
    await assert.rejects(() =>
      resolveNodeCredential(ctx, { __credential: "11111111-1111-1111-1111-111111111111" }, ["SOME_LEGACY_VAR"])
    );
  } finally {
    delete process.env.SOME_LEGACY_VAR;
  }
});
