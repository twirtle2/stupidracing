import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { getTeamEntry } from "@/lib/tournament-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const season = Number(searchParams.get("season") ?? 1);
  const appId = searchParams.get("appId") || undefined;

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const entry = await getTeamEntry(address, appId ? { appId } : { season });
    if (!entry) {
      return NextResponse.json({ entry: null });
    }
    if (entry.season !== season) {
      return NextResponse.json({ entry: null });
    }

    return NextResponse.json({
      entry: {
        asset_ids: entry.assetIds,
        season: entry.season,
        created_at: null,
      },
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
