"use client";
// components/node-canvas/NodePalette.tsx
//
// The "Add node" panel. Two panes, like a real app's node browser:
//  - left rail: Triggers / Core & Logic / AI & LLM / Integrations (broken
//    down by domain — Communication, Productivity & Docs, etc.)
//  - right list: every node in the selected rail entry, or — while
//    searching — every matching node across all of them at once.
// This replaces the old single flat list so a platform with 25+ node types
// stays scannable instead of turning into one long scroll.

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  NODE_DEFINITIONS,
  CATEGORY_LABELS,
  INTEGRATION_SUBCATEGORY_ORDER,
} from "./nodeDefinitions";
import type { NodeTypeDefinition } from "./types";
import { NodeIcon, UI_ICONS } from "./icons";
import { theme, categoryAccent } from "./theme";

interface NodePaletteProps {
  open: boolean;
  onClose: () => void;
  onAdd: (def: NodeTypeDefinition) => void;
}

type RailKey = "all" | "trigger" | "core" | "ai" | `integration:${string}`;

interface RailItem {
  key: RailKey;
  label: string;
  accent: string;
  count: number;
}

export default function NodePalette({ open, onClose, onAdd }: NodePaletteProps) {
  const [query, setQuery] = useState("");
  const [activeRail, setActiveRail] = useState<RailKey>("all");

  const rail = useMemo<RailItem[]>(() => {
    const countFor = (pred: (d: NodeTypeDefinition) => boolean) =>
      NODE_DEFINITIONS.filter(pred).length;

    const items: RailItem[] = [
      { key: "all", label: "All nodes", accent: theme.textMuted, count: NODE_DEFINITIONS.length },
      { key: "trigger", label: CATEGORY_LABELS.trigger, accent: categoryAccent.trigger, count: countFor((d) => d.category === "trigger") },
      { key: "core", label: CATEGORY_LABELS.core, accent: categoryAccent.core, count: countFor((d) => d.category === "core") },
      { key: "ai", label: CATEGORY_LABELS.ai, accent: categoryAccent.ai, count: countFor((d) => d.category === "ai") },
    ];

    const subcats = new Set(
      NODE_DEFINITIONS.filter((d) => d.category === "integration").map((d) => d.subcategory || "Other")
    );
    const ordered = [
      ...INTEGRATION_SUBCATEGORY_ORDER.filter((s) => subcats.has(s)),
      ...Array.from(subcats).filter((s) => !INTEGRATION_SUBCATEGORY_ORDER.includes(s)),
    ];
    for (const sub of ordered) {
      items.push({
        key: `integration:${sub}`,
        label: sub,
        accent: categoryAccent.integration,
        count: countFor((d) => d.category === "integration" && (d.subcategory || "Other") === sub),
      });
    }
    return items;
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (q) {
      // Searching bypasses the rail entirely — match across every node so
      // the person doesn't have to know which category something lives in.
      return NODE_DEFINITIONS.filter(
        (d) => d.label.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
      );
    }

    if (activeRail === "all") return NODE_DEFINITIONS;
    if (activeRail.startsWith("integration:")) {
      const sub = activeRail.slice("integration:".length);
      return NODE_DEFINITIONS.filter((d) => d.category === "integration" && (d.subcategory || "Other") === sub);
    }
    return NODE_DEFINITIONS.filter((d) => d.category === activeRail);
  }, [query, activeRail]);

  const activeLabel = query.trim()
    ? `Search results for "${query.trim()}"`
    : rail.find((r) => r.key === activeRail)?.label || "All nodes";

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 20 }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(680px, 92%)",
          background: theme.panelBg,
          borderRight: `1px solid ${theme.border}`,
          zIndex: 21,
          display: "flex",
          flexDirection: "column",
          boxShadow: "8px 0 24px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header + search */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <strong style={{ fontSize: 14.5, color: theme.text }}>Add node</strong>
          <div style={{ fontSize: 11.5, color: theme.textFaint }}>{NODE_DEFINITIONS.length} available</div>
          <button
            onClick={onClose}
            style={{ marginLeft: "auto", background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer", display: "flex" }}
          >
            <UI_ICONS.close size={16} />
          </button>
        </div>
        <div style={{ padding: "10px 18px", borderBottom: `1px solid ${theme.border}` }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: theme.canvasBg,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            <UI_ICONS.search size={14} color={theme.textFaint} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search nodes by name or what they do..."
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                color: theme.text,
                fontSize: 13,
                flex: 1,
              }}
            />
          </div>
        </div>

        {/* Two-pane body: category rail + node list */}
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <div
            style={{
              width: 208,
              flexShrink: 0,
              borderRight: `1px solid ${theme.border}`,
              overflowY: "auto",
              padding: "10px 8px",
              opacity: query.trim() ? 0.5 : 1,
              pointerEvents: query.trim() ? "none" : "auto",
            }}
          >
            {rail.map((item) => {
              const active = item.key === activeRail;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveRail(item.key)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "8px 9px",
                    marginBottom: 2,
                    border: "none",
                    borderRadius: 7,
                    background: active ? theme.cardBgHover : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: item.accent,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12.5,
                      fontWeight: active ? 700 : 500,
                      color: active ? theme.text : theme.textMuted,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.label}
                  </span>
                  <span style={{ fontSize: 10.5, color: theme.textFaint, flexShrink: 0 }}>{item.count}</span>
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "12px 14px 20px" }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: theme.textFaint,
                padding: "2px 4px 10px",
              }}
            >
              {activeLabel}
            </div>
            {results.map((def) => (
              <button
                key={def.type}
                onClick={() => {
                  onAdd(def);
                  onClose();
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "9px 8px",
                  border: "none",
                  background: "transparent",
                  color: theme.text,
                  cursor: "pointer",
                  borderRadius: 8,
                  textAlign: "left",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = theme.cardBgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: def.iconKind === "brand" ? theme.cardBg : `${categoryAccent[def.category]}22`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: categoryAccent[def.category],
                  }}
                >
                  {def.image ? <Image src={def.image} alt="" width={32} height={32} unoptimized style={{ borderRadius: 8, display: "block" }} /> : <NodeIcon iconKey={def.icon} kind={def.iconKind} size={17} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{def.label}</div>
                    {def.requiresCredentials && (
                      <span title="Requires a connected account">
                        <UI_ICONS.key size={11} color={theme.textFaint} />
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: theme.textMuted,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {def.description}
                  </div>
                </div>
                <UI_ICONS.chevronRight size={14} color={theme.textFaint} />
              </button>
            ))}
            {results.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: theme.textFaint, fontSize: 12.5 }}>
                No nodes match &ldquo;{query}&rdquo;
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
