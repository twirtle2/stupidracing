import { NextResponse } from "next/server";
import { isValidAddress } from "algosdk";

import {
  listHorseProfilesByAddressSeason,
  upsertHorseProfile,
  type HorseProfileRow,
} from "@/lib/db/horse-profiles";
import { isSupabaseConfigured } from "@/lib/db/supabase-rest";
import { fetchAccountAssets } from "@/lib/indexer";

export const dynamic = "force-dynamic";

function parseSeason(value: string | null | undefined, defaultSeason = 1) {
  if (!value) {
    return defaultSeason;
  }
  const season = Number(value);
  if (!Number.isInteger(season) || season <= 0) {
    throw new Error("Invalid season");
  }
  return season;
}

function profileFromRow(row: HorseProfileRow) {
  return {
    id: row.id,
    wallet_address: row.wallet_address,
    asset_id: Number(row.asset_id),
    name: row.name,
    description: row.description,
    season: row.season,
    stats: row.stats,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address")?.trim() || "";

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }
  if (!isValidAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  let season: number;
  try {
    season = parseSeason(searchParams.get("season"));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      profiles: [],
      resolvedSeason: season,
      persistenceConfigured: false,
    });
  }

  try {
    const rows = await listHorseProfilesByAddressSeason({
      walletAddress: address,
      season,
    });

    return NextResponse.json({
      profiles: rows.map(profileFromRow),
      resolvedSeason: season,
      persistenceConfigured: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load horse profiles" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Horse profile persistence is not configured" },
      { status: 503 }
    );
  }

  const body = (await req.json()) as {
    address?: string;
    assetId?: number;
    name?: string;
    description?: string;
    season?: number;
    stats?: Record<string, unknown>;
  };

  const address = body.address?.trim() || "";
  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }
  if (!isValidAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const assetId = Number(body.assetId);
  if (!Number.isInteger(assetId) || assetId <= 0) {
    return NextResponse.json({ error: "Invalid assetId" }, { status: 400 });
  }

  let season: number;
  try {
    season = parseSeason(body.season ? String(body.season) : undefined);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const description = (body.description || "").trim();

  if (name.length > 64) {
    return NextResponse.json({ error: "Name too long (max 64 chars)" }, { status: 400 });
  }
  if (description.length > 512) {
    return NextResponse.json(
      { error: "Description too long (max 512 chars)" },
      { status: 400 }
    );
  }

  try {
    const accountAssets = await fetchAccountAssets(address);
    const ownsAsset = accountAssets.some(
      (asset) => asset["asset-id"] === assetId && asset.amount > 0
    );

    if (!ownsAsset) {
      return NextResponse.json(
        { error: "Address does not currently hold this asset" },
        { status: 403 }
      );
    }

    const profile = await upsertHorseProfile({
      wallet_address: address,
      asset_id: assetId,
      name: name || null,
      description: description || null,
      season,
      stats: body.stats ?? null,
    });

    return NextResponse.json({
      profile: profileFromRow(profile),
      persisted: true,
      resolvedSeason: season,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to persist horse profile" },
      { status: 500 }
    );
  }
}
