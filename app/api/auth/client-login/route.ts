import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashKey, signClientSession } from "@/lib/auth";
import { getClientKey, rateLimit } from "@/lib/security";
import { logStructured } from "@/lib/observability";

export async function POST(req: NextRequest) {
  const limited = rateLimit(`auth:client:${getClientKey(req)}`, 10, 15 * 60_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(limited.retryAfter) } });
  const { email, key } = await req.json();

  if (!email || !key) {
    return NextResponse.json({ error: "Email and key are required." }, { status: 400 });
  }

  const { data: client, error } = await supabaseAdmin
    .from("clients")
    .select("id, email, key_hash, is_active")
    .eq("email", email.toLowerCase().trim())
    .single();

  // Same generic error whether the email doesn't exist or the key is wrong —
  // never reveal which one failed, that leaks account existence.
  const invalid = () => {
    logStructured({ level: "warn", event: "auth.client_rejected", metadata: { email: String(email || "").slice(0, 120), ip: getClientKey(req) } });
    return NextResponse.json({ error: "Invalid email or key." }, { status: 401 });
  };

  if (error || !client) return invalid();
  if (!client.is_active) return invalid();
  if (client.key_hash !== hashKey(key.trim())) return invalid();

  const token = signClientSession({ client_id: client.id, email: client.email });

  return NextResponse.json({ token, client_id: client.id });
}
