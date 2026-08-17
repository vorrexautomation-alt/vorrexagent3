import { createClient } from "@supabase/supabase-js";

// Returns a Supabase client authenticated as the given client session JWT.
// Because the JWT is signed with the same secret as the Supabase project
// (see lib/auth.ts), RLS policies can read the `client_id` claim from it —
// so this client can only ever see rows belonging to that one client.
//
// Called at request time only (never at module load), so a missing env
// var surfaces as a normal request-time error rather than breaking
// `next build` for every route that imports this module — see the same
// note in lib/supabaseAdmin.ts.
export function getScopedSupabaseClient(sessionJwt: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase client is not configured: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY are missing."
    );
  }

  return createClient(url, anonKey, {
      auth: { persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${sessionJwt}` },
      },
    }
  );
}
