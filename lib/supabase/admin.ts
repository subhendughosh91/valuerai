import { createClient } from "@supabase/supabase-js";

function secretKeyFetch(secretKey: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("authorization") === `Bearer ${secretKey}`) headers.delete("authorization");
    return fetch(input, { ...init, headers });
  };
}

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, { global: { fetch: secretKeyFetch(key) }, auth: { autoRefreshToken: false, persistSession: false } });
}
