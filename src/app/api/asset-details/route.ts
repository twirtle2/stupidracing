import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { fetchArc69Metadata, fetchCreatorAssets } from "@/lib/indexer";
import { STUPIDHORSE_CREATORS } from "@/lib/stupidhorse";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    assetIds?: number[];
    includeMetadata?: boolean;
  };

  if (!body.assetIds || body.assetIds.length === 0) {
    return NextResponse.json({ error: "Missing assetIds" }, { status: 400 });
  }

  try {
    const creatorAssets = (
      await Promise.all(
        STUPIDHORSE_CREATORS.map((creator) => fetchCreatorAssets(creator))
      )
    ).flat();

    const assetIdSet = new Set(body.assetIds);
    const assetMap = new Map(
      creatorAssets
        .filter((asset) => assetIdSet.has(asset.index))
        .map((asset) => [
          asset.index,
          {
            assetId: asset.index,
            name: asset.params.name ?? `Horse ${asset.index}`,
            unitName: asset.params["unit-name"] ?? "",
            imageUrl: asset.params.url ?? "",
          },
        ])
    );

    const assets = body.assetIds
      .map((id) => assetMap.get(id))
      .filter((asset) => asset !== undefined);

    const withMetadata = body.includeMetadata
      ? await Promise.all(
        assets.map(async (asset) => ({
          ...asset,
          metadata: await fetchArc69Metadata(asset.assetId),
        }))
      )
      : assets;

    return NextResponse.json({ assets: withMetadata });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Indexer error" },
      { status: 500 }
    );
  }
}
