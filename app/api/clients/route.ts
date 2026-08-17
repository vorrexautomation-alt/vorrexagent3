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

// GET — list all clients (owner only)
export async function GET(req: NextRequest) {
  try {
    requireOwner(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id, email, name, key_prefix, is_active, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clients: data });
}

// POST — create a new client, auto-generate their special key (owner only)
export async function POST(req: NextRequest) {
  let owner;
  try {
    owner = requireOwner(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { email, name } = await req.json();
  if (!email || !name) {
    return NextResponse.json({ error: "Email and name are required." }, { status: 400 });
  }

  const specialKey = generateSpecialKey();

  const { data, error } = await supabaseAdmin
    .from("clients")
    .insert({
      email: email.toLowerCase().trim(),
      name,
      key_hash: hashKey(specialKey),
      key_prefix: keyPrefix(specialKey),
      created_by: null, // wire to a real owners.id once multi-owner is set up
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("audit_log").insert({
    actor_type: "owner",
    actor_id: "00000000-0000-0000-0000-000000000000",
    action: "client.create",
    client_id: data.id,
    details: { email, name },
  });

  // The plaintext key is returned EXACTLY ONCE — copy it to the client now,
  // it cannot be retrieved again (only the hash is stored).
  return NextResponse.json({ client_id: data.id, special_key: specialKey });
}
