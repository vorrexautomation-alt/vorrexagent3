"use client";
import { useEffect, useRef, useState } from "react";
import { theme } from "./node-canvas/theme";

interface Message {
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
}

const STARTER_PROMPTS = [
  "Add a WhatsApp node after the AI Agent",
  "Why did my last run fail?",
  "Add error handling to this workflow",
  "Explain what this workflow does",
];

export default function AiSidebar({
  workflowId,
  token,
  onWorkflowUpdated,
  onClose,
}: {
  workflowId: string;
  token: string;
  onWorkflowUpdated: (workflow: Record<string, unknown>) => void;
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "I'm Vorrex Agents. Tell me what to build, add, or fix in this workflow — I can add/remove nodes, wire connections, and explain why a run failed.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(overrideText?: string) {
    const prompt = (overrideText ?? input).trim();
    if (!prompt || loading) return;
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/edit-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workflow_id: workflowId, prompt }),
      });
      const data = await res.json();

      if (!res.ok) {
        const text = data.error ? `Error: ${data.error}` : "Something went wrong.";
        setMessages((m) => [...m, { role: "assistant", text: data.detail ? `${text}\n${data.detail}` : text, isError: true }]);
        return;
      }

      if (data.clarification_needed) {
        setMessages((m) => [...m, { role: "assistant", text: data.clarification_needed }]);
        return;
      }

      onWorkflowUpdated(data.workflow);
      const summary = [
        data.explanation,
        data.suggestions?.length ? `\n\nNext ideas:\n${data.suggestions.map((s: string) => `• ${s}`).join("\n")}` : "",
      ].join("");
      setMessages((m) => [...m, { role: "assistant", text: summary || "Done." }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Couldn't reach Vorrex Agents. Check your connection and try again.", isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", borderLeft: `1px solid ${theme.border}`, background: theme.panelBg }}>
      <div
        style={{
          padding: "13px 14px",
          borderBottom: `1px solid ${theme.border}`,
          display: "flex",
          alignItems: "center",
          gap: 9,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${theme.aiAccent}, ${theme.accent})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          ✦
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: theme.text }}>Vorrex Agents</div>
          <div style={{ fontSize: 10.5, color: theme.textFaint }}>Builds, fixes, and explains this workflow</div>
        </div>
        {onClose && <button onClick={onClose} aria-label="Close Vorrex Agents" style={{ marginLeft: "auto", border: `1px solid ${theme.border}`, background: "transparent", color: theme.textMuted, borderRadius: 7, padding: "5px 8px", cursor: "pointer" }}>×</button>}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              background: m.role === "user" ? theme.accent : m.isError ? theme.dangerSoft : theme.cardBg,
              color: m.role === "user" ? "#0A0A12" : m.isError ? theme.danger : theme.text,
              border: m.role === "assistant" ? `1px solid ${m.isError ? theme.danger + "55" : theme.border}` : "none",
              padding: "9px 12px",
              borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
              maxWidth: "88%",
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {m.text}
          </div>
        ))}

        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: theme.cardBg,
              border: `1px solid ${theme.border}`,
              padding: "10px 13px",
              borderRadius: "12px 12px 12px 3px",
            }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: theme.aiAccent,
                  display: "inline-block",
                  animation: `vorrexPulse 1.1s ${i * 0.15}s infinite ease-in-out`,
                }}
              />
            ))}
          </div>
        )}

        {messages.length === 1 && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            {STARTER_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                style={{
                  textAlign: "left",
                  background: "transparent",
                  border: `1px dashed ${theme.border}`,
                  color: theme.textMuted,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${theme.border}`, display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="e.g. Add a WhatsApp node after the AI Agent"
          disabled={loading}
          style={{
            flex: 1,
            padding: "9px 11px",
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: theme.canvasBg,
            color: theme.text,
            fontSize: 13,
          }}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "none",
            background: theme.accent,
            color: "#0A0A12",
            fontWeight: 700,
            fontSize: 13,
            cursor: loading || !input.trim() ? "default" : "pointer",
            opacity: loading || !input.trim() ? 0.6 : 1,
          }}
        >
          Send
        </button>
      </div>
      <style>{`
        @keyframes vorrexPulse {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}
