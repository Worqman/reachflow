import { createClient } from "@supabase/supabase-js";

// IMPORTANT: this must be the anon/public key, never the service_role key.
// It ships inside the browser bundle — the service_role key bypasses RLS
// entirely, so shipping it here would give anyone who opens devtools full
// read/write access to every table.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env",
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
