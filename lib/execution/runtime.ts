// Execution runtime — synchronous, in-process run of a workflow graph.
//
// PHASE 3: this is now the "debug" path explicitly called for in the
// target architecture doc ("Keep the existing synchronous /run endpoint
// as a 'debug' path that still works") — app/api/workflows/[id]/run and
// the webhook receiver both still call runWorkflow() with the exact same
// signature as before, so neither route needed to change. The durable,
// queue-backed engine lives in lib/queue/ and reuses the same
// planner.ts / joinResolver.ts / nodeStep.ts this file uses, so both
// paths share one definition of "what does this graph do," not two.
//
// What changed from the pre-Phase-3 version:
//   - Real join/skip semantics via JoinResolver (lib/execution/
//     joinResolver.ts), replacing a breadth-first queue walk that ran a
//     "merge" node once per incoming branch instead of waiting for all
//     of them — see joinResolver.ts's own comment for the full story,
//     and its test file for the exact bug this fixes.
//   - Per-node retry and continue-on-fail (lib/execution/nodeStep.ts),
//     honoring the `__settings` config every node already has in the UI
//     (ConfigPanel.tsx's "Error handling" tab) but that the old runtime
//     silently ignored.
//   - Nodes at the same "wave" of readiness now run concurrently
//     (Promise.all) rather than strictly one at a time — independent
//     branches no longer serialize behind each other for no reason.
//
// What's unchanged: the graph shape this reads (WorkflowJson — see
// types.ts), the ExecutionContext/ExecutionResult/NodeRunResult shapes
// every caller depends on, and the MAX_NODE_EXECUTIONS cycle guard.

import { buildExecutionPlan, findTriggerNodes } from "./planner";
import { JoinResolver, ReadyNode } from "./joinResolver";
import { executeNodeWithRetry, readNodeSettings } from "./nodeStep";
import { ExecutionContext, ExecutionResult, NodeRunResult, WorkflowJson } from "./types";

// Side-effect import: registers every built-in node executor into the
// registry above. This must happen before runWorkflow() is ever called.
// Deliberately imported here (the one real entry point into execution)
// rather than from registry.ts itself — see the note in registry.ts for
// why that direction of import creates a circular-module bug in
// production builds.
import "./executors";

const MAX_NODE_EXECUTIONS = 2000;

export async function runWorkflow(workflow: WorkflowJson, ctx: ExecutionContext): Promise<ExecutionResult> {
  const nodeById = new Map((workflow.nodes || []).map((n) => [n.id, n]));
  const triggers = findTriggerNodes(workflow);

  if (triggers.length === 0) {
    return {
      status: "error",
      node_results: [],
      error: "No trigger node found — add a Manual Trigger or Webhook node to run this workflow.",
    };
  }

  const plan = buildExecutionPlan(workflow);
  const resolver = new JoinResolver(plan);
  const results: NodeRunResult[] = [];

  let wave: ReadyNode[] = triggers.map((t) => resolver.seedTrigger(t.id, ctx.triggerData));
  let executions = 0;
  let hadUnrecoverableError = false;
  const executedOnceNodes = new Set<string>();

  while (wave.length > 0 && !hadUnrecoverableError) {
    if (executions + wave.length > MAX_NODE_EXECUTIONS) {
      results.push({
        node: "(workflow)",
        type: "runtime",
        status: "error",
        error: `Stopped after ${MAX_NODE_EXECUTIONS} node executions — the graph likely has an unbounded loop.`,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      });
      hadUnrecoverableError = true;
      break;
    }
    executions += wave.length;

    // Every node in the current wave is independently ready (its
    // dependencies are already resolved), so they run concurrently —
    // this is the "concurrent branch execution" pillar 2 called for.
    // Join barriers (waiting for ALL branches before a join node
    // becomes part of a wave at all) are enforced by JoinResolver
    // upstream of this, not by anything here.
    const settled = await Promise.all(
      wave.map(async (rn) => {
        const node = nodeById.get(rn.nodeId)!;
        const settings = readNodeSettings(node);
        if (settings.executeOnce && executedOnceNodes.has(rn.nodeId)) {
          return { rn, node, outcome: { status: "success" as const, emissions: [], attempts: 0 }, started_at: new Date().toISOString(), finished_at: new Date().toISOString(), skippedByExecuteOnce: true };
        }
        if (settings.executeOnce) executedOnceNodes.add(rn.nodeId);
        const started_at = new Date().toISOString();
        const outcome = await executeNodeWithRetry(node, rn.input, ctx);
        const finished_at = new Date().toISOString();
        return { rn, node, outcome, started_at, finished_at, skippedByExecuteOnce: false };
      })
    );

    const nextWave: ReadyNode[] = [];

    for (const { rn, node, outcome, started_at, finished_at, skippedByExecuteOnce } of settled) {
      if (skippedByExecuteOnce) {
        nextWave.push(...resolver.recordSkippedOrFailed(rn.nodeId));
        continue;
      }
      if (outcome.status === "success") {
        results.push({
          node: node.name,
          type: node.type,
          status: "success",
          output: outcome.emissions.length === 1 ? outcome.emissions[0].data : outcome.emissions,
          started_at,
          finished_at,
        });
        nextWave.push(...resolver.recordCompletion(rn.nodeId, outcome.emissions));
        continue;
      }

      // outcome.status === "error"
      results.push({
        node: node.name,
        type: node.type,
        status: "error",
        error: outcome.attempts > 1 ? `${outcome.error} (failed after ${outcome.attempts} attempts)` : outcome.error,
        started_at,
        finished_at,
      });

      if (readNodeSettings(node).continueOnFail) {
        // This node's branch produced nothing (same as an untaken If
        // branch) but the RUN keeps going — downstream join nodes won't
        // hang waiting on it, and every other independent branch is
        // unaffected.
        nextWave.push(...resolver.recordSkippedOrFailed(rn.nodeId));
      } else {
        hadUnrecoverableError = true;
      }
    }

    wave = hadUnrecoverableError ? [] : nextWave;
  }

  const lastError = [...results].reverse().find((r) => r.status === "error")?.error;

  return {
    status: hadUnrecoverableError ? "error" : "success",
    node_results: results,
    error: hadUnrecoverableError ? lastError : undefined,
  };
}
