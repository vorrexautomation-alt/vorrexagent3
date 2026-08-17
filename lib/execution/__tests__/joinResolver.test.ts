// Run with: node --test lib/execution/__tests__/joinResolver.test.ts
// Zero external dependencies (planner.ts and joinResolver.ts are pure),
// so unlike the sandbox/queue tests elsewhere in this project, these
// actually run in any environment, including this one.
import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionPlan } from "../planner.ts";
import { JoinResolver } from "../joinResolver.ts";
import type { WorkflowJson } from "../types.ts";

// Helper: a minimal WorkflowJson from a shorthand edge list.
// edges: [sourceId, sourceHandle|null, targetId][]
function wf(nodeIds: string[], edges: Array<[string, string | null, string]>): WorkflowJson {
  const connections: WorkflowJson["connections"] = {};
  edges.forEach(([source, handle, target], i) => {
    connections![`e${i}`] = { source, target, ...(handle ? { sourceHandle: handle } : {}) };
  });
  return { nodes: nodeIds.map((id) => ({ id, type: "noop", name: id })), connections };
}

test("linear chain: A -> B -> C, no join nodes, single-value input passthrough", () => {
  const plan = buildExecutionPlan(wf(["A", "B", "C"], [["A", null, "B"], ["B", null, "C"]]));
  const resolver = new JoinResolver(plan);

  const seedReady = resolver.seedTrigger("A", { x: 1 });
  assert.deepEqual(seedReady.input, { x: 1 });

  const afterA = resolver.recordCompletion("A", [{ port: "out", data: "a-out" }]);
  assert.equal(afterA.length, 1);
  assert.equal(afterA[0].nodeId, "B");
  assert.equal(afterA[0].input, "a-out"); // single value, not wrapped in an array

  const afterB = resolver.recordCompletion("B", [{ port: "out", data: "b-out" }]);
  assert.equal(afterB.length, 1);
  assert.equal(afterB[0].nodeId, "C");
  assert.equal(afterB[0].input, "b-out");
});

test("diamond graph: A -> B -> D and A -> C -> D; D (a real join node) waits for BOTH branches", () => {
  // A
  // |-> B -> D
  // |-> C -> D
  const plan = buildExecutionPlan(
    wf(["A", "B", "C", "D"], [
      ["A", null, "B"],
      ["A", null, "C"],
      ["B", null, "D"],
      ["C", null, "D"],
    ])
  );
  const resolver = new JoinResolver(plan);
  resolver.seedTrigger("A", null);

  const afterA = resolver.recordCompletion("A", [{ port: "out", data: "a" }]);
  assert.equal(afterA.length, 2); // both B and C become ready
  assert.deepEqual(
    afterA.map((r) => r.nodeId).sort(),
    ["B", "C"]
  );

  // B finishes first — D must NOT be ready yet (this is the exact bug
  // Phase 3 fixes: the old runtime would have run D right here).
  const afterB = resolver.recordCompletion("B", [{ port: "out", data: "from-b" }]);
  assert.equal(afterB.length, 0, "D must not be ready after only one of its two branches has fired");

  // C finishes second — NOW D becomes ready, with both branches' data.
  const afterC = resolver.recordCompletion("C", [{ port: "out", data: "from-c" }]);
  assert.equal(afterC.length, 1);
  assert.equal(afterC[0].nodeId, "D");
  assert.deepEqual(afterC[0].input, ["from-b", "from-c"]); // array, in edge-definition order
});

test("If node: only the taken branch fires; the merge downstream of both branches still runs (not stuck waiting on the untaken one)", () => {
  // IF -true-> B -> MERGE
  // IF -false-> C -> MERGE
  const plan = buildExecutionPlan(
    wf(["IF", "B", "C", "MERGE"], [
      ["IF", "true", "B"],
      ["IF", "false", "C"],
      ["B", null, "MERGE"],
      ["C", null, "MERGE"],
    ])
  );
  const resolver = new JoinResolver(plan);
  resolver.seedTrigger("IF", null);

  // IF only emits on "true" this run — condition was true.
  const afterIf = resolver.recordCompletion("IF", [{ port: "true", data: "cond-true-payload" }]);
  // B becomes ready (its one incoming edge fired). C does NOT become
  // ready as a normal node — its only incoming edge was skipped, so C
  // itself is fully skipped and the skip propagates straight through to
  // MERGE without MERGE ever needing to know C existed.
  assert.equal(afterIf.length, 1);
  assert.equal(afterIf[0].nodeId, "B");

  const afterB = resolver.recordCompletion("B", [{ port: "out", data: "b-result" }]);
  // MERGE is now ready: its edge from B fired, its edge from C resolved
  // as skipped (propagated through C without C ever running), so MERGE
  // runs with just B's single value — not stuck waiting forever on a
  // branch that was never going to fire.
  assert.equal(afterB.length, 1);
  assert.equal(afterB[0].nodeId, "MERGE");
  assert.deepEqual(afterB[0].input, ["b-result"]); // still an array (MERGE has 2 incoming edges = join node), just length 1
});

test("a node erroring propagates a skip through its outgoing edges, same as an untaken branch", () => {
  // A -> B -> MERGE
  // A -> C -> MERGE
  // B errors instead of completing normally.
  const plan = buildExecutionPlan(
    wf(["A", "B", "C", "MERGE"], [
      ["A", null, "B"],
      ["A", null, "C"],
      ["B", null, "MERGE"],
      ["C", null, "MERGE"],
    ])
  );
  const resolver = new JoinResolver(plan);
  resolver.seedTrigger("A", null);
  const afterA = resolver.recordCompletion("A", [{ port: "out", data: "a" }]);
  assert.equal(afterA.length, 2);

  const afterBError = resolver.recordSkippedOrFailed("B"); // B errored — no data to offer
  assert.equal(afterBError.length, 0, "MERGE still waiting on C");

  const afterC = resolver.recordCompletion("C", [{ port: "out", data: "c-result" }]);
  assert.equal(afterC.length, 1);
  assert.equal(afterC[0].nodeId, "MERGE");
  assert.deepEqual(afterC[0].input, ["c-result"]); // only C's branch, B contributed nothing
});

test("a node emitting multiple times on the same port (loop-style fan-out) dispatches the target once per emission, not just the first", () => {
  // LOOP -loop-> B (single incoming edge; B is not itself a join node)
  const plan = buildExecutionPlan(wf(["LOOP", "B"], [["LOOP", "loop", "B"]]));
  const resolver = new JoinResolver(plan);
  resolver.seedTrigger("LOOP", null);

  const afterLoop = resolver.recordCompletion("LOOP", [
    { port: "loop", data: "batch-1" },
    { port: "loop", data: "batch-2" },
    { port: "loop", data: "batch-3" },
  ]);

  assert.equal(afterLoop.length, 3, "every batch should dispatch B, not just the first");
  assert.deepEqual(
    afterLoop.map((r) => r.input),
    ["batch-1", "batch-2", "batch-3"]
  );
  assert.ok(afterLoop.every((r) => r.nodeId === "B"));
});

test("both branches into a join skipped: the join node itself is skipped, and propagates further downstream", () => {
  // IF -true-> B -> MERGE -> D
  // IF -false-> C -> MERGE
  // condition is true, so IF only emits "true"; MERGE only gets B's data
  // and runs. Now test the case where MERGE itself has no incoming
  // branch fire at all (both upstream fully skipped) — MERGE should be
  // skipped too, and D downstream of MERGE should also end up skipped,
  // not left hanging.
  const plan = buildExecutionPlan(
    wf(["IF1", "IF2", "B", "C", "MERGE", "D"], [
      ["IF1", "true", "B"],
      ["IF2", "false", "C"], // note: separate trigger-ish nodes, both never fire toward MERGE
      ["B", null, "MERGE"],
      ["C", null, "MERGE"],
      ["MERGE", null, "D"],
    ])
  );
  const resolver = new JoinResolver(plan);
  resolver.seedTrigger("IF1", null);
  resolver.seedTrigger("IF2", null);

  // IF1 emits only "false" (not "true") -> B's incoming edge skipped.
  const after1 = resolver.recordCompletion("IF1", [{ port: "false", data: "unused" }]);
  assert.equal(after1.length, 0); // B fully skipped (no ready B), propagates nothing yet since MERGE still waits on C's branch

  // IF2 emits only "true" (not "false") -> C's incoming edge skipped.
  const after2 = resolver.recordCompletion("IF2", [{ port: "true", data: "unused" }]);
  // Now both of MERGE's incoming edges are resolved, and NEITHER fired
  // -> MERGE is fully skipped -> propagates to D -> D is also fully
  // skipped (no incoming edges fired) -> nothing ready.
  assert.equal(after2.length, 0, "MERGE and D are both fully skipped, never returned as ready");
});
