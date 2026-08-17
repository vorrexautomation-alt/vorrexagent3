import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enqueueRun } from "@/lib/queue/queue";
import { recordAudit, logStructured } from "@/lib/observability";
import { verifyHmacSignature, verifySecret } from "@/lib/security";

export async function deliverWebhook(input: {
  path: string;
  rawBody: string;
  headers: Headers;
  deliveryId?: string;
}) {
  const deliveryId = input.deliveryId || input.headers.get("x-webhook-delivery") || crypto.randomUUID();
  const { data: mapping, error } = await supabaseAdmin.from("webhook_routes").select("*").eq("path", input.path).eq("enabled", true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!mapping) return { status: 404, body: { error: "Unknown webhook." } };

  const signature = input.headers.get("x-vorrex-signature") || input.headers.get("x-hub-signature-256");
  const secretHeader = input.headers.get("x-vorrex-secret");
  const validSignature = signature ? verifyHmacSignature(input.rawBody, signature, process.env.WEBHOOK_HMAC_SECRET || "") : verifySecret(secretHeader, mapping.secret_hash);
  if (!validSignature) {
    await supabaseAdmin.from("webhook_deliveries").upsert({ route_id: mapping.id, delivery_id: deliveryId, status: "rejected", error: "Invalid signature" }, { onConflict: "delivery_id" });
    logStructured({ level: "warn", event: "webhook.rejected", metadata: { routeId: mapping.id, deliveryId, reason: "invalid_signature" } });
    return { status: 401, body: { error: "Invalid webhook signature." } };
  }

  const { data: existing } = await supabaseAdmin.from("webhook_deliveries").select("id,status,run_id").eq("delivery_id", deliveryId).maybeSingle();
  if (existing?.status === "accepted" || existing?.status === "replayed") return { status: 202, body: { accepted: true, duplicate: true, runId: existing.run_id } };

  let body: unknown = {};
  if (input.rawBody) {
    try {
      body = JSON.parse(input.rawBody);
    } catch {
      await supabaseAdmin.from("webhook_deliveries").upsert({ route_id: mapping.id, delivery_id: deliveryId, status: "rejected", error: "Invalid JSON payload" }, { onConflict: "delivery_id" });
      logStructured({ level: "warn", event: "webhook.rejected", metadata: { routeId: mapping.id, deliveryId, reason: "invalid_json" } });
      return { status: 400, body: { error: "Webhook body must be valid JSON." } };
    }
  }
  const { data: workflow, error: workflowError } = await supabaseAdmin.from("workflows").select("id,client_id,is_active,workflow_json").eq("id", mapping.workflow_id).single();
  if (workflowError || !workflow?.is_active) return { status: 403, body: { error: "Workflow is unavailable." } };
  if (!(workflow.workflow_json?.nodes || []).some((node: { type: string }) => node.type === (mapping.trigger_type || "webhook"))) return { status: 400, body: { error: "Workflow trigger node is missing." } };

  const { data: delivery, error: deliveryError } = await supabaseAdmin.from("webhook_deliveries").upsert({ route_id: mapping.id, delivery_id: deliveryId, status: "received", payload: body, headers: Object.fromEntries(input.headers.entries()) }, { onConflict: "delivery_id" }).select("id").single();
  if (deliveryError || !delivery) throw new Error(deliveryError?.message || "Unable to log webhook delivery.");

  try {
    const { runId } = await enqueueRun({ workflowId: workflow.id, clientId: workflow.client_id, triggerType: "webhook", triggerData: body });
    await supabaseAdmin.from("webhook_deliveries").update({ status: "accepted", run_id: runId, accepted_at: new Date().toISOString() }).eq("id", delivery.id);
    await recordAudit({ actorType: "webhook", clientId: workflow.client_id, action: "webhook.accept", details: { route_id: mapping.id, delivery_id: deliveryId, run_id: runId } });
    return { status: 202, body: { accepted: true, deliveryId, runId } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to enqueue webhook.";
    await supabaseAdmin.from("webhook_deliveries").update({ status: "failed", error: message }).eq("id", delivery.id);
    logStructured({ level: "error", event: "webhook.enqueue_failed", error: message, workflowId: workflow.id });
    return { status: 503, body: { error: message, deliveryId } };
  }
}

export async function replayWebhookDelivery(deliveryId: string) {
  const { data: delivery } = await supabaseAdmin.from("webhook_deliveries").select("*,webhook_routes(workflow_id)").eq("delivery_id", deliveryId).single();
  if (!delivery) throw new Error("Delivery not found.");
  const route = Array.isArray(delivery.webhook_routes) ? delivery.webhook_routes[0] : delivery.webhook_routes;
  const { data: workflow } = await supabaseAdmin.from("workflows").select("id,client_id").eq("id", route.workflow_id).single();
  if (!workflow) throw new Error("Workflow not found.");
  const { runId } = await enqueueRun({ workflowId: workflow.id, clientId: workflow.client_id, triggerType: "webhook", triggerData: delivery.payload || {} });
  await supabaseAdmin.from("webhook_deliveries").update({ status: "replayed", run_id: runId, replayed_at: new Date().toISOString() }).eq("id", delivery.id);
  return { runId };
}
