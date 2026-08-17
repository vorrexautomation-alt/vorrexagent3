"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { theme } from "@/components/node-canvas/theme";

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  updated_at: string;
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ownerViewingClientId = searchParams.get("owner_view");
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [role, setRole] = useState<"owner" | "client" | null>(null);

  // Deleting a workflow is an owner-only action (enforced again server-side
  // in DELETE /api/workflows/[id] — this just keeps the button from being
  // offered to a client in the first place). Owners still see it even
  // while viewing a client's workflows via ?owner_view=.
  const canDelete = role === "owner";

  useEffect(() => {
    setRole(localStorage.getItem("vorrex_role") as "owner" | "client" | null);
  }, []);

  function token() {
    const t = localStorage.getItem("vorrex_token");
    if (!t) {
      router.push("/login");
      throw new Error("no session");
    }
    return t;
  }

  async function load() {
    const url = ownerViewingClientId ? `/api/workflows?client_id=${ownerViewingClientId}` : "/api/workflows";
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (res.ok) {
        setWorkflows(data.workflows);
      } else {
        setError(data.error || "Failed to load workflows.");
      }
    } catch {
      setError("Something went wrong loading workflows.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerViewingClientId]);

  async function createWorkflow(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    const body: Record<string, unknown> = {
      name,
      workflow_json: { nodes: [], connections: {} },
    };
    if (ownerViewingClientId) body.client_id = ownerViewingClientId;
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/workflow/${data.workflow_id}`);
      } else {
        setError(data.error || "Failed to create workflow.");
      }
    } catch {
      setError("Something went wrong creating the workflow.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteWorkflow(w: WorkflowRow) {
    if (!window.confirm(`Delete "${w.name}"? This permanently deletes the workflow and its run history. This cannot be undone.`)) {
      return;
    }
    setError("");
    setDeletingId(w.id);
    try {
      const res = await fetch(`/api/workflows/${w.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete workflow.");
        return;
      }
      setWorkflows((prev) => prev.filter((row) => row.id !== w.id));
    } catch {
      setError("Something went wrong deleting the workflow.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 32, background: theme.canvasBg, minHeight: "100vh" }}>
      <h1 style={{ color: theme.text, fontSize: 22, marginBottom: 4 }}>
        {ownerViewingClientId ? "Client Workflows (Owner view)" : "Your Workflows"}
      </h1>
      <p style={{ color: theme.textMuted, fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        {ownerViewingClientId
          ? "Editing on behalf of this client — changes save to their account."
          : role === "client"
          ? "Open a workflow to edit it in the builder. Only the account owner can delete a workflow."
          : "Every workflow across your clients starts here."}
      </p>
      <form onSubmit={createWorkflow} style={{ display: "flex", gap: 8, margin: "0 0 24px" }}>
        <input
          placeholder="New workflow name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.canvasBg, color: theme.text, flex: 1, fontSize: 13.5 }}
        />
        <button
          type="submit"
          disabled={creating}
          style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: theme.accent, color: "#0A0A12", fontWeight: 600, fontSize: 13.5, cursor: creating ? "default" : "pointer", opacity: creating ? 0.7 : 1 }}
        >
          {creating ? "Creating..." : "+ New Workflow"}
        </button>
      </form>
      {error && (
        <p style={{ color: theme.danger, background: theme.dangerSoft, border: `1px solid ${theme.danger}`, borderRadius: 8, padding: "8px 12px", marginTop: -12, marginBottom: 20, fontSize: 13 }}>
          {error}
        </p>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {workflows.map((w) => {
          return (
            <div
              key={w.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 10,
                border: `1px solid ${theme.border}`,
                background: theme.panelBg,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ color: theme.text, fontSize: 14 }}>{w.name}</strong>
                <div style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 3 }}>
                  {w.is_active ? "Active" : "Inactive"} · updated {new Date(w.updated_at).toLocaleString()}
                </div>
              </div>
              <a
                href={"/workflow/" + w.id}
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  borderRadius: 7,
                  border: `1px solid ${theme.border}`,
                  background: theme.cardBg,
                  color: theme.text,
                  fontSize: 12.5,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Edit
              </a>
              {canDelete && (
                <button
                  onClick={() => deleteWorkflow(w)}
                  disabled={deletingId === w.id}
                  style={{
                    flexShrink: 0,
                    background: "none",
                    border: `1px solid ${theme.danger}55`,
                    color: theme.danger,
                    borderRadius: 7,
                    padding: "7px 12px",
                    fontSize: 12.5,
                    cursor: deletingId === w.id ? "default" : "pointer",
                    opacity: deletingId === w.id ? 0.6 : 1,
                  }}
                >
                  {deletingId === w.id ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          );
        })}
        {workflows.length === 0 && <p style={{ color: theme.textMuted }}>No workflows yet.</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: "#9C9CBE" }}>Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
