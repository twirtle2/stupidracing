import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const season = Number(searchParams.get("season") ?? 1);

  let query = supabase
    .from("race_results")
    .select("id,season,wallet_address,team_asset_ids,match_id,log,created_at")
    .eq("season", season)
    .order("created_at", { ascending: false })
    .limit(20);

  if (address) {
    query = query.or(
      `wallet_address.eq.${address},log->>opponent_address.eq.${address}`
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ results: data ?? [] });
}
