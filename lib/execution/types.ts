// Shared types for the execution engine.
//
// This mirrors the ACTUAL shape the canvas persists (see
// components/node-canvas/serialize.ts -> buildGraph / WorkflowGraph):
// nodes keyed by `id` with a `config` bag, and connections as a flat map
// of edgeId -> {source, sourceHandle, target, targetHandle}. Earlier this
// file mirrored n8n's shape instead (name-keyed nodes with `parameters`,
// connections keyed by source *name* with `.main` arrays) — that shape is
// never actually produced anywhere in this app (not by the canvas, not by
// the AI editor), so runWorkflow() was silently unable to read any
// workflow ever saved. See runtime.ts for the walk logic that depends on
// this.

export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  source: string;
  sourceHandle?: string; // output port id, e.g. "out", "true", "false", "0", "loop", "done". Defaults to "out".
  target: string;
  targetHandle?: string;
}

export interface WorkflowConnections {
  [edgeId: string]: WorkflowEdge;
}

export interface WorkflowJson {
  nodes?: WorkflowNode[];
  connections?: WorkflowConnections;
  settings?: Record<string, unknown>;
}

// Data flowing between nodes. Kept intentionally loose — a plain JSON
// value is enough for every executor below.
export type NodeData = unknown;

export interface ExecutionContext {
  workflowId: string;
  clientId: string;
  // Arbitrary data the trigger that started this run supplied
  // (webhook body, manual-run payload, etc).
  triggerData: NodeData;
}

// A single emission out of one of a node's output ports.
export interface PortEmission {
  port: string; // matches an edge's `sourceHandle`
  data: NodeData;
}

// What an executor can return:
//   - a plain value            -> treated as one emission on the "out" port
//   - { port, data }           -> one emission on a specific port (IF, Switch, Loop...)
//   - { emissions: [...] }     -> multiple emissions at once (Loop fires "loop"
//                                 once per batch, then "done" once at the end)
export type NodeExecutorReturn =
  | NodeData
  | { port: string; data: NodeData }
  | { emissions: PortEmission[] };

export type NodeExecutor = (
  parameters: Record<string, unknown>,
  input: NodeData,
  ctx: ExecutionContext
) => Promise<NodeExecutorReturn>;

export interface NodeRunResult {
  node: string;
  type: string;
  status: "success" | "error" | "skipped";
  output?: NodeData;
  error?: string;
  started_at: string;
  finished_at: string;
}

export interface ExecutionResult {
  status: "success" | "error";
  node_results: NodeRunResult[];
  error?: string;
}
