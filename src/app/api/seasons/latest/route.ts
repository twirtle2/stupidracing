import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { getSeasonsWithFallback } from "@/lib/season-discovery";

export async function GET() {
  try {
    const seasons = await getSeasonsWithFallback();
    const latest = seasons.at(-1) ?? null;
    if (!latest) {
      return NextResponse.json({ latest: null });
    }

    return NextResponse.json({
      latest: {
        season: latest.season,
        appId: latest.appId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load latest season" },
      { status: 500 }
    );
  }
}
