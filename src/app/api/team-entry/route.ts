import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { getTeamEntry } from "@/lib/tournament-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const seasonParam = searchParams.get("season");
  const appId = searchParams.get("appId") || undefined;

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }
  const requestedSeason = seasonParam ? Number(seasonParam) : undefined;
  if (
    requestedSeason !== undefined &&
    (!Number.isInteger(requestedSeason) || requestedSeason <= 0)
  ) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }

  try {
    const data = await getTeamEntry(
      address,
      appId ? { appId } : requestedSeason ? { season: requestedSeason } : {}
    );
    if (!data.entry) {
      return NextResponse.json({
        entry: null,
        resolvedSeason: data.resolvedSeason,
        resolvedAppId: data.resolvedAppId,
      });
    }

    return NextResponse.json({
      entry: {
        asset_ids: data.entry.assetIds,
        season: data.entry.season,
        created_at: null,
      },
      resolvedSeason: data.resolvedSeason,
      resolvedAppId: data.resolvedAppId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load team entry" },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Team registration is on-chain only. Use registerTeam on the app client." },
    { status: 405 }
  );
}
