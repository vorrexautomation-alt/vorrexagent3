"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ClientRow {
  id: string;
  email: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  created_at: string;
}

export default function OwnerDashboard() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyClientName, setNewKeyClientName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  function token() {
    const t = localStorage.getItem("vorrex_token");
    if (!t || localStorage.getItem("vorrex_role") !== "owner") {
      router.push("/login");
      throw new Error("no session");
    }
    return t;
  }

  async function loadClients() {
    const res = await fetch("/api/clients", { headers: { Authorization: `Bearer ${token()}` } });
    const data = await res.json();
    if (res.ok) setClients(data.clients);
  }

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNewKey(null);
    setKeyRevealed(false);
    setCopied(false);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ name, email }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create client.");
      return;
    }
    setNewKey(data.special_key);
    setNewKeyClientName(name);
    setName("");
    setEmail("");
    loadClients();
  }

  async function regenerateKey(client: ClientRow) {
    if (
      !window.confirm(
        `Regenerate the key for ${client.name}? Their current key (${client.key_prefix}...) will stop working immediately, and they'll need the new one to log in.`
      )
    ) {
      return;
    }
    setError("");
    setNewKey(null);
    setKeyRevealed(false);
    setCopied(false);
    setRegeneratingId(client.id);
    try {
      const res = await fetch(`/api/clients/${client.id}/regenerate-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to regenerate key.");
        return;
      }
      setNewKey(data.special_key);
      setNewKeyClientName(client.name);
    } catch {
      setError("Something went wrong regenerating the key.");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function deleteClient(client: ClientRow) {
    if (
      !window.confirm(
        `Delete ${client.name} (${client.email})? This permanently deletes the client and every workflow they own. This cannot be undone.`
      )
    ) {
      return;
    }
    setError("");
    setDeletingId(client.id);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete client.");
        return;
      }
      setClients((prev) => prev.filter((c) => c.id !== client.id));
    } catch {
      setError("Something went wrong deleting the client.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <h1>Owner Dashboard</h1>
      <p style={{ color: "#9C9CBE" }}>Create clients, generate keys, and access every client&apos;s workflows.</p>

      <form onSubmit={createClient} style={{ display: "flex", gap: 8, margin: "24px 0" }}>
        <input placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
        <input placeholder="Client email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
        <button type="submit" style={buttonStyle}>+ Create Client</button>
      </form>

      {error && <p style={{ color: "#FF5C7A" }}>{error}</p>}
      {newKey && (
        <div style={{ background: "#132a1c", border: "1px solid #2c5b3a", padding: 16, borderRadius: 8, marginBottom: 24 }}>
          <strong>{newKeyClientName ? `New key for ${newKeyClientName}.` : "Client created."}</strong> Copy this key now — it will never be shown again:
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 16,
                letterSpacing: keyRevealed ? "normal" : 2,
                userSelect: keyRevealed ? "text" : "none",
              }}
            >
              {keyRevealed ? newKey : "•".repeat(newKey.length)}
            </div>
            <button
              type="button"
              onClick={() => setKeyRevealed((v) => !v)}
              aria-label={keyRevealed ? "Hide key" : "Show key"}
              title={keyRevealed ? "Hide key" : "Show key"}
              style={eyeButtonStyle}
            >
              {keyRevealed ? <EyeOffIcon /> : <EyeIcon />}
            </button>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(newKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={{ ...eyeButtonStyle, fontSize: 12, width: "auto", padding: "0 10px" }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#9C9CBE", borderBottom: "1px solid #27273B" }}>
            <th style={th}>Name</th>
            <th style={th}>Email</th>
            <th style={th}>Key</th>
            <th style={th}>Status</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id} style={{ borderBottom: "1px solid #27273B" }}>
              <td style={td}>{c.name}</td>
              <td style={td}>{c.email}</td>
              <td style={{ ...td, fontFamily: "monospace" }}>{c.key_prefix}...</td>
              <td style={td}>{c.is_active ? "Active" : "Disabled"}</td>
              <td style={{ ...td, display: "flex", gap: 14, alignItems: "center" }}>
                <a href={`/dashboard?owner_view=${c.id}`} style={{ color: "#8B5CFF" }}>
                  View workflows →
                </a>
                <button
                  onClick={() => regenerateKey(c)}
                  disabled={regeneratingId === c.id}
                  style={{
                    background: "none",
                    border: "1px solid #5b2226",
                    color: "#ff8c8c",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 12,
                    cursor: regeneratingId === c.id ? "default" : "pointer",
                    opacity: regeneratingId === c.id ? 0.6 : 1,
                  }}
                >
                  {regeneratingId === c.id ? "Regenerating..." : "Regenerate Key"}
                </button>
                <button
                  onClick={() => deleteClient(c)}
                  disabled={deletingId === c.id || regeneratingId === c.id}
                  style={{
                    background: "none",
                    border: "1px solid #5b2226",
                    color: "#FF5C7A",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 12,
                    cursor: deletingId === c.id ? "default" : "pointer",
                    opacity: deletingId === c.id ? 0.6 : 1,
                  }}
                >
                  {deletingId === c.id ? "Deleting..." : "Delete"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #27273B",
  background: "#0A0A12",
  color: "#F5F5FA",
  flex: 1,
};
const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "#8B5CFF",
  color: "#0A0A12",
  fontWeight: 600,
  cursor: "pointer",
};
const th: React.CSSProperties = { padding: "8px 12px" };
const td: React.CSSProperties = { padding: "10px 12px" };
const eyeButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: 6,
  border: "1px solid #2c5b3a",
  background: "none",
  color: "#F5F5FA",
  cursor: "pointer",
  flexShrink: 0,
};

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-3.09 2.7A9.16 9.16 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 4.22-5.5" />
      <path d="M9.9 9.9a3 3 0 1 0 4.2 4.2" />
      <path d="M1 1l22 22" />
    </svg>
  );
}
