import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { deliverWebhook } from "@/lib/triggers/webhookGateway";
import { getClientKey, rateLimit } from "@/lib/security";

export async function POST(req: NextRequest, { params }: { params: { workflowId: string } }) {
  const limited = rateLimit(`webhook:${getClientKey(req)}`, 120, 60_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many webhook requests." }, { status: 429, headers: { "Retry-After": String(limited.retryAfter) } });
  const { data: route } = await supabaseAdmin.from("webhook_routes").select("path").eq("workflow_id", params.workflowId).eq("enabled", true).maybeSingle();
  const path = route?.path || `/api/webhooks/${params.workflowId}`;
  const result = await deliverWebhook({ path, rawBody: await req.text(), headers: req.headers });
  return NextResponse.json(result.body, { status: result.status });
}
