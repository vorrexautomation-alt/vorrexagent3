import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getScopedSupabaseClient } from "@/lib/supabaseClient";
import { verifySession } from "@/lib/auth";
import { enqueueRun } from "@/lib/queue/queue";

function getSessionToken(req: NextRequest) {
  return (req.headers.get("authorization") || "").replace("Bearer ", "");
}

// POST — enqueue a durable, queue-backed run of this workflow (Phase 3).
// This is the ASYNC counterpart to POST /api/workflows/[id]/run: that
// endpoint runs the graph inline and blocks until it finishes (the
// "debug" path — still there, still synchronous, unchanged by this
// route's existence). This one returns a run id immediately; poll
// GET /api/workflows/[id]/runs/[runId] for status and per-node results.
// Requires REDIS_URL to be configured — see lib/queue/connection.ts for
// the error you'll get if it isn't.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const token = getSessionToken(req);
  let claims;
  try {
    claims = verifySession(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = claims.app_role === "owner" ? supabaseAdmin : getScopedSupabaseClient(token);
  const { data: wf, error } = await db.from("workflows").select("id, client_id").eq("id", params.id).single();
  if (error || !wf) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // no body supplied — a manual run with no input is fine
  }

  try {
    const { runId } = await enqueueRun({
      workflowId: wf.id,
      clientId: wf.client_id,
      triggerType: "manual",
      triggerData: body ?? {},
    });
    return NextResponse.json({ run_id: runId, status: "queued" }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to enqueue run." }, { status: 500 });
  }
}

// GET — list recent runs for this workflow (most recent first).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = getSessionToken(req);
  let claims;
  try {
    claims = verifySession(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = claims.app_role === "owner" ? supabaseAdmin : getScopedSupabaseClient(token);
  const { data: runs, error } = await db
    .from("workflow_runs")
    .select("id, status, trigger_type, error, queued_at, started_at, finished_at")
    .eq("workflow_id", params.id)
    .order("queued_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: runs || [] });
}
