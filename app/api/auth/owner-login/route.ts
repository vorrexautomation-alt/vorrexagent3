import { NextRequest, NextResponse } from "next/server";
import { signOwnerSession } from "@/lib/auth";
import { verifyOwnerPassword } from "@/lib/ownerAuth";
import { getClientKey, rateLimit } from "@/lib/security";
import { logStructured } from "@/lib/observability";

// NOTE: this bootstraps a single owner from env vars for simplicity.
// Once you have more than one owner/admin, move this to an `owners` table
// lookup via supabaseAdmin (schema already supports it — see sql/schema.sql)
// instead of a single hardcoded account.
export async function POST(req: NextRequest) {
  const limited = rateLimit(`auth:owner:${getClientKey(req)}`, 10, 15 * 60_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(limited.retryAfter) } });
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerHash = process.env.OWNER_PASSWORD_HASH;
  const fallbackPassword = process.env.OWNER_PASSWORD;

  const invalid = () => {
    logStructured({ level: "warn", event: "auth.owner_rejected", metadata: { email: String(email || "").slice(0, 120), ip: getClientKey(req) } });
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  };

  if (!ownerEmail || (!ownerHash && !fallbackPassword)) return invalid();
  if (email.toLowerCase().trim() !== ownerEmail.toLowerCase().trim()) return invalid();

  const ok = await verifyOwnerPassword(String(password), ownerHash, fallbackPassword);
  if (!ok) return invalid();

  const token = signOwnerSession({ owner_id: "owner", email: ownerEmail });
  return NextResponse.json({ token });
}
