// Graph indexing for the execution engine (Phase 3).
//
// Pure, side-effect-free, zero external dependencies — deliberately kept
// that way so it's usable both by the in-process synchronous "debug" run
// path (runtime.ts) and by the durable BullMQ-based engine (lib/queue/),
// and so it's trivially unit-testable without Redis, Postgres, or any
// other infra (see __tests__/planner.test.ts).
//
// Note on scope: this indexes the graph's edges, not its node
// definitions. It deliberately has no idea what output ports a node
// TYPE declares (that's components/node-canvas/nodeDefinitions.ts, a
// UI-layer concern) — it only knows what's actually wired in THIS
// workflow's `connections` map. See joinResolver.ts for why that
// distinction is exactly what makes join/skip propagation work without
// lib/execution needing to import anything from components/.

import { WorkflowEdge, WorkflowJson, WorkflowNode } from "./types";
import { isTriggerType } from "./registry";

export interface PlannedEdge extends WorkflowEdge {
  id: string;
}

export interface ExecutionPlan {
  nodeIds: string[];
  edgesBySource: Map<string, PlannedEdge[]>;
  edgesByTarget: Map<string, PlannedEdge[]>;
  // For each source node, the set of sourceHandle values ("out", "true",
  // "false", "0", "loop", "done", ...) that have at least one outgoing
  // edge wired from them in this workflow. This is the "universe" of
  // ports a completed node's emissions get compared against to decide
  // which of its OTHER wired ports should propagate a skip signal
  // downstream (see joinResolver.ts).
  wiredOutputPorts: Map<string, Set<string>>;
}

export function buildExecutionPlan(workflow: WorkflowJson): ExecutionPlan {
  const nodeIds = (workflow.nodes || []).map((n) => n.id);
  const edgesBySource = new Map<string, PlannedEdge[]>();
  const edgesByTarget = new Map<string, PlannedEdge[]>();
  const wiredOutputPorts = new Map<string, Set<string>>();

  for (const [id, edge] of Object.entries(workflow.connections || {})) {
    const planned: PlannedEdge = { id, ...edge };
    const port = edge.sourceHandle || "out";

    if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, []);
    edgesBySource.get(edge.source)!.push(planned);

    if (!edgesByTarget.has(edge.target)) edgesByTarget.set(edge.target, []);
    edgesByTarget.get(edge.target)!.push(planned);

    if (!wiredOutputPorts.has(edge.source)) wiredOutputPorts.set(edge.source, new Set());
    wiredOutputPorts.get(edge.source)!.add(port);
  }

  return { nodeIds, edgesBySource, edgesByTarget, wiredOutputPorts };
}

// A node has "join" semantics (must wait for every incoming edge to
// resolve — fire or skip — before it can run, and receives the
// collected array of whatever fired) purely by virtue of having more
// than one incoming edge in THIS workflow. No node-type special-casing:
// a "merge" node with only one incoming edge behaves like any other
// single-input node, and any node type that happens to have two
// incoming edges (however unusual) gets real join semantics for free.
export function isJoinNode(plan: ExecutionPlan, nodeId: string): boolean {
  return (plan.edgesByTarget.get(nodeId)?.length ?? 0) > 1;
}

// Shared between the debug runtime and the durable queue worker so
// "where does this workflow start" is defined exactly once. Explicit
// trigger-type nodes win if any exist; otherwise falls back to any node
// with no incoming edge, so a bare "HTTP Request -> Set" chain built by
// hand without an explicit trigger still has somewhere to start.
export function findTriggerNodes(workflow: WorkflowJson): WorkflowNode[] {
  const nodes = workflow.nodes || [];
  const explicit = nodes.filter((n) => isTriggerType(n.type));
  if (explicit.length > 0) return explicit;

  const targets = new Set<string>();
  Object.values(workflow.connections || {}).forEach((edge) => targets.add(edge.target));
  return nodes.filter((n) => !targets.has(n.id));
}
