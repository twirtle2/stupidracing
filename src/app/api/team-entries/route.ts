import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const season = Number(searchParams.get("season") ?? 1);
  const limit = Number(searchParams.get("limit") ?? 64);

  const { data, error } = await supabase
    .from("team_entries")
    .select("wallet_address,asset_ids,season,created_at")
    .eq("season", season)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}
