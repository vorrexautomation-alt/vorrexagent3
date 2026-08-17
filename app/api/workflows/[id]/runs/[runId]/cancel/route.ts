import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getScopedSupabaseClient } from "@/lib/supabaseClient";
import { verifySession } from "@/lib/auth";
import { cancelRun } from "@/lib/queue/cancel";

function getSessionToken(req: NextRequest) {
  return (req.headers.get("authorization") || "").replace("Bearer ", "");
}

// POST — request cancellation of a run. See lib/queue/worker.ts's
// "Cancellation is cooperative" note: this flips a status flag the
// worker checks between waves of node execution, it does not instantly
// abort an in-flight node call.
export async function POST(req: NextRequest, { params }: { params: { id: string; runId: string } }) {
  const token = getSessionToken(req);
  let claims;
  try {
    claims = verifySession(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Resolve which client_id this run must belong to, exactly like
  // app/api/credentials/route.ts's resolveClientId — an owner session
  // needs the workflow's own client_id (looked up here), a client
  // session is always scoped to its own.
  let clientId: string;
  if (claims.app_role === "client") {
    clientId = claims.client_id;
  } else {
    const { data: wf, error } = await supabaseAdmin.from("workflows").select("client_id").eq("id", params.id).single();
    if (error || !wf) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
    clientId = wf.client_id;
  }

  // Sanity-check the run actually belongs to this workflow before
  // touching it, using whichever client-scoped view the caller has.
  const db = claims.app_role === "owner" ? supabaseAdmin : getScopedSupabaseClient(token);
  const { data: run, error: runError } = await db
    .from("workflow_runs")
    .select("id")
    .eq("id", params.runId)
    .eq("workflow_id", params.id)
    .single();
  if (runError || !run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  try {
    const result = await cancelRun(params.runId, clientId);
    return NextResponse.json({ ok: true, already_finished: result.alreadyFinished });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to cancel run." }, { status: 500 });
  }
}
