import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// The web app only uses the anon role + the two edge functions.
// It never holds an authenticated session.
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const EDGE_FUNCTION_BASE = `${url}/functions/v1`;
