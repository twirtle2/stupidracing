import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { getSeasonsWithFallback } from "@/lib/season-discovery";

export async function GET() {
  try {
    return NextResponse.json({ seasons: await getSeasonsWithFallback() });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load seasons" },
      { status: 500 }
    );
  }
}
