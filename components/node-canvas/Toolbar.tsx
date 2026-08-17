"use client";
// components/node-canvas/Toolbar.tsx

import { UI_ICONS } from "./icons";
import { theme } from "./theme";

export type SaveStatus = "idle" | "saving" | "error";

interface ToolbarProps {
  onAddNode: () => void;
  onSave: () => void;
  isDirty: boolean;
  status: SaveStatus;
  lastSavedAt: number | null;
}

function formatRelativeTime(ts: number | null): string {
  if (!ts) return "";
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export default function Toolbar({ onAddNode, onSave, isDirty, status, lastSavedAt }: ToolbarProps) {
  const saveLabel = status === "saving" ? "Saving..." : status === "error" ? "Retry save" : isDirty ? "Save" : "Saved";

  const saveBg = status === "error" ? theme.danger : isDirty ? theme.accent : "transparent";
  const saveColor = status === "error" || isDirty ? "#161616" : theme.textMuted;
  const saveBorder = status === "error" ? theme.danger : isDirty ? theme.accent : theme.border;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        right: 12,
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        gap: 10,
        pointerEvents: "none",
      }}
    >
      <button
        onClick={onAddNode}
        style={{
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          background: theme.cardBg,
          color: theme.text,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        <UI_ICONS.plus size={14} /> Add node
      </button>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, pointerEvents: "auto" }}>
        {!isDirty && status === "idle" && lastSavedAt && (
          <span style={{ fontSize: 11, color: theme.textFaint }}>Saved {formatRelativeTime(lastSavedAt)}</span>
        )}
        <button
          onClick={onSave}
          disabled={status === "saving" || (!isDirty && status !== "error")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 8,
            border: `1px solid ${saveBorder}`,
            background: saveBg,
            color: saveColor,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: status === "saving" || (!isDirty && status !== "error") ? "default" : "pointer",
            opacity: status === "saving" ? 0.75 : 1,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            transition: "background 120ms ease, border-color 120ms ease",
          }}
        >
          {status === "error" ? <UI_ICONS.warning size={13} /> : <UI_ICONS.save size={13} />}
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
