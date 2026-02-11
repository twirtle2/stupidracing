import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { supabase, supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const season = Number(searchParams.get("season") ?? 1);

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  // Use admin client if available to bypass RLS for public reads
  const client = supabaseAdmin || supabase;

  const { data, error } = await client
    .from("team_entries")
    .select("asset_ids,season,created_at")
    .eq("wallet_address", address)
    .eq("season", season)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data?.[0] ?? null });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    address?: string;
    assetIds?: number[];
    season?: number;
  };

  if (!body.address || !body.assetIds || body.assetIds.length === 0) {
    return NextResponse.json(
      { error: "Missing address or assetIds" },
      { status: 400 }
    );
  }

  if (body.assetIds.length !== 5) {
    return NextResponse.json(
      { error: "Team must contain exactly 5 horses" },
      { status: 400 }
    );
  }

  const season = body.season ?? 1;

  const { data, error } = await supabase
    .from("team_entries")
    .insert({
      wallet_address: body.address,
      asset_ids: body.assetIds,
      season,
    })
    .select("asset_ids,season,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data });
}
