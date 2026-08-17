import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getScopedSupabaseClient } from "@/lib/supabaseClient";
import { verifySession } from "@/lib/auth";

function getSessionToken(req: NextRequest) {
  return (req.headers.get("authorization") || "").replace("Bearer ", "");
}

// GET — list workflows.
// Client sessions: RLS restricts this to their own client_id automatically.
// Owner sessions: optionally pass ?client_id=... to view a specific client's
// workflows, or omit it to see everything.
export async function GET(req: NextRequest) {
  const token = getSessionToken(req);
  let claims;
  try {
    claims = verifySession(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const clientIdFilter = req.nextUrl.searchParams.get("client_id");

  if (claims.app_role === "owner") {
    let query = supabaseAdmin
      .from("workflows")
      .select("id, client_id, name, description, is_active, updated_at")
      .order("updated_at", { ascending: false });
    if (clientIdFilter) query = query.eq("client_id", clientIdFilter);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ workflows: data });
  }

  // Client role — scoped client bypasses nothing; RLS enforces isolation.
  const scoped = getScopedSupabaseClient(token);
  const { data, error } = await scoped
    .from("workflows")
    .select("id, client_id, name, description, is_active, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflows: data });
}

// POST — create a new workflow.
// Client sessions create under their own client_id (enforced by RLS insert policy).
// Owner sessions must specify client_id explicitly (they're creating on someone's behalf).
export async function POST(req: NextRequest) {
  const token = getSessionToken(req);
  let claims;
  try {
    claims = verifySession(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json();
  const { name, description, workflow_json, client_id } = body;

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  if (claims.app_role === "owner") {
    if (!client_id) {
      return NextResponse.json({ error: "client_id is required for owner-created workflows." }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from("workflows")
      .insert({ client_id, name, description, workflow_json: workflow_json || {} })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabaseAdmin.from("audit_log").insert({
      actor_type: "owner",
      actor_id: "00000000-0000-0000-0000-000000000000",
      action: "workflow.create",
      workflow_id: data.id,
      client_id,
    });

    return NextResponse.json({ workflow_id: data.id });
  }

  // client role
  const scoped = getScopedSupabaseClient(token);
  const { data, error } = await scoped
    .from("workflows")
    .insert({ client_id: claims.client_id, name, description, workflow_json: workflow_json || {} })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflow_id: data.id });
}
