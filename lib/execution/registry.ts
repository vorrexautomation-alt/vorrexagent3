// Node executor registry.
//
// Each node `type` string — the SAME bare strings nodeDefinitions.ts and
// the AI editor use (e.g. "httpRequest", "slack", "if"), not n8n's
// "n8n-nodes-base.*" names — maps to a single async function that knows
// how to run that node. The runtime (runtime.ts) never has type-specific
// logic — it just looks up the executor for whatever `type` is on the
// node and calls it. Adding a new node type to the platform means: one
// entry in nodeDefinitions.ts (for the UI) + one registerExecutor call
// here (for execution).

import { NodeExecutor } from "./types";

const registry = new Map<string, NodeExecutor>();

export function registerExecutor(type: string, fn: NodeExecutor) {
  registry.set(type, fn);
}

export function getExecutor(type: string): NodeExecutor | undefined {
  return registry.get(type);
}

// Trigger nodes don't run mid-graph — the runtime starts a run AT one of
// these and seeds it with the run's trigger data (manual-run payload or
// incoming webhook/form/chat body). Matches nodeDefinitions.ts's
// category: "trigger" entries.
const TRIGGER_TYPES = new Set([
  "webhook", "manualTrigger", "schedule", "chatTrigger", "formTrigger",
  "activationTrigger", "cron", "emailTrigger", "errorTrigger", "executeWorkflowTrigger",
  "localFileTrigger", "interval", "mcpServerTrigger", "microsoftAgent365Trigger", "n8nFormTrigger",
  "n8nTrigger", "rssFeedTrigger", "simulateTrigger", "sseTrigger", "start", "workflowTrigger",
]);

export function isTriggerType(type: string): boolean {
  return TRIGGER_TYPES.has(type);
}

// NOTE: executors are NOT imported from here. `./executors` imports
// `registerExecutor` from this file, so importing `./executors` back from
// here would make this a circular module (registry <-> executors). That's
// harmless in dev but under Next's production webpack bundling it produces
// a real bug: the two modules get wrapped such that one side is read
// before its `const`/`let` binding is initialized, throwing
// "ReferenceError: Cannot access '<var>' before initialization" at request
// time (this broke /api/workflows/[id]/run and /api/webhooks/[workflowId]
// specifically, since those are the two routes that import this registry).
// Instead, anything that needs executors registered imports "./executors"
// itself for its side effect — see runtime.ts.
