"use client";
// components/node-canvas/NodeCanvas.tsx
//
// Visual workflow builder canvas. Dragging, panning, zooming, and
// connection-drawing are all handled by React Flow (reactflow@11) — this
// file owns the domain layer on top of it: the node palette, the
// per-node config side panel, and save/dirty tracking against the
// workflows API. The custom "flowNode" node type (FlowNode.tsx) renders
// node cards with our icon rules; edges use React Flow's default bezier
// type so connections curve live while either endpoint is dragged.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Node,
  type NodeMouseHandler,
  type OnConnect,
} from "reactflow";
import "reactflow/dist/style.css";

import type { FlowNodeData, WorkflowGraph } from "./types";
import { NODE_DEFINITIONS_BY_TYPE } from "./nodeDefinitions";
import { buildGraph, hydrateGraph } from "./serialize";
import { makeId } from "./utils";
import { theme } from "./theme";
import FlowNode from "./FlowNode";
import NodePalette from "./NodePalette";
import ConfigPanel from "./ConfigPanel";
import Toolbar, { type SaveStatus } from "./Toolbar";

const nodeTypes = { flowNode: FlowNode };

// React Flow ships light-mode chrome by default (controls, selection box,
// connection line). This retheme keeps it consistent with the app's dark
// palette without forking the library's CSS.
const darkThemeOverrides = `
  .react-flow__controls {
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    border-radius: 8px;
    overflow: hidden;
  }
  .react-flow__controls-button {
    background: ${theme.cardBg};
    border-bottom: 1px solid ${theme.border};
    fill: ${theme.text};
  }
  .react-flow__controls-button:hover { background: ${theme.cardBgHover}; }
  .react-flow__controls-button svg { fill: ${theme.text}; }
  .react-flow__selection {
    background: ${theme.accentSoft};
    border: 1px solid ${theme.accent};
  }
  .react-flow__connectionline path,
  .react-flow__connection-path {
    stroke: ${theme.accent} !important;
    stroke-width: 2px;
    stroke-dasharray: 6 4;
  }
  .react-flow__edge.selected .react-flow__edge-path,
  .react-flow__edge:hover .react-flow__edge-path {
    stroke: ${theme.accent} !important;
    stroke-width: 2.25px !important;
  }
  .react-flow__handle {
    border-radius: 50%;
  }
  .react-flow__handle-connecting {
    background: ${theme.accent} !important;
    border-color: ${theme.accent} !important;
  }
  .react-flow__handle-valid {
    background: ${theme.accent} !important;
    border-color: ${theme.accent} !important;
  }
  .react-flow__node.selectable:focus,
  .react-flow__node.selectable:focus-visible {
    outline: none;
  }
`;

const defaultEdgeOptions = {
  type: "default", // bezier
  markerEnd: { type: MarkerType.ArrowClosed, color: theme.borderStrong, width: 16, height: 16 },
  style: { stroke: theme.borderStrong, strokeWidth: 1.75 },
};

export interface NodeCanvasSaveResult {
  ok: boolean;
  error?: string;
}

export interface NodeCanvasProps {
  /** Raw workflow_json as loaded from the server, in the
   *  { nodes: [{id,type,position,config}], connections: {...} } shape.
   *  Only read once on mount, by design — to force a full reload (e.g. an
   *  external system replaced the workflow, or the user switched
   *  workflows), remount with a new `key` rather than relying on a prop
   *  change, so a live drag never gets clobbered mid-edit. */
  initialWorkflowJson?: Partial<WorkflowGraph> | Record<string, unknown> | null;
  /** Called when the user clicks Save (or presses Cmd/Ctrl+S). Return
   *  { ok: true } on success or { ok: false, error } on failure — the
   *  canvas keeps all local state either way, it only clears the dirty
   *  indicator on success. If omitted, the canvas falls back to PATCHing
   *  `${apiBasePath}/${workflowId}` directly. */
  onSave?: (graph: WorkflowGraph) => Promise<NodeCanvasSaveResult>;
  /** Used only for the built-in fetch fallback when `onSave` isn't provided. */
  workflowId?: string;
  authToken?: string;
  /** Passed straight through to ConfigPanel's credential picker — see its
   *  own doc comment for why this is needed separately from authToken. */
  clientId?: string;
  apiBasePath?: string; // default "/api/workflows"
  /** Fires after every successful save with the graph that was saved. */
  onSaved?: (graph: WorkflowGraph) => void;
  /** Fires on every local change (drag, add, delete, config edit) — handy
   *  for a parent that wants to mirror state without owning persistence. */
  onChange?: (graph: WorkflowGraph) => void;
  /** Transient durable-run statuses keyed by persisted node id. */
  executionStatuses?: Record<string, FlowNodeData["status"]>;
}

function NodeCanvasInner({
  initialWorkflowJson,
  onSave,
  workflowId,
  authToken,
  clientId,
  apiBasePath = "/api/workflows",
  onSaved,
  onChange,
  executionStatuses,
}: NodeCanvasProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const deleteNodeRef = useRef<(nodeId: string) => void>(() => {});
  const handleDeleteNode = useCallback((nodeId: string) => deleteNodeRef.current(nodeId), []);

  const initial = useMemo(
    () => hydrateGraph(initialWorkflowJson as Partial<WorkflowGraph>, handleDeleteNode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    if (!executionStatuses) return;
    setNodes((current) => current.map((node) => ({
      ...node,
      data: { ...node.data, status: executionStatuses[node.id] || "idle" },
    })));
  }, [executionStatuses, setNodes]);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>(() =>
    JSON.stringify(buildGraph(initial.nodes, initial.edges))
  );

  const { screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const graph = useMemo(() => buildGraph(nodes, edges), [nodes, edges]);
  const graphString = JSON.stringify(graph);
  const isDirty = graphString !== lastSavedSnapshot;

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedDef = selectedNode ? NODE_DEFINITIONS_BY_TYPE[selectedNode.data.nodeType] : null;

  // ------------------------------------------------------------- CRUD ops

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
    },
    [setNodes, setEdges]
  );
  deleteNodeRef.current = deleteNode;

  const addNode = useCallback(
    (defType: string) => {
      const def = NODE_DEFINITIONS_BY_TYPE[defType];
      if (!def) return;
      const bounds = wrapperRef.current?.getBoundingClientRect();
      const screenCenter = bounds
        ? { x: bounds.left + bounds.width / 2 - 95, y: bounds.top + bounds.height / 2 - 40 }
        : { x: 300, y: 200 };
      const position = screenToFlowPosition(screenCenter);
      const id = makeId("node");
      const newNode: Node<FlowNodeData> = {
        id,
        type: "flowNode",
        position,
        data: { nodeType: def.type, name: def.label, config: { ...def.defaultConfig }, onDelete: handleDeleteNode },
      };
      setNodes((prev) => [...prev, newNode]);
      setSelectedNodeId(id);
    },
    [screenToFlowPosition, setNodes, handleDeleteNode]
  );

  const renameNode = useCallback(
    (nodeId: string, name: string) => {
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, name } } : n)));
    },
    [setNodes]
  );

  const updateNodeConfig = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, config } } : n)));
    },
    [setNodes]
  );

  // ------------------------------------------------------ connection draw

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      // Guard against a duplicate edge between the same two handles.
      setEdges((prev) => {
        const exists = prev.some(
          (e) =>
            e.source === connection.source &&
            e.sourceHandle === connection.sourceHandle &&
            e.target === connection.target &&
            e.targetHandle === connection.targetHandle
        );
        if (exists) return prev;
        return addEdge({ ...connection, id: makeId("conn"), type: "default" }, prev);
      });
    },
    [setEdges]
  );

  const isValidConnection = useCallback(
    (connection: Connection) => connection.source !== connection.target,
    []
  );

  // ---------------------------------------------------------- selection

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // React Flow's built-in deleteKeyCode removes selected nodes from `nodes`
  // state on its own, but it doesn't know to also drop edges attached to
  // them — this keeps connections in sync whenever nodes disappear,
  // whether that happened via the keyboard or the toolbar delete button.
  const onNodesDelete = useCallback(
    (deleted: Node<FlowNodeData>[]) => {
      const deletedIds = new Set(deleted.map((n) => n.id));
      setEdges((prev) => prev.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)));
      setSelectedNodeId((prev) => (prev && deletedIds.has(prev) ? null : prev));
    },
    [setEdges]
  );

  // ---------------------------------------------------------------- save

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    setSaveError(null);
    const currentGraph = buildGraph(nodes, edges);
    try {
      const result = onSave
        ? await onSave(currentGraph)
        : await defaultSave(currentGraph, { workflowId, authToken, apiBasePath });

      if (result.ok) {
        setLastSavedSnapshot(JSON.stringify(currentGraph));
        setLastSavedAt(Date.now());
        setSaveStatus("idle");
        onSaved?.(currentGraph);
      } else {
        setSaveStatus("error");
        setSaveError(result.error || "Save failed. Your changes are still here — try again.");
      }
    } catch {
      setSaveStatus("error");
      setSaveError("Network error. Your changes are still here — try again.");
    }
  }, [nodes, edges, onSave, workflowId, authToken, apiBasePath, onSaved]);

  // Fire onChange for parents that want to mirror state (e.g. an AI sidebar
  // reading current graph) without owning persistence themselves.
  const lastEmitted = useRef<string>("");
  if (onChange && graphString !== lastEmitted.current) {
    lastEmitted.current = graphString;
    // Deferred so this never runs inside React Flow's own render/commit cycle.
    queueMicrotask(() => onChange(graph));
  }

  // ---------------------------------------------------------------- render

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", overflow: "hidden" }}>
      <div ref={wrapperRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <Toolbar
          onAddNode={() => setPaletteOpen(true)}
          onSave={handleSave}
          isDirty={isDirty}
          status={saveStatus}
          lastSavedAt={lastSavedAt}
        />

        {saveStatus === "error" && saveError && (
          <div
            style={{
              position: "absolute",
              top: 56,
              right: 12,
              zIndex: 6,
              background: theme.dangerSoft,
              border: `1px solid ${theme.danger}`,
              color: theme.danger,
              fontSize: 12,
              padding: "8px 12px",
              borderRadius: 8,
              maxWidth: 320,
            }}
          >
            {saveError}
          </div>
        )}

        <style>{darkThemeOverrides}</style>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodesDelete={onNodesDelete}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView={nodes.length > 0}
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          style={{ background: theme.canvasBg }}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} color={theme.dotColor} gap={22} size={1.5} />
          <Controls showInteractive={false} />
        </ReactFlow>

        {nodes.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 10,
              color: theme.textFaint,
              pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: 14 }}>This workflow is empty</div>
            <div style={{ fontSize: 12 }}>Click &ldquo;Add node&rdquo; to place your first trigger</div>
          </div>
        )}

        <NodePalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAdd={(def) => addNode(def.type)} />
      </div>

      {selectedNode && selectedDef && (
        <ConfigPanel
          key={selectedNode.id}
          node={{ id: selectedNode.id, name: selectedNode.data.name, config: selectedNode.data.config }}
          def={selectedDef}
          onRename={renameNode}
          onConfigChange={updateNodeConfig}
          onDelete={deleteNode}
          onClose={() => setSelectedNodeId(null)}
          authToken={authToken}
          clientId={clientId}
        />
      )}
    </div>
  );
}

export default function NodeCanvas(props: NodeCanvasProps) {
  return (
    <ReactFlowProvider>
      <NodeCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

// ------------------------------------------------------------------------
// Built-in fallback save handler. Only used when the caller doesn't pass
// its own `onSave`. Talks to the same endpoint the rest of this app uses:
// PATCH /api/workflows/:id  { workflow_json }  ->  { ok: true }
// (see app/api/workflows/[id]/route.ts)
// ------------------------------------------------------------------------
async function defaultSave(
  graph: WorkflowGraph,
  opts: { workflowId?: string; authToken?: string; apiBasePath: string }
): Promise<NodeCanvasSaveResult> {
  if (!opts.workflowId) {
    return { ok: false, error: "No workflowId provided and no onSave handler was given." };
  }
  const res = await fetch(`${opts.apiBasePath}/${opts.workflowId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(opts.authToken ? { Authorization: `Bearer ${opts.authToken}` } : {}),
    },
    body: JSON.stringify({ workflow_json: graph }),
  });
  let data: { error?: string } = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON error body — fall through with a generic message
  }
  if (!res.ok) {
    return { ok: false, error: data.error || `Save failed (${res.status}).` };
  }
  return { ok: true };
}
