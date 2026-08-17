import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifySession, generateSpecialKey, hashKey, keyPrefix } from "@/lib/auth";

function requireOwner(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  const claims = verifySession(token); // throws if invalid/expired
  if (claims.app_role !== "owner") throw new Error("Owner access required.");
  return claims;
}

// POST — issue a brand-new special key for an existing client, invalidating
// the old one immediately. This is the only way to recover a client's
// access if the original key was never copied at creation time (hashKey()
// is one-way, so the old plaintext can never be shown again — see
// lib/auth.ts). The new plaintext key is returned exactly once, same as
// on initial client creation.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireOwner(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("clients")
    .select("id, email, name")
    .eq("id", params.id)
    .single();

  if (lookupError || !existing) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const specialKey = generateSpecialKey();

  const { error } = await supabaseAdmin
    .from("clients")
    .update({
      key_hash: hashKey(specialKey),
      key_prefix: keyPrefix(specialKey),
    })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("audit_log").insert({
    actor_type: "owner",
    actor_id: "00000000-0000-0000-0000-000000000000",
    action: "client.regenerate_key",
    client_id: params.id,
    details: { email: existing.email },
  });

  // Any session issued against the old key is unaffected (sessions are
  // signed JWTs, not tied to key_hash) — the client keeps working until
  // their token expires (12h), then must log back in with the new key.
  return NextResponse.json({ client_id: params.id, special_key: specialKey });
}
