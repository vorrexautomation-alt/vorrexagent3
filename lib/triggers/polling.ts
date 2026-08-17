import { Queue } from "bullmq";
import { getRedisConnection } from "@/lib/queue/connection";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enqueueRun } from "@/lib/queue/queue";
import { logStructured } from "@/lib/observability";

export const POLLING_QUEUE_NAME = "workflow-polling";
let pollingQueue: Queue | null = null;
function getPollingQueue() {
  if (!pollingQueue) pollingQueue = new Queue(POLLING_QUEUE_NAME, { connection: getRedisConnection() });
  return pollingQueue;
}

export async function materializePollingJobs(now = new Date()) {
  const { data: triggers, error } = await supabaseAdmin.from("polling_triggers").select("*").eq("enabled", true).or(`next_run_at.is.null,next_run_at.lte.${now.toISOString()}`).limit(500);
  if (error) throw new Error(error.message);
  const queue = getPollingQueue();
  let scheduled = 0;
  for (const trigger of triggers || []) {
    const next = new Date(now.getTime() + Math.max(5_000, Number(trigger.interval_ms || 60_000)));
    await queue.add("poll", { triggerId: trigger.id }, { jobId: `poll:${trigger.id}:${Math.floor(now.getTime() / Math.max(5_000, Number(trigger.interval_ms || 60_000)))}`, delay: 0, removeOnComplete: { age: 3600 }, removeOnFail: { age: 86400 } });
    await supabaseAdmin.from("polling_triggers").update({ next_run_at: next.toISOString(), last_scheduled_at: now.toISOString() }).eq("id", trigger.id);
    scheduled += 1;
  }
  return { scheduled };
}

export async function executePollingJob(triggerId: string) {
  const { data: trigger } = await supabaseAdmin.from("polling_triggers").select("*").eq("id", triggerId).eq("enabled", true).single();
  if (!trigger) return { skipped: true };
  const response = await fetch(trigger.url, { method: trigger.method || "GET", headers: trigger.headers || {}, signal: AbortSignal.timeout(Math.min(30_000, Number(trigger.timeout_ms || 10_000))) });
  const text = await response.text();
  let payload: unknown = text;
  try { payload = text ? JSON.parse(text) : {}; } catch { /* keep text */ }
  if (!response.ok) throw new Error(`Polling request failed (${response.status}).`);
  const { runId } = await enqueueRun({ workflowId: trigger.workflow_id, clientId: trigger.client_id, triggerType: "schedule", triggerData: { pollingTriggerId: trigger.id, response: payload } });
  await supabaseAdmin.from("polling_triggers").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", trigger.id);
  return { runId };
}

export async function markPollingFailure(triggerId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const { error: rpcError } = await supabaseAdmin.rpc("increment_polling_failure", { trigger_id: triggerId, failure_message: message });
  if (rpcError) await supabaseAdmin.from("polling_triggers").update({ last_error: message, failure_count: 1 }).eq("id", triggerId);
  logStructured({ level: "error", event: "polling.failed", error: message, metadata: { triggerId } });
}
