import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET as string;

// ------------------------------------------------------------------
// Special key generation (client login credential)
// ------------------------------------------------------------------
export function generateSpecialKey(): string {
  // e.g. VX-A8F3K9P2M7Q1X5Z4
  return "VX-" + crypto.randomBytes(16).toString("hex").toUpperCase();
}

// Keys are never stored in plaintext — only a salted hash, like a password.
export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function keyPrefix(key: string): string {
  return key.slice(0, 8); // e.g. "VX-A8F3" — enough to show/identify, not enough to guess
}

// ------------------------------------------------------------------
// Session JWTs
// ------------------------------------------------------------------
//
// BUGFIX (client workflow creation failing silently):
// These JWTs are sent straight to PostgREST as the `Authorization: Bearer`
// header for client sessions (see lib/supabaseClient.ts). PostgREST treats
// the top-level `role` claim specially — it runs `SET LOCAL ROLE <role>`
// against Postgres before executing the query, so RLS applies as that
// role. The old code put `role: "client"` / `role: "owner"` in the claims,
// but Postgres has no role literally named "client" or "owner" — only the
// standard `anon` / `authenticated` / `service_role` roles exist. Every
// request from a client session was therefore failing at the database
// layer (role "client" does not exist) before the `workflows_insert_own`
// RLS policy ever got a chance to run. Owner-side creation was unaffected
// because it goes through supabaseAdmin (the service_role key) and never
// touches this path.
//
// Fix: keep `role` set to the real Postgres role ("authenticated"), and
// carry our own app-level distinction (owner vs client) in a separate
// `app_role` claim. RLS policies are unaffected since they only ever read
// `client_id` out of the JWT, never `role`.
interface ClientClaims {
  role: "authenticated";
  app_role: "client";
  client_id: string;
  email: string;
}

interface OwnerClaims {
  role: "authenticated";
  app_role: "owner";
  owner_id: string;
  email: string;
}

export function signClientSession(claims: Omit<ClientClaims, "role" | "app_role">): string {
  const payload: ClientClaims = { role: "authenticated", app_role: "client", ...claims };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

export function signOwnerSession(claims: Omit<OwnerClaims, "role" | "app_role">): string {
  const payload: OwnerClaims = { role: "authenticated", app_role: "owner", ...claims };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

export function verifySession(token: string): ClientClaims | OwnerClaims {
  return jwt.verify(token, JWT_SECRET) as ClientClaims | OwnerClaims;
}
