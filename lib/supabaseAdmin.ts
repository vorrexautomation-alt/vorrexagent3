import { createClient, SupabaseClient } from "@supabase/supabase-js";

// SERVER-ONLY. Uses the service_role key which bypasses Row Level Security.
// Never import this file from a client component. This is how the Owner
// gets full cross-client access without complex RLS bypass logic — every
// owner-side route goes through here instead of the browser.
//
// Lazily constructed (not built at module load) on purpose: `createClient`
// throws synchronously if the URL is missing, and this file is imported by
// nearly every API route. An eager `createClient(...)` here means one
// missing env var crashes Next's "Collecting page data" step for EVERY
// route that imports this module, which fails `next build` outright on
// Vercel (rather than a clean, single route-level runtime error) if the
// project's env vars aren't set before the first deploy.
let _client: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client is not configured: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are missing. Set them in your environment (e.g. Vercel Project Settings -> Environment Variables) and redeploy."
    );
  }

  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// Proxy so existing call sites (`supabaseAdmin.from(...)`, etc.) don't need
// to change — the real client is only created the first time a property on
// it is actually touched, at request time, not at import time.
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseAdmin(), prop, receiver);
  },
});
