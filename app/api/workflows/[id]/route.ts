import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getScopedSupabaseClient } from "@/lib/supabaseClient";
import { verifySession } from "@/lib/auth";

function getSessionToken(req: NextRequest) {
  return (req.headers.get("authorization") || "").replace("Bearer ", "");
}

function clientFor(req: NextRequest, claims: { app_role: string }) {
  const token = getSessionToken(req);
  return claims.app_role === "owner" ? supabaseAdmin : getScopedSupabaseClient(token);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = getSessionToken(req);
  let claims;
  try {
    claims = verifySession(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = clientFor(req, claims);
  const { data, error } = await db.from("workflows").select("*").eq("id", params.id).single();
  if (error || !data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ workflow: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const token = getSessionToken(req);
  let claims;
  try {
    claims = verifySession(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.workflow_json !== undefined) updates.workflow_json = body.workflow_json;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const db = clientFor(req, claims);
  const { data, error } = await db
    .from("workflows")
    .update(updates)
    .eq("id", params.id)
    .select("id")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message || "Not found." }, { status: 404 });

  await supabaseAdmin.from("audit_log").insert({
    actor_type: claims.app_role,
    actor_id: claims.app_role === "owner" ? "00000000-0000-0000-0000-000000000000" : (claims as { client_id: string }).client_id,
    action: "workflow.update",
    workflow_id: params.id,
    details: { fields_changed: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const token = getSessionToken(req);
  let claims;
  try {
    claims = verifySession(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Deleting a workflow is owner-only. Clients can build, run, and edit
  // their own workflows, but permanently removing one (and its run
  // history) is reserved for the owner — enforced here, not just hidden
  // in the UI, so a client can't call this endpoint directly either.
  if (claims.app_role !== "owner") {
    return NextResponse.json({ error: "Only the account owner can delete workflows." }, { status: 403 });
  }

  // Logged before the delete, not after — audit_log.workflow_id references
  // workflows(id), so inserting once the row is already gone would fail
  // the foreign key check (its `on delete set null` only nulls existing
  // rows, it doesn't let a new row point at an id that no longer exists).
  await supabaseAdmin.from("audit_log").insert({
    actor_type: claims.app_role,
    actor_id: "00000000-0000-0000-0000-000000000000",
    action: "workflow.delete",
    workflow_id: params.id,
    details: {},
  });

  const db = clientFor(req, claims);
  const { error } = await db.from("workflows").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
