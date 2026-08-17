import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { credentialResolver } from "@/lib/credentials/resolver";

function getSessionToken(req: NextRequest) {
  return (req.headers.get("authorization") || "").replace("Bearer ", "");
}

// PATCH /api/credentials/[id] rotates the encrypted field map in place.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let claims;
  try { claims = verifySession(getSessionToken(req)); } catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }
  const body = await req.json().catch(() => ({}));
  const clientId = claims.app_role === "client" ? claims.client_id : body.client_id;
  if (!clientId || !body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) return NextResponse.json({ error: "client_id and fields are required." }, { status: 400 });
  try {
    const credential = await credentialResolver.rotate({ clientId, credentialId: params.id, fields: body.fields, expiresAt: body.expires_at || null, actorType: claims.app_role, actorId: claims.app_role === "owner" ? "00000000-0000-0000-0000-000000000000" : claims.client_id });
    return NextResponse.json({ credential });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to rotate credential." }, { status: 400 }); }
}

// DELETE /api/credentials/[id]?client_id=... (client_id required for
// owner sessions, ignored/derived from the JWT for client sessions —
// see the same resolveClientId reasoning in app/api/credentials/route.ts).
// PATCH performs an authenticated in-place encrypted rotation; DELETE removes
// the credential and is tenant-scoped for both client and owner sessions.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  let claims;
  try {
    claims = verifySession(getSessionToken(req));
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  let clientId: string;
  if (claims.app_role === "client") {
    clientId = claims.client_id;
  } else {
    const requested = url.searchParams.get("client_id");
    if (!requested) {
      return NextResponse.json({ error: "client_id is required for owner-session requests." }, { status: 400 });
    }
    clientId = requested;
  }

  const deletedByType = claims.app_role;
  const deletedById = claims.app_role === "owner" ? "00000000-0000-0000-0000-000000000000" : claims.client_id;

  try {
    await credentialResolver.remove({ clientId, credentialId: params.id, actorType: deletedByType, actorId: deletedById });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete credential." }, { status: 500 });
  }
}
