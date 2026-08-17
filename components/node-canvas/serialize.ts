// components/node-canvas/serialize.ts
//
// Conversion between React Flow's live Node<FlowNodeData>/Edge state and
// the persisted WorkflowGraph shape:
//   { nodes: [{id, type, position: {x,y}, config: {...}}], connections: {...} }

import type { Edge, Node } from "reactflow";
import type { FlowNodeData, WorkflowGraph } from "./types";
import { NODE_DEFINITIONS_BY_TYPE } from "./nodeDefinitions";
import { makeId } from "./utils";

export function buildGraph(nodes: Node<FlowNodeData>[], edges: Edge[]): WorkflowGraph {
  const connections: WorkflowGraph["connections"] = {};
  for (const e of edges) {
    connections[e.id] = {
      source: e.source,
      sourceHandle: e.sourceHandle || "out",
      target: e.target,
      targetHandle: e.targetHandle || "in",
    };
  }
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType,
      name: n.data.name,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      config: n.data.config,
    })),
    connections,
  };
}

/** Hydrates React Flow nodes/edges from a previously-saved graph.
 * `onDelete` is re-attached to every node's data here (it's not persisted —
 * see FlowNodeData) so the toolbar delete button works after a reload. */
export function hydrateGraph(
  graph: Partial<WorkflowGraph> | null | undefined,
  onDelete: (nodeId: string) => void
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const rawNodes = graph?.nodes ?? [];
  const rawConnections = graph?.connections ?? {};

  const nodes: Node<FlowNodeData>[] = rawNodes.map((n) => {
    const def = NODE_DEFINITIONS_BY_TYPE[n.type];
    return {
      id: n.id || makeId("node"),
      type: "flowNode",
      position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
      data: {
        nodeType: n.type,
        name: n.name || def?.label || n.type,
        config: { ...(def?.defaultConfig || {}), ...(n.config || {}) },
        onDelete,
      },
    };
  });

  const edges: Edge[] = Object.entries(rawConnections).map(([id, c]) => ({
    id,
    source: c.source,
    sourceHandle: c.sourceHandle || "out",
    target: c.target,
    targetHandle: c.targetHandle || "in",
    type: "default", // bezier — curves live while either endpoint is dragged
  }));

  return { nodes, edges };
}
