import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getScopedSupabaseClient } from "@/lib/supabaseClient";
import { verifySession } from "@/lib/auth";
import { runWorkflow } from "@/lib/execution/runtime";
import { WorkflowJson } from "@/lib/execution/types";

function getSessionToken(req: NextRequest) {
  return (req.headers.get("authorization") || "").replace("Bearer ", "");
}

// POST — manually run a workflow right now (the "Run" button in the
// builder). This is the manual half of the trigger layer; the other half
// is the public webhook endpoint at app/api/webhooks/[workflowId].
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

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // no body supplied — a manual run with no input is fine
  }

  const started_at = new Date().toISOString();
  const result = await runWorkflow(wf.workflow_json as WorkflowJson, {
    workflowId: wf.id,
    clientId: wf.client_id,
    triggerData: body ?? {},
  });

  await supabaseAdmin.from("execution_log").insert({
    workflow_id: wf.id,
    client_id: wf.client_id,
    trigger_type: "manual",
    status: result.status,
    error: result.error,
    node_results: result.node_results,
    started_at,
    finished_at: new Date().toISOString(),
  });

  return NextResponse.json(result);
}
