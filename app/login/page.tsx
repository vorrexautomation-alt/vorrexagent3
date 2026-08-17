"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"client" | "owner">("client");
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState(""); // key or password depending on mode
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = mode === "client" ? "/api/auth/client-login" : "/api/auth/owner-login";
    const body = mode === "client" ? { email, key: secret } : { email, password: secret };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        setLoading(false);
        return;
      }
      localStorage.setItem("vorrex_token", data.token);
      localStorage.setItem("vorrex_role", mode);
      router.push(mode === "owner" ? "/owner" : "/dashboard");
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#0A0A12" }}>
      <form onSubmit={handleSubmit} style={{ width: 360, padding: 32, background: "#15151F", borderRadius: 12, border: "1px solid #27273B" }}>
        <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none", color: "#F5F5FA", marginBottom: 18, fontSize: 13, fontWeight: 700 }}>
          <span style={{ width: 20, height: 20, borderRadius: 6, background: "linear-gradient(135deg, #8B5CFF, #FF4FA3)", display: "inline-block" }} />
          Vorrex
        </a>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Vorrex Agents</h1>
        <p style={{ color: "#9C9CBE", marginTop: 0, marginBottom: 24, fontSize: 14 }}>
          {mode === "client" ? "Sign in with your email and special key" : "Owner sign-in"}
        </p>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type={mode === "client" ? "text" : "password"}
          placeholder={mode === "client" ? "Special Key (VX-...)" : "Password"}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          required
          style={inputStyle}
        />

        {error && <p style={{ color: "#FF5C7A", fontSize: 13 }}>{error}</p>}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <p
          onClick={() => setMode(mode === "client" ? "owner" : "client")}
          style={{ marginTop: 16, fontSize: 13, color: "#8B5CFF", cursor: "pointer", textAlign: "center" }}
        >
          {mode === "client" ? "Owner login instead" : "Client login instead"}
        </p>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  marginBottom: 12,
  borderRadius: 8,
  border: "1px solid #27273B",
  background: "#0A0A12",
  color: "#F5F5FA",
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "none",
  background: "#8B5CFF",
  color: "#0A0A12",
  fontWeight: 600,
  cursor: "pointer",
};
