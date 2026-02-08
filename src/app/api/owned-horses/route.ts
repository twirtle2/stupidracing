import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import {
  fetchAccountAssets,
  fetchArc69Metadata,
  fetchCreatorAssets,
  fetchAsset,
} from "@/lib/indexer";
import { STUPIDHORSE_CREATORS } from "@/lib/stupidhorse";
import { resolveIpfsUrl } from "@/lib/ipfs";


export async function POST(req: Request) {
  const { address } = (await req.json()) as { address?: string };

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const accountAssets = await fetchAccountAssets(address);
    const horseAssets = [];

    // Filter for assets that are actually owned
    const ownedAssetIds = accountAssets
      .filter((a) => a.amount && a.amount > 0)
      .map((a) => a["asset-id"]);

    // Fetch details for each owned asset in batches
    const chunkSize = 10;
    for (let i = 0; i < ownedAssetIds.length; i += chunkSize) {
      const chunk = ownedAssetIds.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(id => fetchAsset(id))
      );

      for (const asset of results) {
        if (!asset) continue;
        const unit = asset.params["unit-name"] ?? "";
        const name = asset.params.name ?? "";
        const total = asset.params.total ?? 0;
        const creator = asset.params.creator;

        const isHorse =
          STUPIDHORSE_CREATORS.includes(creator) ||
          /^HORSE\d+$/i.test(unit) ||
          /^STUPIDHORSE\s*\d+/i.test(name) ||
          /^2INY\d+$/i.test(unit) ||
          /^2(tiny|iny)horse\s*\d+/i.test(name) ||
          (unit.toUpperCase().startsWith("HORSE") && total === 1) ||
          (unit.toUpperCase().startsWith("2INY") && total === 1);

        if (isHorse) {
          const metadata = await fetchArc69Metadata(asset.index);
          horseAssets.push({
            assetId: asset.index,
            name: asset.params.name ?? `Horse ${asset.index}`,
            unitName: asset.params["unit-name"] ?? "",
            imageUrl: resolveIpfsUrl(asset.params.url),
            metadata
          });
        }
      }
    }

    return NextResponse.json({ assets: horseAssets });

  } catch (error) {
    console.error("Owned horses error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Indexer error" },
      { status: 500 }
    );
  }
}
