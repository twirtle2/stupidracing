import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/config";

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false },
});
