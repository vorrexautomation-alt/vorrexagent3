"use client";
// app/page.tsx — Vorrex's public landing page.
//
// Signature element: a live miniature of the actual node canvas (real
// NodeIcon/theme tokens from components/node-canvas, not a stock
// illustration) walking through the exact "connect an account" flow this
// build just fixed — Trigger -> AI Agent -> WhatsApp, the WhatsApp node
// flipping from "Not connected" to a green check as the wire animates in.
// It's demonstrating the product with the product, not a generic hero
// graphic.

import { useEffect, useState } from "react";
import { NodeIcon } from "@/components/node-canvas/icons";
import { theme } from "@/components/node-canvas/theme";

const INTEGRATIONS: Array<{ key: string; kind: "brand" | "outline"; label: string }> = [
  { key: "whatsapp", kind: "brand", label: "WhatsApp" },
  { key: "slack", kind: "brand", label: "Slack" },
  { key: "telegram", kind: "brand", label: "Telegram" },
  { key: "discord", kind: "brand", label: "Discord" },
  { key: "gmail", kind: "brand", label: "Gmail" },
  { key: "notion", kind: "brand", label: "Notion" },
  { key: "airtable", kind: "brand", label: "Airtable" },
  { key: "stripe", kind: "brand", label: "Stripe" },
  { key: "instagram", kind: "brand", label: "Instagram" },
  { key: "postgres", kind: "brand", label: "Postgres" },
];

const AUDIENCE = [
  {
    tag: "For you, the builder",
    accent: theme.coreAccent,
    title: "Design once, run for every client",
    body:
      "One owner account, unlimited client workspaces. Build a workflow, ask Vorrex Agents to extend or fix it in plain English, and deploy it under your own brand.",
    points: ["Encrypted, per-client credential vault", "Full run history and audit log per workflow", "White-label client dashboards"],
  },
  {
    tag: "For your client",
    accent: theme.triggerAccent,
    title: "A workflow they can actually see into",
    body:
      "Your client logs into their own dashboard, connects their own WhatsApp, Slack, or Stripe account with a key they hold, and watches every run — no black box, no shared secrets.",
    points: ["Nodes show a clear \"Not connected\" state, never a silent failure", "Client-owned credentials, never yours", "Plain-language run explanations"],
  },
];

const STEPS = [
  { n: "01", title: "Trigger it", body: "Start from a webhook, a schedule, an incoming chat, or a form submission." },
  { n: "02", title: "Let Vorrex Agents build it", body: "Describe the workflow in plain English — Vorrex Agents adds, wires, and configures the nodes for you." },
  { n: "03", title: "Connect real accounts", body: "Every integration node is explicit about whether it's connected. Nothing runs on a guess." },
  { n: "04", title: "Ship and watch it run", body: "Deploy, then track every execution — inputs, outputs, and errors — from the run log." },
];

export default function LandingPage() {
  const [wired, setWired] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWired(true), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ background: theme.canvasBg, color: theme.text, minHeight: "100vh" }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashMove { to { stroke-dashoffset: -24; } }
        @keyframes softGlow { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        .vrx-fade { animation: fadeUp 0.6s ease both; }
        .vrx-nav-link { color: ${theme.textMuted}; text-decoration: none; font-size: 13.5px; }
        .vrx-nav-link:hover { color: ${theme.text}; }
        .vrx-btn-primary { background: ${theme.accent}; color: #0A0A12; }
        .vrx-btn-primary:hover { filter: brightness(1.08); }
        .vrx-btn-ghost:hover { background: ${theme.cardBgHover}; }
        .vrx-card:hover { border-color: ${theme.borderStrong}; transform: translateY(-2px); }
        .vrx-card { transition: transform 160ms ease, border-color 160ms ease; }
        .vrx-int:hover { border-color: ${theme.borderStrong}; }
        @media (max-width: 860px) {
          .vrx-grid-2 { grid-template-columns: 1fr !important; }
          .vrx-hero-grid { grid-template-columns: 1fr !important; }
          .vrx-steps { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      {/* Nav */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, backdropFilter: "blur(10px)", background: "rgba(10,10,18,0.75)", borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 28 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: theme.text, fontWeight: 800, fontSize: 16, letterSpacing: -0.3 }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: `linear-gradient(135deg, ${theme.accent}, ${theme.aiAccent})`, display: "inline-block" }} />
            Vorrex
          </a>
          <div style={{ display: "flex", gap: 22, flex: 1 }}>
            <a className="vrx-nav-link" href="#how-it-works">How it works</a>
            <a className="vrx-nav-link" href="#audiences">Built for</a>
            <a className="vrx-nav-link" href="#integrations">Integrations</a>
          </div>
          <a href="/login" className="vrx-nav-link" style={{ fontWeight: 600 }}>Sign in</a>
          <a
            href="/login"
            className="vrx-btn-primary"
            style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13.5, fontWeight: 700, textDecoration: "none" }}
          >
            Get started
          </a>
        </div>
      </div>

      {/* Hero */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "76px 24px 40px" }}>
        <div className="vrx-hero-grid" style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 48, alignItems: "center" }}>
          <div className="vrx-fade">
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.3,
                color: theme.aiAccent,
                background: `${theme.aiAccent}18`,
                border: `1px solid ${theme.aiAccent}40`,
                borderRadius: 999,
                padding: "5px 11px",
                marginBottom: 20,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: theme.aiAccent, animation: "softGlow 1.8s infinite" }} />
              AI-native workflow automation
            </div>
            <h1 style={{ fontSize: "clamp(34px, 4.4vw, 52px)", lineHeight: 1.06, letterSpacing: -1.2, margin: "0 0 18px", fontWeight: 800 }}>
              Automations your clients<br />can trust — and you can{" "}
              <span style={{ background: `linear-gradient(90deg, ${theme.accent}, ${theme.aiAccent})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                explain
              </span>.
            </h1>
            <p style={{ fontSize: 16.5, lineHeight: 1.6, color: theme.textMuted, maxWidth: 480, margin: "0 0 30px" }}>
              Vorrex is a visual workflow builder with an AI co-pilot that adds, wires, and fixes nodes for you —
              and never lets a node run on a guess about whether an account is actually connected.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="/login" className="vrx-btn-primary" style={{ padding: "12px 22px", borderRadius: 9, fontWeight: 700, fontSize: 14.5, textDecoration: "none" }}>
                Sign in to your workspace
              </a>
              <a
                href="#how-it-works"
                className="vrx-btn-ghost"
                style={{ padding: "12px 22px", borderRadius: 9, fontWeight: 700, fontSize: 14.5, textDecoration: "none", color: theme.text, border: `1px solid ${theme.border}` }}
              >
                See how it works
              </a>
            </div>
          </div>

          {/* Live mini node-graph */}
          <div className="vrx-fade" style={{ animationDelay: "0.15s" }}>
            <div style={{ background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 26, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${theme.dotColor} 1px, transparent 1px)`, backgroundSize: "18px 18px", opacity: 0.5 }} />
              <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 34, padding: "10px 4px" }}>
                <MiniNode label="WhatsApp Trigger" iconKey="webhook" kind="outline" accent={theme.triggerAccent} sub="Trigger" />
                <Wire active={true} />
                <MiniNode label="AI Agent" iconKey="bot" kind="outline" accent={theme.aiAccent} sub="Claude Sonnet 5" />
                <Wire active={wired} />
                <MiniNode
                  label="WhatsApp Response"
                  iconKey="whatsapp"
                  kind="brand"
                  accent={theme.integrationAccent}
                  sub={wired ? "Connected" : "Not connected"}
                  status={wired ? "ok" : "warn"}
                />
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: theme.textFaint, textAlign: "center", marginTop: 10 }}>
              Every integration node tells you the truth about whether it&rsquo;s connected — before you hit Run.
            </p>
          </div>
        </div>
      </div>

      {/* Audiences */}
      <div id="audiences" style={{ maxWidth: 1120, margin: "0 auto", padding: "60px 24px" }}>
        <SectionHeading eyebrow="Built for two people" title="One platform, two very different views" />
        <div className="vrx-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 36 }}>
          {AUDIENCE.map((a) => (
            <div key={a.tag} className="vrx-card" style={{ background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 26 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: a.accent, marginBottom: 12 }}>{a.tag}</div>
              <h3 style={{ fontSize: 21, margin: "0 0 10px", fontWeight: 700 }}>{a.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: theme.textMuted, margin: "0 0 16px" }}>{a.body}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {a.points.map((p) => (
                  <div key={p} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: theme.text }}>
                    <span style={{ marginTop: 5, width: 5, height: 5, borderRadius: "50%", background: a.accent, flexShrink: 0 }} />
                    {p}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div id="how-it-works" style={{ maxWidth: 1120, margin: "0 auto", padding: "60px 24px" }}>
        <SectionHeading eyebrow="How it works" title="From idea to a running automation in four steps" />
        <div className="vrx-steps" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginTop: 36 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ padding: "20px 4px 0", borderTop: `2px solid ${theme.border}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: theme.accent, marginBottom: 10, letterSpacing: 0.5 }}>{s.n}</div>
              <h4 style={{ fontSize: 15.5, margin: "0 0 8px", fontWeight: 700 }}>{s.title}</h4>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: theme.textMuted, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Integrations */}
      <div id="integrations" style={{ maxWidth: 1120, margin: "0 auto", padding: "60px 24px" }}>
        <SectionHeading eyebrow="Integrations" title="Connect the tools you already run your business on" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
          {INTEGRATIONS.map((i) => (
            <div
              key={i.key}
              className="vrx-int"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                border: `1px solid ${theme.border}`,
                background: theme.panelBg,
                borderRadius: 10,
                padding: "10px 15px",
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              <NodeIcon iconKey={i.key} kind={i.kind} size={16} />
              {i.label}
            </div>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              border: `1px dashed ${theme.border}`,
              color: theme.textFaint,
              borderRadius: 10,
              padding: "10px 15px",
              fontSize: 13.5,
              fontWeight: 600,
            }}
          >
            + more every release
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "20px 24px 90px" }}>
        <div
          style={{
            background: `linear-gradient(135deg, ${theme.accent}22, ${theme.aiAccent}14)`,
            border: `1px solid ${theme.accent}40`,
            borderRadius: 18,
            padding: "48px 40px",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 28, margin: "0 0 10px", fontWeight: 800, letterSpacing: -0.6 }}>Ready to build your first workflow?</h2>
          <p style={{ fontSize: 14.5, color: theme.textMuted, margin: "0 0 24px" }}>Sign in and Vorrex Agents will help you put it together.</p>
          <a href="/login" className="vrx-btn-primary" style={{ padding: "12px 26px", borderRadius: 9, fontWeight: 700, fontSize: 14.5, textDecoration: "none" }}>
            Sign in
          </a>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${theme.border}`, padding: "24px", textAlign: "center", fontSize: 12, color: theme.textFaint }}>
        © {new Date().getFullYear()} Vorrex Agents.
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: theme.textFaint, marginBottom: 8 }}>{eyebrow}</div>
      <h2 style={{ fontSize: "clamp(22px, 2.6vw, 30px)", fontWeight: 800, letterSpacing: -0.6, margin: 0, maxWidth: 640 }}>{title}</h2>
    </div>
  );
}

function MiniNode({
  label,
  sub,
  iconKey,
  kind,
  accent,
  status,
}: {
  label: string;
  sub: string;
  iconKey: string;
  kind: "outline" | "brand";
  accent: string;
  status?: "ok" | "warn";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        background: theme.cardBg,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: "10px 13px",
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${accent}22`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <NodeIcon iconKey={iconKey} kind={kind} size={16} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: status === "warn" ? theme.danger : status === "ok" ? theme.success : theme.textFaint, textTransform: "uppercase", letterSpacing: 0.3 }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

function Wire({ active }: { active: boolean }) {
  return (
    <svg width="2" height="34" viewBox="0 0 2 34" style={{ marginLeft: 25, display: "block" }}>
      <line
        x1="1"
        y1="0"
        x2="1"
        y2="34"
        stroke={active ? theme.accent : theme.border}
        strokeWidth="2"
        strokeDasharray="4 4"
        style={{ transition: "stroke 400ms ease", animation: active ? "dashMove 1s linear infinite" : "none" }}
      />
    </svg>
  );
}
