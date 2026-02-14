import "server-only";

import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { encodeAddress } from "algosdk";

import { StupidRacingTournamentClient } from "@/lib/contracts/StupidRacingTournamentClient";
import { listSeasons as listConfiguredSeasons } from "@/lib/season-registry";

const DEFAULT_ALGOD = "https://testnet-api.algonode.cloud";
const DEFAULT_INDEXER = "https://testnet-idx.algonode.cloud";
const DEFAULT_SENDER =
  process.env.NEXT_PUBLIC_READ_ONLY_SENDER ||
  "CMYTBDMMKVKJSN4YO7BSVMBJCVTC2GBG6BY22Z4KKIUDNZGKUQI54MNTHU";
const ADMIN_STATE_KEY_B64 = "YWRtaW4=";

type SeasonDescriptor = {
  season: number;
  appId: string;
  isLatest: boolean;
};

type CreatedApplicationsResponse = {
  applications?: Array<{ id?: number; "created-at-round"?: number }>;
  "next-token"?: string;
};

type ApplicationInfoResponse = {
  application?: {
    params?: {
      "global-state"?: Array<{
        key?: string;
        value?: {
          type?: number;
          bytes?: string;
          uint?: number;
        };
      }>;
    };
  };
};

function parseNodeUrl(urlInput: string, defaultPort: number) {
  const url = new URL(urlInput);
  return {
    server: `${url.protocol}//${url.hostname}`,
    port: Number(url.port || defaultPort),
    base: `${url.protocol}//${url.host}`,
  };
}

function getIndexerBaseUrl() {
  const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || DEFAULT_INDEXER;
  const parsed = parseNodeUrl(indexerUrl, indexerUrl.startsWith("https") ? 443 : 80);
  return parsed.base;
}

function getAlgorandClient() {
  const algodUrl = process.env.NEXT_PUBLIC_ALGOD_URL || DEFAULT_ALGOD;
  const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || DEFAULT_INDEXER;
  const algod = parseNodeUrl(algodUrl, algodUrl.startsWith("https") ? 443 : 80);
  const indexer = parseNodeUrl(indexerUrl, indexerUrl.startsWith("https") ? 443 : 80);

  return AlgorandClient.fromConfig({
    algodConfig: {
      server: algod.server,
      port: algod.port,
      token: process.env.ALGOD_TOKEN || "",
    },
    indexerConfig: {
      server: indexer.server,
      port: indexer.port,
      token: process.env.INDEXER_TOKEN || "",
    },
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Indexer request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function getAdminAddressFromBootstrapApp() {
  const bootstrapAppId = process.env.NEXT_PUBLIC_TOURNAMENT_APP_ID;
  if (!bootstrapAppId) {
    return null;
  }

  const appId = Number(bootstrapAppId);
  if (!Number.isInteger(appId) || appId <= 0) {
    return null;
  }

  const indexerBase = getIndexerBaseUrl();
  const data = await fetchJson<ApplicationInfoResponse>(`${indexerBase}/v2/applications/${appId}`);
  const state = data.application?.params?.["global-state"] || [];
  const adminEntry = state.find((entry) => entry.key === ADMIN_STATE_KEY_B64);
  const adminBytes = adminEntry?.value?.bytes;
  if (!adminBytes) {
    return null;
  }

  return encodeAddress(Buffer.from(adminBytes, "base64"));
}

async function resolveAdminAddress() {
  const explicitAdmin = process.env.NEXT_PUBLIC_TOURNAMENT_ADMIN_ADDRESS;
  if (explicitAdmin) {
    return explicitAdmin;
  }

  const configured = listConfiguredSeasons();
  if (configured.length > 0) {
    return await getAdminAddressFromBootstrapApp();
  }

  return await getAdminAddressFromBootstrapApp();
}

async function listCreatedApplications(address: string) {
  const indexerBase = getIndexerBaseUrl();
  const ids: Array<{ appId: number; createdAtRound?: number }> = [];
  let nextToken = "";

  do {
    const params = new URLSearchParams();
    params.set("limit", "1000");
    if (nextToken) {
      params.set("next", nextToken);
    }

    const data = await fetchJson<CreatedApplicationsResponse>(
      `${indexerBase}/v2/accounts/${address}/created-applications?${params.toString()}`
    );

    for (const app of data.applications || []) {
      if (typeof app.id === "number" && app.id > 0) {
        ids.push({ appId: app.id, createdAtRound: app["created-at-round"] });
      }
    }

    nextToken = data["next-token"] || "";
  } while (nextToken);

  return ids;
}

async function probeSeasonApps(appIds: Array<{ appId: number; createdAtRound?: number }>) {
  const algorand = getAlgorandClient();
  const candidates: Array<{ season: number; appId: number; createdAtRound?: number }> = [];

  const chunkSize = 12;
  for (let i = 0; i < appIds.length; i += chunkSize) {
    const chunk = appIds.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (entry) => {
        try {
          const client = new StupidRacingTournamentClient({
            appId: BigInt(entry.appId),
            algorand,
            defaultSender: DEFAULT_SENDER,
          });
          const info = await client.send.getTournamentInfo({ args: [], sender: DEFAULT_SENDER });
          if (!info.return) {
            return null;
          }

          return {
            season: Number(info.return.season),
            appId: entry.appId,
            createdAtRound: entry.createdAtRound,
          };
        } catch {
          return null;
        }
      })
    );

    for (const result of results) {
      if (result && Number.isInteger(result.season) && result.season > 0) {
        candidates.push(result);
      }
    }
  }

  return candidates;
}

function dedupeBySeason(candidates: Array<{ season: number; appId: number; createdAtRound?: number }>) {
  const bySeason = new Map<number, { season: number; appId: number; createdAtRound?: number }>();

  for (const entry of candidates) {
    const current = bySeason.get(entry.season);
    if (!current) {
      bySeason.set(entry.season, entry);
      continue;
    }

    if ((entry.createdAtRound ?? 0) > (current.createdAtRound ?? 0)) {
      bySeason.set(entry.season, entry);
      continue;
    }

    if ((entry.createdAtRound ?? 0) === (current.createdAtRound ?? 0) && entry.appId > current.appId) {
      bySeason.set(entry.season, entry);
    }
  }

  return Array.from(bySeason.values()).sort((a, b) => a.season - b.season);
}

function markLatest(entries: Array<{ season: number; appId: string }>): SeasonDescriptor[] {
  const latestSeason = entries.length > 0 ? entries[entries.length - 1].season : null;
  return entries.map((entry) => ({
    ...entry,
    isLatest: entry.season === latestSeason,
  }));
}

export async function discoverSeasons(): Promise<SeasonDescriptor[]> {
  const adminAddress = await resolveAdminAddress();
  if (!adminAddress) {
    return [];
  }

  const createdApps = await listCreatedApplications(adminAddress);
  if (createdApps.length === 0) {
    return [];
  }

  const candidates = await probeSeasonApps(createdApps);
  if (candidates.length === 0) {
    return [];
  }

  const deduped = dedupeBySeason(candidates).map((entry) => ({
    season: entry.season,
    appId: String(entry.appId),
  }));

  return markLatest(deduped);
}

export async function getSeasonsWithFallback(): Promise<SeasonDescriptor[]> {
  const discovered = await discoverSeasons();
  if (discovered.length > 0) {
    return discovered;
  }

  const configured = listConfiguredSeasons();
  if (configured.length > 0) {
    return markLatest(
      configured.map((entry) => ({ season: entry.season, appId: entry.appId }))
    );
  }

  return [];
}
