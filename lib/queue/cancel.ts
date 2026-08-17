// Requests cancellation of a run (Phase 3). See worker.ts's "Cancellation
// is cooperative" note — this only flips a status flag; the worker
// observes it between waves and settles the run to `cancelled` itself.

import { supabaseAdmin } from "../supabaseAdmin";

export async function cancelRun(runId: string, clientId: string): Promise<{ alreadyFinished: boolean }> {
  const { data: run, error } = await supabaseAdmin
    .from("workflow_runs")
    .select("status")
    .eq("id", runId)
    .eq("client_id", clientId)
    .single();

  if (error || !run) throw new Error("Run not found (it may belong to a different client).");

  if (run.status === "success" || run.status === "error" || run.status === "cancelled") {
    return { alreadyFinished: true };
  }

  await supabaseAdmin.from("workflow_runs").update({ status: "cancelling" }).eq("id", runId);

  await supabaseAdmin.from("audit_log").insert({
    actor_type: "client",
    actor_id: clientId,
    action: "run.cancel",
    client_id: clientId,
    details: { run_id: runId },
  });

  return { alreadyFinished: false };
}
