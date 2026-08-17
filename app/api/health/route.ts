import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    jwt: Boolean(process.env.JWT_SECRET),
    credentialsEncryption: Boolean(process.env.CREDENTIALS_ENCRYPTION_KEY),
    redis: Boolean(process.env.REDIS_URL),
    n8n: Boolean(process.env.N8N_BASE_URL && process.env.N8N_API_KEY),
  };
  const coreReady = checks.supabase && checks.jwt && checks.credentialsEncryption;
  return NextResponse.json(
    { status: coreReady ? "ok" : "degraded", service: "vorrex-api", runtime: "vercel-serverless", checks },
    { status: coreReady ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
