import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

type HorseProfile = {
  asset_id: number;
  name: string | null;
  description: string | null;
  season: number;
  stats?: Record<string, unknown> | null;
};

export async function GET() {
  return NextResponse.json({ profiles: [] as HorseProfile[] });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    assetId?: number;
    name?: string;
    description?: string;
    season?: number;
    stats?: Record<string, unknown>;
  };

  if (!body.assetId) {
    return NextResponse.json({ error: "Missing assetId" }, { status: 400 });
  }

  const profile: HorseProfile = {
    asset_id: body.assetId,
    name: body.name ?? null,
    description: body.description ?? null,
    season: body.season ?? 1,
    stats: body.stats ?? null,
  };

  return NextResponse.json({
    profile,
    warning: "Horse profiles are currently not persisted; season state is on-chain.",
  });
}
