import "server-only";

import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import {
  StupidRacingTournamentClient,
  type MatchResult,
  type TeamRegistration,
} from "@/lib/contracts/StupidRacingTournamentClient";
import { resolveSeasonEntry } from "@/lib/season-registry";

const DEFAULT_ALGOD = "https://testnet-api.algonode.cloud";
const DEFAULT_INDEXER = "https://testnet-idx.algonode.cloud";
const DEFAULT_SENDER =
  process.env.NEXT_PUBLIC_READ_ONLY_SENDER ||
  "CMYTBDMMKVKJSN4YO7BSVMBJCVTC2GBG6BY22Z4KKIUDNZGKUQI54MNTHU";

type TournamentQueryOptions = {
  season?: number;
  appId?: bigint | number | string;
};

type TeamEntry = {
  address: string;
  assetIds: number[];
  season: number;
  slotIndex: number;
};

type ChainMatch = {
  id: string;
  season: number;
  wallet_address: string;
  team_asset_ids: number[];
  match_id: string;
  log: {
    opponent_address: string;
    opponent_asset_ids: number[];
    winner_address: string;
    heats: null;
  };
  created_at: string;
};

function parseNodeUrl(urlInput: string, defaultPort: number) {
  const url = new URL(urlInput);
  return {
    server: `${url.protocol}//${url.hostname}`,
    port: Number(url.port || defaultPort),
  };
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

function createTournamentClient(options: TournamentQueryOptions = {}) {
  const algorand = getAlgorandClient();
  const resolved = resolveSeasonEntry(options);

  const client = new StupidRacingTournamentClient({
    appId: resolved.appId,
    algorand,
    defaultSender: DEFAULT_SENDER,
  });

  return { client, resolved };
}

function parseTeam(team: TeamRegistration): number[] {
  return [
    Number(team.assetId0),
    Number(team.assetId1),
    Number(team.assetId2),
    Number(team.assetId3),
    Number(team.assetId4),
  ];
}

function totalRoundsForBracket(bracketSize: number) {
  return Math.floor(Math.log2(bracketSize));
}

function syntheticTimestamp(roundIndex: number, matchIndex: number) {
  const base = Date.UTC(2026, 0, 1, 0, 0, 0);
  const offset = (roundIndex * 100 + matchIndex) * 1000;
  return new Date(base + offset).toISOString();
}

async function getTournamentInfoFromClient(client: StupidRacingTournamentClient, appId: bigint) {
  const info = await client.send.getTournamentInfo({ args: [], sender: DEFAULT_SENDER });
  if (!info.return) {
    throw new Error("Tournament info unavailable");
  }
  return {
    appId: appId.toString(),
    season: Number(info.return.season),
    bracketSize: Number(info.return.bracketSize),
    registeredCount: Number(info.return.registeredCount),
    state: Number(info.return.state),
  };
}

async function getTeamEntryFromClient(
  client: StupidRacingTournamentClient,
  season: number,
  address: string
): Promise<TeamEntry | null> {
  try {
    const response = await client.send.getTeam({
      args: { wallet: address },
      sender: DEFAULT_SENDER,
    });

    if (!response.return) {
      return null;
    }

    return {
      address,
      assetIds: parseTeam(response.return),
      season,
      slotIndex: Number(response.return.slotIndex),
    };
  } catch {
    return null;
  }
}

export async function getTournamentInfo(options: TournamentQueryOptions = {}) {
  const { client, resolved } = createTournamentClient(options);
  return getTournamentInfoFromClient(client, resolved.appId);
}

export async function getTeamEntry(address: string, options: TournamentQueryOptions = {}): Promise<TeamEntry | null> {
  const { client, resolved } = createTournamentClient(options);
  const info = await getTournamentInfoFromClient(client, resolved.appId);

  return getTeamEntryFromClient(client, info.season, address);
}

export async function listTeamEntries(options: TournamentQueryOptions = {}) {
  const { client, resolved } = createTournamentClient(options);
  const info = await getTournamentInfoFromClient(client, resolved.appId);
  const entries: TeamEntry[] = [];

  for (let i = 0; i < info.registeredCount; i += 1) {
    const slot = await client.send.getSlot({
      args: { slotIndex: BigInt(i) },
      sender: DEFAULT_SENDER,
    });
    const address = slot.return;
    if (!address) {
      continue;
    }

    const team = await getTeamEntryFromClient(client, info.season, address);
    if (!team) {
      continue;
    }
    entries.push(team);
  }

  return {
    appId: info.appId,
    season: info.season,
    entries,
  };
}

export async function listMatchResults(
  options: TournamentQueryOptions & { addressFilter?: string } = {}
) {
  const { client, resolved } = createTournamentClient(options);
  const info = await getTournamentInfoFromClient(client, resolved.appId);
  const rounds = totalRoundsForBracket(info.bracketSize);
  const teamCache = new Map<string, number[]>();
  const results: ChainMatch[] = [];

  const getTeamAssetIds = async (address: string) => {
    const cached = teamCache.get(address);
    if (cached) {
      return cached;
    }
    const team = await getTeamEntryFromClient(client, info.season, address);
    const assetIds = team?.assetIds ?? [];
    teamCache.set(address, assetIds);
    return assetIds;
  };

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    const matchesInRound = info.bracketSize / 2 ** (roundIndex + 1);
    for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex += 1) {
      const matchId = roundIndex * 100 + matchIndex;
      let result: MatchResult | undefined;
      try {
        const call = await client.send.getMatchResult({
          args: { matchId: BigInt(matchId) },
          sender: DEFAULT_SENDER,
        });
        result = call.return;
      } catch {
        continue;
      }

      if (!result) {
        continue;
      }

      const left = result.leftWallet;
      const right = result.rightWallet;
      const winner = result.winner;

      if (
        options.addressFilter &&
        left !== options.addressFilter &&
        right !== options.addressFilter &&
        winner !== options.addressFilter
      ) {
        continue;
      }

      const leftAssets = await getTeamAssetIds(left);
      const rightAssets = await getTeamAssetIds(right);

      results.push({
        id: `season-${info.season}-match-${matchId}`,
        season: info.season,
        wallet_address: left,
        team_asset_ids: leftAssets,
        match_id: `round-${roundIndex}-match-${matchIndex}`,
        log: {
          opponent_address: right,
          opponent_asset_ids: rightAssets,
          winner_address: winner,
          heats: null,
        },
        created_at: syntheticTimestamp(roundIndex, matchIndex),
      });
    }
  }

  return results.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
