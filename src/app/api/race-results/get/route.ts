import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { listMatchResults } from "@/lib/tournament-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address") || undefined;
  const season = Number(searchParams.get("season") ?? 1);
  const appId = searchParams.get("appId") || undefined;

  try {
    const results = await listMatchResults(
      appId ? { appId, addressFilter: address } : { season, addressFilter: address }
    );
    if (results.length > 0 && results[0].season !== season) {
      return NextResponse.json({ results: [] });
    }
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load race results" },
      { status: 500 }
    );
  }
}
