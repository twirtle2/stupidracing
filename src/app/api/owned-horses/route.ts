import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import {
  fetchAccountAssets,
  fetchArc69Metadata,
  fetchCreatorAssets,
} from "@/lib/indexer";
import { STUPIDHORSE_CREATORS } from "@/lib/stupidhorse";
import { resolveIpfsUrl } from "@/lib/ipfs";


export async function POST(req: Request) {
  const { address } = (await req.json()) as { address?: string };

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const [accountAssets, ...creatorResults] = await Promise.all([
      fetchAccountAssets(address),
      ...STUPIDHORSE_CREATORS.map((creator) => fetchCreatorAssets(creator)),
    ]);
    const creatorAssets = creatorResults.flat();

    const horseAssets = creatorAssets.filter((asset) => {
      const unit = asset.params["unit-name"] ?? "";
      const name = asset.params.name ?? "";
      const total = asset.params.total ?? 0;
      return (
        /^HORSE\d+$/i.test(unit) ||
        /^STUPIDHORSE\s*\d+/i.test(name) ||
        /^2INY\d+$/i.test(unit) ||
        /^2(tiny|iny)horse\s*\d+/i.test(name) ||
        (unit.toUpperCase().startsWith("HORSE") && total === 1) ||
        (unit.toUpperCase().startsWith("2INY") && total === 1)
      );

    });

    const horseMap = new Map(
      horseAssets.map((asset) => [
        asset.index,
        {
          assetId: asset.index,
          name: asset.params.name ?? `Horse ${asset.index}`,
          unitName: asset.params["unit-name"] ?? "",
          imageUrl: resolveIpfsUrl(asset.params.url),

        },
      ])
    );

    const ownedAssets = accountAssets
      .filter((asset) => asset.amount && asset.amount > 0)
      .map((asset) => horseMap.get(asset["asset-id"]))
      .filter((asset) => asset !== undefined);

    const owned = await Promise.all(
      ownedAssets.map(async (asset) => {
        const metadata = await fetchArc69Metadata(asset.assetId);
        return { ...asset, metadata };
      })
    );

    return NextResponse.json({ assets: owned });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Indexer error" },
      { status: 500 }
    );
  }
}
