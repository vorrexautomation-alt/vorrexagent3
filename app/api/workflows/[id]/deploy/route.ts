import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getScopedSupabaseClient } from "@/lib/supabaseClient";
import { verifySession } from "@/lib/auth";

function getSessionToken(req: NextRequest) {
  return (req.headers.get("authorization") || "").replace("Bearer ", "");
}

// POST — push this workflow's JSON to the real n8n instance and activate it,
// so it runs 24/7 independent of this app. This is Phase 5: the platform
// stays a frontend/store; n8n does the actual execution.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const token = getSessionToken(req);
  let claims;
  try {
    claims = verifySession(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = claims.app_role === "owner" ? supabaseAdmin : getScopedSupabaseClient(token);
  const { data: wf, error } = await db.from("workflows").select("*").eq("id", params.id).single();
  if (error || !wf) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const n8nBase = process.env.N8N_BASE_URL;
  const n8nKey = process.env.N8N_API_KEY;
  if (!n8nBase || !n8nKey) {
    return NextResponse.json({ error: "N8N_BASE_URL / N8N_API_KEY not configured." }, { status: 500 });
  }

  const isUpdate = Boolean(wf.n8n_workflow_id);
  const url = isUpdate ? `${n8nBase}/api/v1/workflows/${wf.n8n_workflow_id}` : `${n8nBase}/api/v1/workflows`;

  const n8nRes = await fetch(url, {
    method: isUpdate ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nKey },
    body: JSON.stringify({
      name: wf.name,
      nodes: wf.workflow_json?.nodes || [],
      connections: wf.workflow_json?.connections || {},
      settings: wf.workflow_json?.settings || {},
    }),
  });

  if (!n8nRes.ok) {
    const detail = await n8nRes.text();
    return NextResponse.json({ error: "n8n deploy failed.", detail }, { status: 502 });
  }

  const n8nData = await n8nRes.json();

  // Activate it so it runs 24/7 without this app needing to stay open.
  await fetch(`${n8nBase}/api/v1/workflows/${n8nData.id}/activate`, {
    method: "POST",
    headers: { "X-N8N-API-KEY": n8nKey },
  });

  await db.from("workflows").update({ n8n_workflow_id: n8nData.id, is_active: true }).eq("id", params.id);

  await supabaseAdmin.from("audit_log").insert({
    actor_type: claims.app_role,
    actor_id: claims.app_role === "owner" ? "00000000-0000-0000-0000-000000000000" : (claims as { client_id: string }).client_id,
    action: "workflow.deploy",
    workflow_id: params.id,
    client_id: wf.client_id,
  });

  return NextResponse.json({ ok: true, n8n_workflow_id: n8nData.id });
}
