import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { listTeamEntries } from "@/lib/tournament-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const season = Number(searchParams.get("season") ?? 1);
  const limit = Number(searchParams.get("limit") ?? 64);
  const appId = searchParams.get("appId") || undefined;

  try {
    const data = await listTeamEntries(appId ? { appId } : { season });
    if (data.season !== season) {
      return NextResponse.json({ entries: [] });
    }

    const entries = data.entries.slice(0, limit).map((entry) => ({
      wallet_address: entry.address,
      asset_ids: entry.assetIds,
      season: entry.season,
      created_at: null,
    }));

    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load team entries" },
      { status: 500 }
    );
  }
}
