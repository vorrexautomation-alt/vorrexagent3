import { NextRequest, NextResponse } from "next/server";
import { deliverWebhook } from "@/lib/triggers/webhookGateway";
import { getClientKey, rateLimit } from "@/lib/security";

export async function POST(req: NextRequest) {
  const limited = rateLimit(`webhook:${getClientKey(req)}`, 120, 60_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many webhook requests." }, { status: 429, headers: { "Retry-After": String(limited.retryAfter) } });
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || req.headers.get("x-vorrex-path") || url.pathname;
  const result = await deliverWebhook({ path, rawBody: await req.text(), headers: req.headers });
  return NextResponse.json(result.body, { status: result.status });
}
