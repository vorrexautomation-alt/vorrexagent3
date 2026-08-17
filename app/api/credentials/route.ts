import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { credentialResolver } from "@/lib/credentials/resolver";

function getSessionToken(req: NextRequest) {
  return (req.headers.get("authorization") || "").replace("Bearer ", "");
}

// Resolves which client_id this request is allowed to act as.
//   - client sessions: always their own client_id (from the JWT — never
//     trust a client-supplied client_id, so it's ignored even if sent).
//   - owner sessions: cross-client, so they must say which client's
//     credentials they mean (?client_id=... on GET, {client_id} in the
//     POST body) — the Owner UI passes this from whatever client they're
//     currently managing.
function resolveClientId(
  claims: ReturnType<typeof verifySession>,
  requested: string | null | undefined
): string {
  if (claims.app_role === "client") return claims.client_id;
  if (!requested) throw new Error("client_id is required for owner-session requests.");
  return requested;
}

// GET /api/credentials?nodeType=slack&client_id=... — list credentials
// (metadata only — never the decrypted secret, never the encrypted
// envelope) available to populate a node's Credentials dropdown.
export async function GET(req: NextRequest) {
  let claims;
  try {
    claims = verifySession(getSessionToken(req));
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const nodeType = url.searchParams.get("nodeType") || undefined;
  const credentialType = url.searchParams.get("credential_type") || undefined;

  let clientId: string;
  try {
    clientId = resolveClientId(claims, url.searchParams.get("client_id"));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bad request." }, { status: 400 });
  }

  try {
    const credentials = await credentialResolver.list(clientId, credentialType, nodeType);
    return NextResponse.json({ credentials });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to list credentials." }, { status: 500 });
  }
}

// POST /api/credentials — store a new credential. Body:
//   { client_id?, node_type, name, fields: { ENV_VAR_NAME: "value", ... } }
// `fields` keys should match the node's credentialFields[].envVar names
// from nodeDefinitions.ts (the ConfigPanel's "add credential" form
// builds the body this way) so the resolver can hand them straight to
// executors expecting that shape.
export async function POST(req: NextRequest) {
  let claims;
  try {
    claims = verifySession(getSessionToken(req));
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { client_id: requestedClientId, node_type: nodeType, credential_type: credentialType, name, fields } = body as {
    client_id?: string;
    node_type?: string;
    credential_type?: string;
    name?: string;
    fields?: Record<string, string>;
  };

  if (!credentialType || !name || !fields || typeof fields !== "object" || Array.isArray(fields)) {
    return NextResponse.json({ error: "credential_type, name, and fields are required." }, { status: 400 });
  }

  let clientId: string;
  try {
    clientId = resolveClientId(claims, requestedClientId);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bad request." }, { status: 400 });
  }

  const createdByType = claims.app_role;
  const createdById = claims.app_role === "owner" ? "00000000-0000-0000-0000-000000000000" : claims.client_id;

  try {
    const credential = await credentialResolver.create({
      clientId,
      credentialType,
      nodeType: nodeType || null,
      name,
      fields,
      actorType: createdByType,
      actorId: createdById,
    });
    return NextResponse.json({ credential });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to store credential." }, { status: 500 });
  }
}
