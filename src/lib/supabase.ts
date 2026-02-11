import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/config";

export const supabase = (env.supabaseUrl && env.supabaseAnonKey)
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false },
  })
  : (null as any);
// Used for server-side admin operations (e.g. bypassing RLS)
export const supabaseAdmin = (env.supabaseUrl && env.supabaseServiceKey)
  ? createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false },
  })
  : null;

