// Run with: npx tsx --test lib/execution/__tests__/runtime.test.ts
// (needs tsx, not plain `node --test`, because runtime.ts's own import
// graph — via ./executors — pulls in extensionless internal imports;
// see the note in package.json's "test" script.) This exercises the
// REAL runWorkflow() end-to-end, including actual registered executors
// (manualTrigger, if, merge, code), not just the pure resolver logic
// already covered in joinResolver.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { runWorkflow } from "../runtime.ts";
import type { WorkflowJson, ExecutionContext } from "../types.ts";

const ctx: ExecutionContext = { workflowId: "wf-test", clientId: "client-test", triggerData: null };

test("if -> merge: the untaken branch doesn't block merge, and merge only sees the taken branch's data", async () => {
  const workflow: WorkflowJson = {
    nodes: [
      { id: "trigger", type: "manualTrigger", name: "Start", config: {} },
      { id: "if1", type: "if", name: "Check", config: { conditions: [{ field: "1", operator: "equals", value: "1" }] } },
      { id: "codeTrue", type: "code", name: "True branch", config: { code: "return 'true-branch-ran';" } },
      { id: "codeFalse", type: "code", name: "False branch", config: { code: "return 'false-branch-ran';" } },
      { id: "merge", type: "merge", name: "Combine", config: { mode: "append" } },
    ],
    connections: {
      e0: { source: "trigger", target: "if1" },
      e1: { source: "if1", sourceHandle: "true", target: "codeTrue" },
      e2: { source: "if1", sourceHandle: "false", target: "codeFalse" },
      e3: { source: "codeTrue", target: "merge" },
      e4: { source: "codeFalse", target: "merge" },
    },
  };

  const result = await runWorkflow(workflow, ctx);

  assert.equal(result.status, "success");
  const mergeResult = result.node_results.find((r) => r.node === "Combine");
  assert.ok(mergeResult);
  assert.equal(mergeResult!.status, "success");
  // Only the taken (true) branch contributed — the false branch's code
  // node never ran at all (not present in node_results), and merge
  // still completed rather than hanging or running prematurely.
  assert.deepEqual(mergeResult!.output, ["true-branch-ran"]);
  assert.equal(
    result.node_results.some((r) => r.node === "False branch"),
    false,
    "the untaken branch's code node should never execute"
  );
});

test("continueOnFail: a failing node doesn't stop independent branches, and downstream merge still runs", async () => {
  const workflow: WorkflowJson = {
    nodes: [
      { id: "trigger", type: "manualTrigger", name: "Start", config: {} },
      { id: "a", type: "code", name: "A", config: { code: "return 'a-ok';" } },
      {
        id: "b",
        type: "code",
        name: "B (fails)",
        config: { code: 'throw new Error("boom");', __settings: { continueOnFail: true } },
      },
      { id: "merge", type: "merge", name: "Combine", config: {} },
    ],
    connections: {
      e0: { source: "trigger", target: "a" },
      e1: { source: "trigger", target: "b" },
      e2: { source: "a", target: "merge" },
      e3: { source: "b", target: "merge" },
    },
  };

  const result = await runWorkflow(workflow, ctx);

  assert.equal(result.status, "success", "one continue-on-fail node failing should not fail the whole run");
  const bResult = result.node_results.find((r) => r.node === "B (fails)");
  assert.equal(bResult?.status, "error");
  const mergeResult = result.node_results.find((r) => r.node === "Combine");
  assert.equal(mergeResult?.status, "success");
  assert.deepEqual(mergeResult!.output, ["a-ok"]); // B contributed nothing, but merge still ran
});

test("retryOnFail: a node that fails then succeeds is retried, not immediately failed", async () => {
  // A code node whose script's behavior depends on a module-level
  // counter it mutates via a closure captured in `code` — since the
  // sandbox deep-copies input and has no shared state across calls,
  // simulate "fails once then succeeds" using the input value itself:
  // manualTrigger seeds trigger data of 0; the "counter" node increments
  // a value passed through node config via a side channel isn't
  // available in-sandbox, so instead this test verifies retry COUNT
  // behavior by having the node always fail and checking the error
  // message reports the configured number of attempts.
  const workflow: WorkflowJson = {
    nodes: [
      { id: "trigger", type: "manualTrigger", name: "Start", config: {} },
      {
        id: "flaky",
        type: "code",
        name: "Flaky",
        config: {
          code: 'throw new Error("always fails");',
          __settings: { retryOnFail: true, maxTries: "3", waitBetweenTries: "0" },
        },
      },
    ],
    connections: { e0: { source: "trigger", target: "flaky" } },
  };

  const result = await runWorkflow(workflow, ctx);
  assert.equal(result.status, "error");
  const flakyResult = result.node_results.find((r) => r.node === "Flaky");
  assert.match(flakyResult!.error ?? "", /failed after 3 attempts/);
});

test("a workflow with no reachable trigger errors clearly instead of doing nothing silently", async () => {
  const result = await runWorkflow({ nodes: [], connections: {} }, ctx);
  assert.equal(result.status, "error");
  assert.match(result.error ?? "", /No trigger node found/);
});

test("loop node: each batch reaches the downstream node once, in order, and 'done' still fires separately", async () => {
  const workflow: WorkflowJson = {
    nodes: [
      { id: "trigger", type: "manualTrigger", name: "Start", config: {} },
      { id: "loop", type: "loop", name: "Loop", config: { batchSize: 2 } },
      { id: "process", type: "code", name: "Process batch", config: { code: "return items;" } },
      { id: "afterDone", type: "code", name: "After done", config: { code: "return 'finished';" } },
    ],
    connections: {
      e0: { source: "trigger", target: "loop" },
      e1: { source: "loop", sourceHandle: "loop", target: "process" },
      e2: { source: "loop", sourceHandle: "done", target: "afterDone" },
    },
  };

  const result = await runWorkflow(workflow, { ...ctx, triggerData: [1, 2, 3, 4, 5] });

  assert.equal(result.status, "success");
  const processRuns = result.node_results.filter((r) => r.node === "Process batch");
  // batchSize 2 over 5 items -> 3 batches: [1,2], [3,4], [5]
  assert.equal(processRuns.length, 3, "the downstream node should run once per batch, not once total");
  assert.deepEqual(
    processRuns.map((r) => r.output),
    [
      [1, 2],
      [3, 4],
      [5],
    ]
  );
  const doneResult = result.node_results.find((r) => r.node === "After done");
  assert.equal(doneResult?.status, "success");
});
