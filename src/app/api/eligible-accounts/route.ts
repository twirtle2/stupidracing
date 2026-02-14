import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { fetchCreatorAssets } from "@/lib/indexer";
import { STUPIDHORSE_CREATORS } from "@/lib/stupidhorse";

async function fetchWithRetry(url: string, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (res.status === 429) {
                await new Promise(r => setTimeout(r, 1000 * (i + 1)));
                continue;
            }
            return res;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return fetch(url);
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 8), 64);
    const baseUrl = process.env.NEXT_PUBLIC_INDEXER_URL || "https://mainnet-idx.algonode.cloud";

    try {
        const creatorAssetsResults = await Promise.all(
            STUPIDHORSE_CREATORS.map((creator) => fetchCreatorAssets(creator))
        );
        const allCreatorAssets = creatorAssetsResults.flat();

        // Shuffle to get a broad sample of the collection
        const holderSample = allCreatorAssets.sort(() => 0.5 - Math.random()).slice(0, 300);
        const holderMap = new Map<string, Set<number>>();

        // Controlled concurrency to avoid rate limits
        const chunkSize = 15;
        for (let i = 0; i < holderSample.length; i += chunkSize) {
            const chunk = holderSample.slice(i, i + chunkSize);
            await Promise.all(
                chunk.map(async (asset) => {
                    try {
                        const resp = await fetchWithRetry(`${baseUrl}/v2/assets/${asset.index}/balances?currency-greater-than=0`);
                        if (resp.ok) {
                            const data = (await resp.json()) as {
                                balances?: Array<{ address: string }>;
                            };
                            data.balances?.forEach((b) => {
                                // Ignore creator wallets or empty balances
                                if (STUPIDHORSE_CREATORS.includes(b.address)) return;
                                if (!holderMap.has(b.address)) holderMap.set(b.address, new Set());
                                holderMap.get(b.address)!.add(asset.index);
                            });
                        }
                    } catch { /* ignore individual asset fetch errors */ }
                })
            );

            // If we already have enough candidates, we can stop early to save time
            const candidates = Array.from(holderMap.entries()).filter(([, assets]) => assets.size >= 5);
            if (candidates.length >= limit * 2) break;

            // Small pause between chunks
            await new Promise(r => setTimeout(r, 100));
        }

        const eligible = Array.from(holderMap.entries())
            .filter(([, assets]) => assets.size >= 5)
            .map(([address, assets]) => ({
                address,
                assetCount: assets.size,
                assetIds: Array.from(assets)
            }));

        // Randomize and take up to limit
        const finalSelection = eligible.sort(() => 0.5 - Math.random()).slice(0, limit);

        return NextResponse.json({ accounts: finalSelection });

    } catch (error) {
        console.error("Discovery API error:", error);
        return NextResponse.json(
            { error: (error as Error).message || "Discovery error" },
            { status: 500 }
        );
    }
}
