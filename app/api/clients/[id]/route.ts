import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifySession } from "@/lib/auth";

function requireOwner(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  const claims = verifySession(token); // throws if invalid/expired
  if (claims.app_role !== "owner") throw new Error("Owner access required.");
  return claims;
}

// GET — single client detail (owner only)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireOwner(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id, email, name, key_prefix, is_active, created_at")
    .eq("id", params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return NextResponse.json({ client: data });
}

// DELETE — permanently remove a client (owner only).
//
// `workflows.client_id` is declared `references clients(id) on delete
// cascade` (see sql/schema.sql), so removing the client row also removes
// every workflow that belongs to them, and each of those cascades further
// into execution_log. audit_log rows are kept (client_id is set to null
// there, not cascaded) so the history of what happened isn't silently
// erased along with the client.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireOwner(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("clients")
    .select("id, email, name")
    .eq("id", params.id)
    .single();

  if (lookupError || !existing) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const { count: workflowCount } = await supabaseAdmin
    .from("workflows")
    .select("id", { count: "exact", head: true })
    .eq("client_id", params.id);

  const { error } = await supabaseAdmin.from("clients").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("audit_log").insert({
    actor_type: "owner",
    actor_id: "00000000-0000-0000-0000-000000000000",
    action: "client.delete",
    client_id: null, // the client row is gone; keep the fact on record without a dangling FK
    details: { deleted_client_id: params.id, email: existing.email, name: existing.name, workflows_deleted: workflowCount ?? 0 },
  });

  return NextResponse.json({ ok: true, workflows_deleted: workflowCount ?? 0 });
}
