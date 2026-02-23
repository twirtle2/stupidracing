import "server-only";

import {
  StupidRacingTournamentClient,
  type MatchResult,
  type TeamRegistration,
} from "@/lib/contracts/StupidRacingTournamentClient";
import { createAlgorandClient } from "@/lib/algorand-client";
import { env } from "@/lib/config";
import { resolveSeasonEntry } from "@/lib/season-registry";

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

type ResolvedMeta = {
  resolvedAppId: string;
  resolvedSeason: number;
};

function createTournamentClient(options: TournamentQueryOptions = {}) {
  const algorand = createAlgorandClient();
  const resolved = resolveSeasonEntry(options);

  const client = new StupidRacingTournamentClient({
    appId: resolved.appId,
    algorand,
    defaultSender: env.readOnlySender,
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

async function getTournamentInfoFromClient(
  client: StupidRacingTournamentClient,
  appId: bigint
): Promise<ResolvedMeta & {
  season: number;
  bracketSize: number;
  registeredCount: number;
  state: number;
}> {
  const info = await client.send.getTournamentInfo({ args: [], sender: env.readOnlySender });
  if (!info.return) {
    throw new Error("Tournament info unavailable");
  }
  return {
    resolvedAppId: appId.toString(),
    resolvedSeason: Number(info.return.season),
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
      sender: env.readOnlySender,
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

export async function getTeamEntry(
  address: string,
  options: TournamentQueryOptions = {}
): Promise<ResolvedMeta & { entry: TeamEntry | null }> {
  const { client, resolved } = createTournamentClient(options);
  const info = await getTournamentInfoFromClient(client, resolved.appId);
  const entry = await getTeamEntryFromClient(client, info.season, address);

  return {
    resolvedAppId: info.resolvedAppId,
    resolvedSeason: info.resolvedSeason,
    entry,
  };
}

export async function listTeamEntries(options: TournamentQueryOptions = {}) {
  const { client, resolved } = createTournamentClient(options);
  const info = await getTournamentInfoFromClient(client, resolved.appId);
  const entries: TeamEntry[] = [];

  for (let i = 0; i < info.registeredCount; i += 1) {
    const slot = await client.send.getSlot({
      args: { slotIndex: BigInt(i) },
      sender: env.readOnlySender,
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
    resolvedAppId: info.resolvedAppId,
    resolvedSeason: info.resolvedSeason,
    entries,
  };
}

export async function listMatchResults(
  options: TournamentQueryOptions & { addressFilter?: string } = {}
): Promise<ResolvedMeta & { results: ChainMatch[] }> {
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
          sender: env.readOnlySender,
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

  return {
    resolvedAppId: info.resolvedAppId,
    resolvedSeason: info.resolvedSeason,
    results: results.sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}
