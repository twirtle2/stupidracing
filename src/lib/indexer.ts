import { env } from "@/lib/config";

export type IndexerAccountAsset = {
  "asset-id": number;
  amount: number;
  deleted?: boolean;
};

export async function fetchAccountAssets(address: string) {
  const assets: IndexerAccountAsset[] = [];
  let nextToken: string | undefined;

  do {
    const url = new URL(
      `${env.indexerUrl.replace(/\/$/, "")}/v2/accounts/${address}/assets`
    );
    url.searchParams.set("limit", "1000");
    if (nextToken) {
      url.searchParams.set("next", nextToken);
    }

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Indexer error: ${response.status}`);
    }

    const data = (await response.json()) as {
      assets: IndexerAccountAsset[];
      "next-token"?: string;
    };

    assets.push(...(data.assets || []));
    nextToken = data["next-token"];
  } while (nextToken);

  return assets;
}

export type IndexerAsset = {
  index: number;
  params: {
    creator: string;
    name?: string;
    "unit-name"?: string;
    url?: string;
    total?: number;
  };
};

export async function fetchCreatorAssets(creator: string) {
  const assets: IndexerAsset[] = [];
  let nextToken: string | undefined;

  do {
    const url = new URL(`${env.indexerUrl.replace(/\/$/, "")}/v2/assets`);
    url.searchParams.set("creator", creator);
    url.searchParams.set("limit", "1000");
    if (nextToken) {
      url.searchParams.set("next", nextToken);
    }

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Indexer error: ${response.status}`);
    }

    const data = (await response.json()) as {
      assets: IndexerAsset[];
      "next-token"?: string;
    };

    assets.push(...(data.assets || []));
    nextToken = data["next-token"];
  } while (nextToken);

  return assets;
}

export type Arc69Metadata = {
  standard?: string;
  description?: string;
  external_url?: string;
  attributes?: Array<{ trait_type?: string; value?: string }>;
};

function decodeArc69(note?: string) {
  if (!note) {
    return null;
  }
  try {
    const json = Buffer.from(note, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Arc69Metadata;
    if (parsed.standard?.toLowerCase() !== "arc69") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchArc69Metadata(assetId: number) {
  const url = new URL(`${env.indexerUrl.replace(/\/$/, "")}/v2/transactions`);
  url.searchParams.set("asset-id", String(assetId));
  url.searchParams.set("tx-type", "acfg");
  url.searchParams.set("limit", "25");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Indexer error: ${response.status}`);
  }

  const data = (await response.json()) as {
    transactions?: Array<{ note?: string; "confirmed-round"?: number }>;
  };

  const txs = data.transactions ?? [];
  const sorted = txs.sort(
    (a, b) => (b["confirmed-round"] ?? 0) - (a["confirmed-round"] ?? 0)
  );

  for (const tx of sorted) {
    const parsed = decodeArc69(tx.note);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}
