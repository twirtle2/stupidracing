import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    season?: number;
    walletAddress?: string | null;
    opponentAddress?: string | null;
    teamAssetIds?: number[];
    opponentAssetIds?: number[];
    winnerAddress?: string | null;
    matchId?: string;
    log?: unknown;
  };

  if (!body.teamAssetIds || !body.opponentAssetIds) {
    return NextResponse.json({ error: "Missing team assets" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("race_results")
    .insert({
      season: body.season ?? 1,
      wallet_address: body.walletAddress ?? null,
      team_asset_ids: body.teamAssetIds,
      match_id: body.matchId ?? null,
      winner_asset_id: null,
      log: {
        opponent_address: body.opponentAddress ?? null,
        opponent_asset_ids: body.opponentAssetIds,
        winner_address: body.winnerAddress ?? null,
        heats: body.log ?? null,
      },
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data?.id });
}
