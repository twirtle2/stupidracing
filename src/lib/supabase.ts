import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/config";

export const supabase = (env.supabaseUrl && env.supabaseAnonKey)
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false },
  })
  : (null as any);

