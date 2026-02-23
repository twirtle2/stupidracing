import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { listTeamEntries } from "@/lib/tournament-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const seasonParam = searchParams.get("season");
  const limit = Number(searchParams.get("limit") ?? 64);
  const appId = searchParams.get("appId") || undefined;
  const requestedSeason = seasonParam ? Number(seasonParam) : undefined;

  if (
    requestedSeason !== undefined &&
    (!Number.isInteger(requestedSeason) || requestedSeason <= 0)
  ) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }

  try {
    const data = await listTeamEntries(
      appId ? { appId } : requestedSeason ? { season: requestedSeason } : {}
    );

    const entries = data.entries.slice(0, limit).map((entry) => ({
      wallet_address: entry.address,
      asset_ids: entry.assetIds,
      season: entry.season,
      created_at: null,
    }));

    return NextResponse.json({
      entries,
      resolvedSeason: data.resolvedSeason,
      resolvedAppId: data.resolvedAppId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load team entries" },
      { status: 500 }
    );
  }
}
