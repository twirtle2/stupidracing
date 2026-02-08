import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { fetchCreatorAssets } from "@/lib/indexer";
import { STUPIDHORSE_CREATORS } from "@/lib/stupidhorse";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 8), 64);

    try {
        const creatorAssetsResults = await Promise.all(
            STUPIDHORSE_CREATORS.map((creator) => fetchCreatorAssets(creator))
        );
        const allCreatorAssets = creatorAssetsResults.flat();
        const holderSample = allCreatorAssets.sort(() => 0.5 - Math.random()).slice(0, 500); // Shuffled sample of 500
        const holderMap = new Map<string, Set<number>>();

        await Promise.all(
            holderSample.map(async (asset) => {
                try {
                    const baseUrl = process.env.NEXT_PUBLIC_INDEXER_URL || "https://mainnet-idx.algonode.cloud";
                    const resp = await fetch(`${baseUrl}/v2/assets/${asset.index}/balances?currency-greater-than=0`);
                    if (resp.ok) {
                        const data = await resp.json();
                        data.balances?.forEach((b: any) => {
                            if (!holderMap.has(b.address)) holderMap.set(b.address, new Set());
                            holderMap.get(b.address)!.add(asset.index);
                        });
                    }
                } catch (e) {
                    // ignore
                }
            })
        );

        const eligible = Array.from(holderMap.entries())
            .filter(([_, assets]) => assets.size >= 5)
            .map(([address, assets]) => ({
                address,
                assetCount: assets.size,
                assetIds: Array.from(assets)
            }));

        const shuffled = eligible.sort(() => 0.5 - Math.random());
        return NextResponse.json({ accounts: shuffled.slice(0, limit) });

    } catch (error) {
        return NextResponse.json(
            { error: (error as Error).message || "Discovery error" },
            { status: 500 }
        );
    }
}
