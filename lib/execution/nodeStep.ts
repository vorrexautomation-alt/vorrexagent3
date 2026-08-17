// One node's worth of execution logic, shared between the synchronous
// "debug" path (runtime.ts) and the durable queue-backed engine
// (lib/queue/worker.ts) — factored out specifically so both paths agree
// on what retry, continue-on-fail, and emission-normalization mean.
// Nothing here is Postgres/Redis-aware; it's the same pure-ish
// (one real side effect: calling the executor) building block either
// caller can use.

import { getExecutor } from "./registry";
import { ExecutionContext, NodeData, NodeExecutorReturn, PortEmission, WorkflowNode } from "./types";

export interface NodeSettings {
  continueOnFail: boolean;
  retryOnFail: boolean;
  maxTries: number;
  waitBetweenTriesMs: number;
  executeOnce: boolean;
  alwaysOutputData: boolean;
}

// Reads the `__settings` bag every node has (set from ConfigPanel.tsx's
// "Error handling" tab). `|| 3` / `|| 5`-style fallbacks would treat an
// intentionally-configured 0 the same as "not set" — Number.isFinite is
// the correct check for "was this actually supplied."
export function readNodeSettings(node: WorkflowNode): NodeSettings {
  const raw = (node.config?.__settings as Record<string, unknown>) || {};
  const maxTriesRaw = Number(raw.maxTries);
  const waitRaw = Number(raw.waitBetweenTries);
  return {
    continueOnFail: Boolean(raw.continueOnFail),
    retryOnFail: Boolean(raw.retryOnFail),
    maxTries: Math.max(1, Number.isFinite(maxTriesRaw) && maxTriesRaw > 0 ? maxTriesRaw : 3),
    waitBetweenTriesMs: Math.max(0, Number.isFinite(waitRaw) ? waitRaw : 5) * 1000,
    executeOnce: Boolean(raw.executeOnce),
    alwaysOutputData: Boolean(raw.alwaysOutputData),
  };
}

export function normalizeReturn(ret: NodeExecutorReturn): PortEmission[] {
  if (ret && typeof ret === "object" && !Array.isArray(ret)) {
    const asRecord = ret as Record<string, unknown>;
    if (Array.isArray(asRecord.emissions)) return asRecord.emissions as PortEmission[];
    if (typeof asRecord.port === "string" && "data" in asRecord) {
      return [{ port: asRecord.port, data: asRecord.data as NodeData }];
    }
  }
  return [{ port: "out", data: ret as NodeData }];
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export type NodeStepOutcome =
  | { status: "success"; emissions: PortEmission[]; attempts: number }
  | { status: "error"; error: string; attempts: number };

// Runs one node with its own configured retry policy. Never throws —
// always resolves to a terminal success or error outcome, so neither
// caller needs its own try/catch per node.
export async function executeNodeWithRetry(
  node: WorkflowNode,
  input: NodeData,
  ctx: ExecutionContext
): Promise<NodeStepOutcome> {
  const executor = getExecutor(node.type);
  if (!executor) {
    return { status: "error", error: `No executor registered for node type "${node.type}".`, attempts: 0 };
  }

  const settings = readNodeSettings(node);
  const maxAttempts = settings.retryOnFail ? settings.maxTries : 1;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = await executor(node.config || {}, input, ctx);
      const emissions = normalizeReturn(raw);
      return { status: "success", emissions: emissions.length ? emissions : settings.alwaysOutputData ? [{ port: "out", data: input }] : [], attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) await sleep(settings.waitBetweenTriesMs);
    }
  }

  return { status: "error", error: lastError, attempts: maxAttempts };
}
