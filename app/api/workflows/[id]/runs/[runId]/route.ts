import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getScopedSupabaseClient } from "@/lib/supabaseClient";
import { verifySession } from "@/lib/auth";

function getSessionToken(req: NextRequest) {
  return (req.headers.get("authorization") || "").replace("Bearer ", "");
}

// GET — poll a durable run's status and per-node results. Intended to be
// polled every second or two by the builder UI while status is
// "queued"/"running"/"cancelling" — see worker.ts for exactly when each
// workflow_run_nodes row updates.
export async function GET(req: NextRequest, { params }: { params: { id: string; runId: string } }) {
  const token = getSessionToken(req);
  let claims;
  try {
    claims = verifySession(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = claims.app_role === "owner" ? supabaseAdmin : getScopedSupabaseClient(token);

  const { data: run, error: runError } = await db
    .from("workflow_runs")
    .select("*")
    .eq("id", params.runId)
    .eq("workflow_id", params.id)
    .single();
  if (runError || !run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const { data: nodes, error: nodesError } = await db
    .from("workflow_run_nodes")
    .select("node_id, node_type, status, attempt, input, output, error, started_at, finished_at")
    .eq("run_id", params.runId)
    .order("started_at", { ascending: true, nullsFirst: true });
  if (nodesError) return NextResponse.json({ error: nodesError.message }, { status: 500 });

  return NextResponse.json({ run, nodes: nodes || [] });
}
