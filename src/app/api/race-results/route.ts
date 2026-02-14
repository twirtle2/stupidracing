import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Race results are on-chain only. Query /api/race-results/get instead." },
    { status: 405 }
  );
}
