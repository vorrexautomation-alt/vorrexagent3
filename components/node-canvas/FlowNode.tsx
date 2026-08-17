"use client";
// components/node-canvas/FlowNode.tsx
//
// The single custom node type registered with React Flow (see NodeCanvas's
// `nodeTypes = { flowNode: FlowNode }`). React Flow owns dragging,
// selection, and the connection-drawing gesture; this component is purely
// presentational plus a delete button and <Handle> placement.

import { memo } from "react";
import Image from "next/image";
import { Handle, NodeToolbar, Position, type NodeProps } from "reactflow";
import type { FlowNodeData } from "./types";
import { NODE_DEFINITIONS_BY_TYPE } from "./nodeDefinitions";
import { NodeIcon, UI_ICONS } from "./icons";
import { NODE_WIDTH, getNodeLayout } from "./utils";
import { theme, categoryAccent } from "./theme";

function FlowNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const def = NODE_DEFINITIONS_BY_TYPE[data.nodeType];

  if (!def) {
    return (
      <div
        style={{
          width: NODE_WIDTH,
          padding: 12,
          borderRadius: 10,
          background: theme.cardBg,
          border: `1.5px solid ${theme.danger}`,
          color: theme.danger,
          fontSize: 12,
        }}
      >
        Unknown node type &ldquo;{data.nodeType}&rdquo;
      </div>
    );
  }

  const layout = getNodeLayout(def);
  const accent = categoryAccent[def.category];
  // Surfaces the "you haven't connected an account yet" state right on the
  // canvas, not just inside the config panel — otherwise the only way to
  // discover an unconfigured integration node is to click into every node
  // one by one, or wait for the run to fail with a generic error.
  const credentialValue = data.config?.__credential;
  const needsCredential =
    def.requiresCredentials && (credentialValue === undefined || credentialValue === "none");
  const status = data.status || "idle";
  const statusMeta = {
    idle: { label: "Idle", color: theme.textFaint },
    running: { label: "Running", color: theme.warning },
    success: { label: "Success", color: theme.success },
    error: { label: "Error", color: theme.danger },
    waiting: { label: "Waiting", color: theme.accent },
  }[status];

  return (
    <div
      style={{
        width: NODE_WIDTH,
        height: layout.height,
        background: theme.cardBg,
        border: `1.5px solid ${status !== "idle" ? statusMeta.color : selected ? accent : theme.border}`,
        borderRadius: 10,
        boxShadow: selected
          ? `0 0 0 3px ${accent}33, 0 4px 16px rgba(0,0,0,0.4)`
          : "0 2px 8px rgba(0,0,0,0.35)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Category accent spine */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />

      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => data.onDelete?.(id)}
          title="Delete node"
          style={{
            border: `1px solid ${theme.danger}`,
            background: theme.dangerSoft,
            color: theme.danger,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 9px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <UI_ICONS.trash size={12} /> Delete
        </button>
      </NodeToolbar>

      {/* Header */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 10px",
          marginTop: 3,
          background: `linear-gradient(180deg, ${accent}14, transparent)`,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: def.iconKind === "brand" ? "transparent" : `${accent}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: accent,
          }}
        >
          {def.image ? <Image src={def.image} alt="" width={26} height={26} unoptimized style={{ borderRadius: 7, display: "block" }} /> : <NodeIcon iconKey={def.icon} kind={def.iconKind} size={15} />}
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12.5,
            fontWeight: 600,
            color: theme.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={data.name}
        >
          {data.name}
        </div>
        {status !== "idle" && (
          <div
            title={`Node status: ${statusMeta.label}`}
            aria-label={`Node status: ${statusMeta.label}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusMeta.color,
              boxShadow: status === "running" ? `0 0 0 4px ${statusMeta.color}33` : undefined,
              flexShrink: 0,
            }}
          />
        )}
        {needsCredential && (
          <div
            title="No account connected yet — open this node and add a credential."
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: theme.dangerSoft,
              color: theme.danger,
              flexShrink: 0,
            }}
          >
            <UI_ICONS.warning size={11} />
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "8px 10px 6px", fontSize: 11, color: theme.textMuted, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span>{def.label}</span>
        {status !== "idle" && <span style={{ fontSize: 9.5, fontWeight: 700, color: statusMeta.color, textTransform: "uppercase", letterSpacing: 0.3 }}>{statusMeta.label}</span>}
        {needsCredential && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: theme.danger, textTransform: "uppercase", letterSpacing: 0.3 }}>
            Not connected
          </span>
        )}
      </div>

      {/* Input handles (left edge) */}
      {layout.inputs.map((port) => (
        <Handle
          key={`in-${port.id}`}
          id={port.id}
          type="target"
          position={Position.Left}
          title={port.label || "Input"}
          style={{
            top: port.y,
            width: 12,
            height: 12,
            background: theme.panelBg,
            border: `2px solid ${theme.borderStrong}`,
          }}
        />
      ))}
      {layout.inputs.length > 1 &&
        layout.inputs.map((port) =>
          port.label ? (
            <div
              key={`in-label-${port.id}`}
              style={{
                position: "absolute",
                left: 10,
                top: port.y - 8,
                fontSize: 9.5,
                color: theme.textFaint,
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {port.label}
            </div>
          ) : null
        )}

      {/* Output handles (right edge) */}
      {layout.outputs.map((port) => (
        <Handle
          key={`out-${port.id}`}
          id={port.id}
          type="source"
          position={Position.Right}
          title={port.label || "Output"}
          style={{
            top: port.y,
            width: 12,
            height: 12,
            background: theme.panelBg,
            border: `2px solid ${theme.borderStrong}`,
          }}
        />
      ))}
      {layout.outputs.length > 1 &&
        layout.outputs.map((port) =>
          port.label ? (
            <div
              key={`out-label-${port.id}`}
              style={{
                position: "absolute",
                right: 10,
                top: port.y - 8,
                fontSize: 9.5,
                color: theme.textFaint,
                whiteSpace: "nowrap",
                textAlign: "right",
                pointerEvents: "none",
              }}
            >
              {port.label}
            </div>
          ) : null
        )}
    </div>
  );
}

export default memo(FlowNode);
