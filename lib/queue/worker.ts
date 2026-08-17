// The durable execution engine's worker (Phase 3).
//
// Pulls "run" jobs off the workflow-runs BullMQ queue (see queue.ts) and
// actually executes the graph — reusing the exact same planner.ts /
// joinResolver.ts / nodeStep.ts building blocks as the synchronous debug
// path (lib/execution/runtime.ts), so "what does this graph do" has one
// definition, not two. What this adds on top of the debug path:
//   - Per-node state persisted to `workflow_run_nodes` AS THE RUN
//     PROGRESSES (running -> success/error), not just a final summary —
//     see sql/003_execution_engine.sql.
//   - Cancellation: checked between each "wave" of concurrent node
//     executions (see the same wave concept in runtime.ts) — a run
//     already `cancelling` stops scheduling further work and settles to
//     `cancelled` rather than running to completion.
//   - A run-level max-duration timeout (also checked between waves) —
//     independent of the code sandbox's own per-node timeout (Phase 2)
//     and existing per-node "Wait" node cap, this bounds the whole run.
//
// SCOPE NOTE (read before relying on this for true crash-recovery): one
// BullMQ job = one entire run, processed by whichever worker picked it
// up, start to finish, in that worker's memory (the JoinResolver
// instance lives for the job's duration, same as runtime.ts's in-process
// loop — it is NOT reconstructed from `workflow_run_nodes` between
// waves). If that worker process crashes mid-run, the run is left in
// `status: 'running'` with whatever nodes had completed already visible
// in `workflow_run_nodes` (real partial visibility, not silently lost)
// — but nothing automatically resumes it from where it left off; BullMQ
// job-level retry is deliberately OFF (see queue.ts) because a naive
// retry would re-run the whole workflow from its trigger, re-executing
// nodes that already had side effects (an already-sent Slack message,
// an already-inserted Postgres row). A real resume-from-last-checkpoint
// story — where each node is its OWN BullMQ job and the next wave is
// computed by reconstructing JoinResolver state from
// `workflow_run_nodes` — is a real upgrade path already possible on top
// of this schema, deliberately deferred rather than half-built here; see
// docs/phase3-execution-engine.md.

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "./connection";
import { RUNS_QUEUE_NAME } from "./queue";
import { supabaseAdmin } from "../supabaseAdmin";
import { buildExecutionPlan, findTriggerNodes } from "../execution/planner";
import { JoinResolver, ReadyNode } from "../execution/joinResolver";
import { executeNodeWithRetry, readNodeSettings } from "../execution/nodeStep";
import { ExecutionContext, WorkflowJson } from "../execution/types";
import { logStructured, recordMetric, recordNodeLog } from "../observability";

// Side-effect import: registers every built-in node executor. Required
// before any node can actually be executed — see runtime.ts's identical
// note for why this is imported here rather than from registry.ts.
import "../execution/executors";

const MAX_NODE_EXECUTIONS = 2000;
// A run stuck longer than this is presumed hung (e.g. an integration
// endpoint that never responds and isn't covered by that node's own
// timeout) and is stopped by the worker itself rather than left running
// indefinitely. Override per-workflow via workflow_json.settings.maxRunDurationMs.
const DEFAULT_MAX_RUN_DURATION_MS = 15 * 60 * 1000;

interface RunJobData {
  runId: string;
}

async function upsertNodeRow(
  runId: string,
  nodeId: string,
  nodeType: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("workflow_run_nodes")
    .upsert({ run_id: runId, node_id: nodeId, node_type: nodeType, ...patch }, { onConflict: "run_id,node_id" });
  // A logging write failing must never take down the actual workflow
  // run — surfaced for operators, not thrown.
  if (error) console.error(`Failed to persist workflow_run_nodes row (run ${runId}, node ${nodeId}):`, error.message);
}

async function finishRun(runId: string, status: "success" | "error" | "cancelled", error?: string): Promise<void> {
  await supabaseAdmin
    .from("workflow_runs")
    .update({ status, error: error ?? null, finished_at: new Date().toISOString() })
    .eq("id", runId);
}

async function processRun(job: Job<RunJobData>): Promise<void> {
  const { runId } = job.data;
  const runStartedAt = Date.now();
  logStructured({ level: "info", event: "run.started", runId });

  const { data: run, error: runErr } = await supabaseAdmin.from("workflow_runs").select("*").eq("id", runId).single();
  if (runErr || !run) throw new Error(`workflow_runs row ${runId} not found — cannot process this job.`);

  if (run.status === "cancelling" || run.status === "cancelled") {
    await finishRun(runId, "cancelled");
    return;
  }

  const { data: wf, error: wfErr } = await supabaseAdmin
    .from("workflows")
    .select("workflow_json")
    .eq("id", run.workflow_id)
    .single();
  if (wfErr || !wf) {
    await finishRun(runId, "error", `Workflow ${run.workflow_id} not found (it may have been deleted).`);
    return;
  }

  const workflow = (wf.workflow_json || {}) as WorkflowJson;
  const ctx: ExecutionContext = { workflowId: run.workflow_id, clientId: run.client_id, triggerData: run.trigger_data };

  const triggers = findTriggerNodes(workflow);
  if (triggers.length === 0) {
    await finishRun(runId, "error", "No trigger node found — add a Manual Trigger or Webhook node to run this workflow.");
    return;
  }

  await supabaseAdmin.from("workflow_runs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", runId);

  const plan = buildExecutionPlan(workflow);
  const resolver = new JoinResolver(plan);
  const nodeById = new Map((workflow.nodes || []).map((n) => [n.id, n]));

  const maxRunDurationMs = Number((workflow.settings as Record<string, unknown> | undefined)?.maxRunDurationMs) || DEFAULT_MAX_RUN_DURATION_MS;
  const deadline = Date.now() + maxRunDurationMs;

  let wave: ReadyNode[] = triggers.map((t) => resolver.seedTrigger(t.id, ctx.triggerData));
  let executions = 0;
  let hadUnrecoverableError = false;
  let terminalError: string | undefined;

  while (wave.length > 0 && !hadUnrecoverableError) {
    // Cancellation is cooperative, checked once per wave (not
    // mid-node — an in-flight `await fetch(...)` inside a node can't be
    // aborted from outside it). A client-requested cancel takes effect
    // as soon as the currently-running wave finishes, not instantly.
    const { data: fresh } = await supabaseAdmin.from("workflow_runs").select("status").eq("id", runId).single();
    if (fresh?.status === "cancelling") {
      await finishRun(runId, "cancelled");
      return;
    }

    if (Date.now() > deadline) {
      terminalError = `Run exceeded its maximum duration (${maxRunDurationMs}ms) and was stopped.`;
      hadUnrecoverableError = true;
      break;
    }

    if (executions + wave.length > MAX_NODE_EXECUTIONS) {
      terminalError = `Stopped after ${MAX_NODE_EXECUTIONS} node executions — the graph likely has an unbounded loop.`;
      hadUnrecoverableError = true;
      break;
    }
    executions += wave.length;

    await Promise.all(
      wave.map((rn) =>
        upsertNodeRow(runId, rn.nodeId, nodeById.get(rn.nodeId)?.type ?? "unknown", {
          status: "running",
          input: rn.input ?? null,
          started_at: new Date().toISOString(),
        })
      )
    );

    const settled = await Promise.all(
      wave.map(async (rn) => {
        const node = nodeById.get(rn.nodeId)!;
        const nodeStartedAt = Date.now();
        const outcome = await executeNodeWithRetry(node, rn.input, ctx);
        await recordNodeLog({
          runId,
          workflowId: run.workflow_id,
          clientId: run.client_id,
          nodeId: rn.nodeId,
          nodeType: node.type,
          status: outcome.status,
          attempt: outcome.attempts,
          input: rn.input,
          output: outcome.status === "success" ? outcome.emissions : undefined,
          error: outcome.status === "error" ? outcome.error : null,
          durationMs: Date.now() - nodeStartedAt,
        }).catch((error) => logStructured({ level: "warn", event: "node.log_persist_failed", runId, nodeId: rn.nodeId, error: error instanceof Error ? error.message : String(error) }));
        return { rn, node, outcome };
      })
    );

    const nextWave: ReadyNode[] = [];

    for (const { rn, node, outcome } of settled) {
      const finished_at = new Date().toISOString();

      if (outcome.status === "success") {
        await upsertNodeRow(runId, rn.nodeId, node.type, {
          status: "success",
          output: outcome.emissions.length === 1 ? outcome.emissions[0].data : outcome.emissions,
          attempt: outcome.attempts,
          finished_at,
        });
        nextWave.push(...resolver.recordCompletion(rn.nodeId, outcome.emissions));
        continue;
      }

      await upsertNodeRow(runId, rn.nodeId, node.type, {
        status: "error",
        error: outcome.error,
        attempt: outcome.attempts,
        finished_at,
      });

      if (readNodeSettings(node).continueOnFail) {
        nextWave.push(...resolver.recordSkippedOrFailed(rn.nodeId));
      } else {
        hadUnrecoverableError = true;
        terminalError = outcome.error;
      }
    }

    wave = hadUnrecoverableError ? [] : nextWave;
  }

  const finalStatus = hadUnrecoverableError ? "error" : "success";
  await finishRun(runId, finalStatus, terminalError);
  const durationMs = Date.now() - runStartedAt;
  logStructured({ level: finalStatus === "error" ? "error" : "info", event: "run.finished", runId, workflowId: run.workflow_id, clientId: run.client_id, durationMs, error: terminalError });
  await Promise.all([
    recordMetric("workflow_run_total", 1, { status: finalStatus }),
    recordMetric("workflow_run_duration_ms", durationMs, { status: finalStatus }),
  ]);
}

// Starts a long-lived BullMQ worker process. Intended to run as a
// separate Node process from the Next.js app (e.g. `node
// dist/queue/startWorker.js`, or a dedicated Railway/Render/Fly worker
// service) — NOT inside a Next.js API route handler, since those are
// request-scoped and get torn down between requests rather than staying
// alive to keep polling the queue. See docs/phase3-execution-engine.md
// for a concrete deploy shape.
export function startWorker(concurrency = 4): Worker<RunJobData> {
  const worker = new Worker<RunJobData>(RUNS_QUEUE_NAME, processRun, {
    connection: getRedisConnection(),
    concurrency,
  });

  worker.on("failed", (job, err) => {
    // A job throwing (as opposed to a node inside the workflow failing,
    // which is handled and recorded above without throwing) means
    // something broke outside the workflow itself — e.g. the
    // workflow_runs row lookup failed. Since job-level retry is off
    // (queue.ts), this won't be retried automatically; make sure it's
    // at least not silent.
    console.error(`workflow-runs job ${job?.id} failed:`, err);
  });

  return worker;
}
