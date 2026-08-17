import { supabaseAdmin } from "./supabaseAdmin";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLog {
  level: LogLevel;
  event: string;
  runId?: string;
  workflowId?: string;
  nodeId?: string;
  nodeType?: string;
  clientId?: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, depth + 1));
  if (typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    result[key] = /(password|token|secret|api[_-]?key|authorization|cookie)/i.test(key) ? "[REDACTED]" : redact(child, depth + 1);
  }
  return result;
}

export function logStructured(entry: StructuredLog): void {
  const payload = redact({ timestamp: new Date().toISOString(), ...entry }) as Record<string, unknown>;
  const writer = entry.level === "error" ? console.error : entry.level === "warn" ? console.warn : console.log;
  writer(JSON.stringify(payload));
}

export async function recordMetric(name: string, value: number, labels: Record<string, string> = {}) {
  const { error } = await supabaseAdmin.from("system_metrics").insert({ name, value, labels });
  if (error) logStructured({ level: "warn", event: "metric.persist_failed", error: error.message, metadata: { name } });
}

export async function recordAudit(input: {
  actorType: "owner" | "client" | "system" | "webhook";
  actorId?: string | null;
  action: string;
  clientId?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("audit_log").insert({
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    action: input.action,
    client_id: input.clientId ?? null,
    details: input.details ?? {},
  });
  if (error) logStructured({ level: "warn", event: "audit.persist_failed", error: error.message, metadata: input });
}

export async function recordNodeLog(input: {
  runId: string;
  workflowId?: string;
  clientId?: string;
  nodeId: string;
  nodeType: string;
  status: string;
  attempt?: number;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  durationMs?: number;
}) {
  logStructured({ level: input.error ? "error" : "info", event: "node.execution", ...input, error: input.error ?? undefined });
  await supabaseAdmin.from("execution_node_logs").insert({
    run_id: input.runId,
    workflow_id: input.workflowId ?? null,
    client_id: input.clientId ?? null,
    node_id: input.nodeId,
    node_type: input.nodeType,
    status: input.status,
    attempt: input.attempt ?? 0,
    input: redact(input.input) ?? null,
    output: redact(input.output) ?? null,
    error: input.error ?? null,
    duration_ms: input.durationMs ?? null,
  });
}
