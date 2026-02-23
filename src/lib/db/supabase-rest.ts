import "server-only";

type SupabaseConfig = {
  baseUrl: string;
  apiKey: string;
};

function getSupabaseConfig(): SupabaseConfig {
  const baseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const apiKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim() || "";

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ANON_KEY)."
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
  };
}

export function isSupabaseConfigured() {
  const baseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const apiKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim() || "";

  return Boolean(baseUrl && apiKey);
}

export async function supabaseRestRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const config = getSupabaseConfig();
  const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  headers.set("apikey", config.apiKey);
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
