import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const season = Number(searchParams.get("season") ?? 1);

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("horse_profiles")
    .select("asset_id,name,description,season,stats")
    .eq("wallet_address", address)
    .eq("season", season);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profiles: data ?? [] });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    address?: string;
    assetId?: number;
    name?: string;
    description?: string;
    season?: number;
    stats?: Record<string, unknown>;
  };

  if (!body.address || !body.assetId) {
    return NextResponse.json(
      { error: "Missing address or assetId" },
      { status: 400 }
    );
  }

  const season = body.season ?? 1;

  const { data, error } = await supabase
    .from("horse_profiles")
    .upsert(
      {
        wallet_address: body.address,
        asset_id: body.assetId,
        name: body.name ?? null,
        description: body.description ?? null,
        season,
        stats: body.stats ?? null,
      },
      { onConflict: "wallet_address,asset_id,season" }
    )
    .select("asset_id,name,description,season,stats")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
