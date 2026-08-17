"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import AiSidebar from "@/components/AiSidebar";
import type { WorkflowGraph } from "@/components/node-canvas";
import { NODE_DEFINITIONS_BY_TYPE } from "@/components/node-canvas/nodeDefinitions";
import { theme } from "@/components/node-canvas/theme";

// Pointer-based dragging needs the browser — load client-side only.
const NodeCanvas = dynamic(() => import("@/components/node-canvas").then((m) => m.NodeCanvas), { ssr: false });

export default function WorkflowEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  // The workflow row's own client_id — passed down to the credentials
  // picker so an owner session (which has no client_id of its own in its
  // JWT) still knows which client's stored credentials to list/create
  // against. Client sessions ignore this and use their own JWT claim
  // instead (see app/api/credentials/route.ts's resolveClientId).
  const [workflowClientId, setWorkflowClientId] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [executionStatuses, setExecutionStatuses] = useState<Record<string, "idle" | "running" | "success" | "error" | "waiting">>({});
  // Bumped whenever the workflow is replaced from outside the canvas (e.g. the
  // AI sidebar) so <NodeCanvas key=...> remounts and re-hydrates from the new
  // data instead of ignoring it (NodeCanvas only reads its initial props on
  // mount, by design, so a live drag never gets clobbered mid-edit).
  const [reloadKey, setReloadKey] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("vorrex_token");
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);

    fetch(`/api/workflows/${params.id}`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.workflow) {
          setWorkflow(data.workflow.workflow_json || { nodes: [], connections: {} });
          setName(data.workflow.name);
          setWorkflowClientId(data.workflow.client_id || "");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (!workflow) return <div style={{ padding: 32, color: "#F5F5FA" }}>Loading...</div>;

  // Every node whose type requires an external account but hasn't had one
  // connected yet (see FlowNode's matching on-canvas badge). Surfaced BEFORE
  // Run is clicked so "why didn't my message send?" has an answer right
  // here instead of a stack trace after the fact.
  const graph = workflow as unknown as WorkflowGraph;
  const unconfiguredNodes = (graph.nodes || []).filter((n) => {
    const def = NODE_DEFINITIONS_BY_TYPE[n.type];
    if (!def?.requiresCredentials) return false;
    const cred = n.config?.__credential;
    return cred === undefined || cred === "none";
  });

  async function saveWorkflow() {
    if (!workflow || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, workflow_json: workflow }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save workflow.");
      setWorkflow(data.workflow?.workflow_json || workflow);
    } catch (error) { setRunResult({ ok: false, message: error instanceof Error ? error.message : "Unable to save workflow." }); }
    finally { setSaving(false); }
  }

  async function togglePublish() {
    try {
      if (!published) {
        const res = await fetch(`/api/workflows/${params.id}/deploy`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to publish workflow.");
        setPublished(true);
        setRunResult({ ok: true, message: "Workflow published." });
      } else {
        const res = await fetch(`/api/workflows/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ is_active: false }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to unpublish workflow.");
        setPublished(false);
        setRunResult({ ok: true, message: "Workflow unpublished." });
      }
    } catch (error) { setRunResult({ ok: false, message: error instanceof Error ? error.message : "Unable to change publish state." }); }
  }

  function downloadWorkflow() {
    const blob = new Blob([JSON.stringify({ name, workflow_json: workflow }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${name || "vorrex-workflow"}.json`; anchor.click(); URL.revokeObjectURL(url);
  }

  async function runWorkflow() {
    setRunning(true);
    setRunResult(null);
    setExecutionStatuses(Object.fromEntries((graph.nodes || []).map((node) => [node.id, "waiting" as const])));
    try {
      const res = await fetch(`/api/workflows/${params.id}/runs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.run_id) {
        setRunResult({ ok: false, message: data.error || "Unable to queue run." });
        setExecutionStatuses({});
        return;
      }

      const deadline = Date.now() + 15 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const statusRes = await fetch(`/api/workflows/${params.id}/runs/${data.run_id}`, { headers: { Authorization: `Bearer ${token}` } });
        const statusData = await statusRes.json();
        if (!statusRes.ok) throw new Error(statusData.error || "Unable to read run status.");
        const nextStatuses: Record<string, "idle" | "running" | "success" | "error" | "waiting"> = {};
        for (const node of statusData.nodes || []) nextStatuses[node.node_id] = node.status === "pending" ? "waiting" : node.status;
        setExecutionStatuses(nextStatuses);
        if (["success", "error", "cancelled"].includes(statusData.run?.status)) {
          setRunResult({ ok: statusData.run.status === "success", message: statusData.run.status === "success" ? "Run completed." : `Run ${statusData.run.status}: ${statusData.run.error || "unknown error"}` });
          return;
        }
      }
      setRunResult({ ok: false, message: "Run is still active after the UI polling limit; check the run history." });
    } catch (error) {
      setRunResult({ ok: false, message: error instanceof Error ? error.message : "Something went wrong running the workflow." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: aiOpen ? "minmax(0, 1fr) 360px" : "minmax(0, 1fr)", height: "100vh", background: "#0A0A12" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #27273B", display: "flex", alignItems: "center", gap: 8, background: "#11111C" }}>
          <a href="/dashboard" style={{ color: "#9C9CBE", textDecoration: "none", padding: "7px 8px", borderRadius: 7 }}>← Back</a>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveWorkflow} aria-label="Workflow name" style={{ minWidth: 160, maxWidth: 300, background: "transparent", border: "1px solid transparent", borderRadius: 7, color: "#F5F5FA", fontWeight: 700, fontSize: 14, padding: "7px 8px" }} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 7, alignItems: "center" }}>
            <button onClick={saveWorkflow} disabled={saving} style={{ padding: "7px 12px", borderRadius: 7, border: "1px solid #36364D", background: "#181827", color: "#F5F5FA", cursor: "pointer" }}>{saving ? "Saving…" : "Save"}</button>
            <button onClick={runWorkflow} disabled={running} style={{ padding: "7px 13px", borderRadius: 7, border: "none", background: "#2EE6A6", color: "#0A0A12", fontWeight: 700, cursor: running ? "default" : "pointer", opacity: running ? 0.7 : 1 }}>{running ? "Running…" : "Test workflow"}</button>
            <button onClick={togglePublish} style={{ padding: "7px 12px", borderRadius: 7, border: `1px solid ${published ? "#FFB84D" : "#2EE6A6"}`, background: "transparent", color: published ? "#FFB84D" : "#2EE6A6", fontWeight: 700, cursor: "pointer" }}>{published ? "Unpublish" : "Publish"}</button>
            <button onClick={() => setAiOpen((v) => !v)} style={{ padding: "7px 12px", borderRadius: 7, border: "1px solid #7C6CFF", background: aiOpen ? "#7C6CFF22" : "transparent", color: "#B8AEFF", cursor: "pointer" }}>{aiOpen ? "Close Agents" : "Vorrex Agents"}</button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setMoreOpen((v) => !v)} style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid #36364D", background: "#181827", color: "#F5F5FA", cursor: "pointer" }}>•••</button>
              {moreOpen && <div style={{ position: "absolute", right: 0, top: 38, zIndex: 30, width: 170, padding: 6, border: "1px solid #36364D", borderRadius: 8, background: "#181827", boxShadow: "0 10px 30px #0008" }}>
                <button onClick={downloadWorkflow} style={{ width: "100%", textAlign: "left", padding: 8, background: "transparent", border: 0, color: "#F5F5FA", cursor: "pointer" }}>Download JSON</button>
                <button onClick={() => setRunResult({ ok: true, message: "Workflow settings are available in the node and workflow controls." })} style={{ width: "100%", textAlign: "left", padding: 8, background: "transparent", border: 0, color: "#F5F5FA", cursor: "pointer" }}>Settings</button>
              </div>}
            </div>
          </div>
        </div>
        {runResult && (
          <div style={{ padding: "8px 16px", fontSize: 13, color: runResult.ok ? "#2EE6A6" : "#FF5C7A", borderBottom: "1px solid #27273B" }}>
            {runResult.message}
          </div>
        )}
        {unconfiguredNodes.length > 0 && (
          <div
            style={{
              padding: "8px 16px",
              fontSize: 12.5,
              color: "#e0a030",
              background: "rgba(224,160,48,0.08)",
              borderBottom: "1px solid #27273B",
            }}
          >
            {unconfiguredNodes.length === 1 ? "1 node has" : `${unconfiguredNodes.length} nodes have`} no account
            connected yet ({unconfiguredNodes.map((n) => n.name).join(", ")}) — open each and add a credential, or
            the run will fail there.
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>
          <NodeCanvas
            key={`canvas-${params.id}-${reloadKey}`}
            initialWorkflowJson={workflow as Partial<WorkflowGraph>}
            workflowId={params.id}
            authToken={token}
            clientId={workflowClientId}
            onSaved={(graph) => setWorkflow(graph as unknown as Record<string, unknown>)}
            onChange={(graph) => setWorkflow(graph as unknown as Record<string, unknown>)}
            executionStatuses={executionStatuses}
          />
        </div>
      </div>
      {aiOpen && <AiSidebar
        workflowId={params.id}
        token={token}
        onWorkflowUpdated={(w) => {
          setWorkflow(w);
          setReloadKey((k) => k + 1);
        }}
        onClose={() => setAiOpen(false)}
      />}
    </div>
  );
}
