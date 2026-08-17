// Enqueues a durable, queue-backed workflow run (Phase 3).
//
// This is the "async" counterpart to lib/execution/runtime.ts's
// synchronous runWorkflow() — instead of running the graph inline and
// blocking the caller's HTTP request until it finishes, this creates a
// `workflow_runs` row (see sql/003_execution_engine.sql) and hands a
// BullMQ job to a worker (lib/queue/worker.ts) to actually execute it.
// The caller gets a run id back immediately and polls
// GET /api/workflows/[id]/runs/[runId] for status.

import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import { supabaseAdmin } from "../supabaseAdmin";
import { NodeData } from "../execution/types";

export const RUNS_QUEUE_NAME = "workflow-runs";

let _queue: Queue | null = null;

function getQueue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue(RUNS_QUEUE_NAME, { connection: getRedisConnection() });
  return _queue;
}

export interface EnqueueRunParams {
  workflowId: string;
  clientId: string;
  triggerType: "manual" | "webhook" | "schedule" | "chat" | "form";
  triggerData: NodeData;
}

export async function enqueueRun(params: EnqueueRunParams): Promise<{ runId: string }> {
  const { workflowId, clientId, triggerType, triggerData } = params;

  // The Postgres row is created BEFORE the BullMQ job — if Redis is
  // down or misconfigured, the caller gets a clear error from the
  // queue.add() call below, but there's no orphaned "queued forever
  // with nothing tracking it" state, since queue.add() failing here
  // just means the row is created but no job will ever pick it up. A
  // background reconciliation job that flags workflow_runs rows stuck
  // in 'queued' past some threshold is a reasonable Phase 6
  // (Observability) addition — this function doesn't attempt to paper
  // over that by rolling back the insert on a queue.add() failure,
  // since "the row exists but nothing will process it" is exactly the
  // failure a monitor should catch and surface, not silently erase.
  const { data: run, error } = await supabaseAdmin
    .from("workflow_runs")
    .insert({
      workflow_id: workflowId,
      client_id: clientId,
      trigger_type: triggerType,
      trigger_data: triggerData ?? null,
      status: "queued",
    })
    .select("id")
    .single();

  if (error || !run) throw new Error(`Failed to create workflow_runs row: ${error?.message}`);

  await supabaseAdmin.from("audit_log").insert({
    actor_type: "client",
    actor_id: clientId,
    action: "run.enqueue",
    client_id: clientId,
    details: { workflow_id: workflowId, trigger_type: triggerType },
  });

  const queue = getQueue();
  await queue.add(
    "run",
    { runId: run.id },
    {
      jobId: run.id, // idempotency: re-enqueuing the same run id is a no-op, not a duplicate job
      // Job-level retry is intentionally OFF (attempts: 1) — per-node
      // retry is already handled inside the worker via
      // lib/execution/nodeStep.ts's readNodeSettings/executeNodeWithRetry,
      // same policy the debug path uses. A BullMQ-level retry would
      // re-run the ENTIRE workflow from its trigger on any transient
      // worker crash, re-executing nodes that already succeeded and
      // had side effects (sent a Slack message, wrote a Postgres row)
      // — safe for a stateless retry, actively harmful for a workflow
      // with real-world side effects. See docs/phase3-execution-engine.md.
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    }
  );

  return { runId: run.id };
}

export async function closeQueue(): Promise<void> {
  if (_queue) await _queue.close();
}
