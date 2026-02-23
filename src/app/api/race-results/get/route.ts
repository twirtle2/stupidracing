import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { listMatchResults } from "@/lib/tournament-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address") || undefined;
  const seasonParam = searchParams.get("season");
  const appId = searchParams.get("appId") || undefined;
  const requestedSeason = seasonParam ? Number(seasonParam) : undefined;

  if (
    requestedSeason !== undefined &&
    (!Number.isInteger(requestedSeason) || requestedSeason <= 0)
  ) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }

  try {
    const data = await listMatchResults(
      appId
        ? { appId, addressFilter: address }
        : requestedSeason
          ? { season: requestedSeason, addressFilter: address }
          : { addressFilter: address }
    );
    return NextResponse.json({
      results: data.results,
      resolvedSeason: data.resolvedSeason,
      resolvedAppId: data.resolvedAppId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load race results" },
      { status: 500 }
    );
  }
}
