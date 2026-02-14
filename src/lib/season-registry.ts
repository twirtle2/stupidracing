import "server-only";

export type SeasonRegistryEntry = {
  season: number;
  appId: bigint;
};

type ResolveSeasonOptions = {
  season?: number;
  appId?: bigint | number | string;
};

function toPositiveInt(input: string | number) {
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function toPositiveBigInt(input: string | number | bigint) {
  try {
    const value = BigInt(input);
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

function parseSeasonsEnv() {
  const raw = process.env.NEXT_PUBLIC_TOURNAMENT_SEASONS?.trim() || "";
  if (!raw) {
    return [] as SeasonRegistryEntry[];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("NEXT_PUBLIC_TOURNAMENT_SEASONS is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("NEXT_PUBLIC_TOURNAMENT_SEASONS must be a JSON object");
  }

  const entries: SeasonRegistryEntry[] = [];
  for (const [seasonKey, appIdValue] of Object.entries(parsed)) {
    const season = toPositiveInt(seasonKey);
    const appId = appIdValue !== undefined && appIdValue !== null
      ? toPositiveBigInt(appIdValue as string | number)
      : null;

    if (!season || !appId) {
      throw new Error(`Invalid season mapping entry: ${seasonKey}`);
    }

    entries.push({ season, appId });
  }

  entries.sort((a, b) => a.season - b.season);
  return entries;
}

function fallbackEntry() {
  const appIdRaw = process.env.NEXT_PUBLIC_TOURNAMENT_APP_ID?.trim() || "";
  if (!appIdRaw) {
    return null;
  }

  const appId = toPositiveBigInt(appIdRaw);
  if (!appId) {
    throw new Error("NEXT_PUBLIC_TOURNAMENT_APP_ID must be a positive integer");
  }

  const seasonRaw = process.env.NEXT_PUBLIC_TOURNAMENT_SEASON?.trim() || "1";
  const season = toPositiveInt(seasonRaw);
  if (!season) {
    throw new Error("NEXT_PUBLIC_TOURNAMENT_SEASON must be a positive integer");
  }

  return { season, appId };
}

export function getSeasonRegistry() {
  const entries = parseSeasonsEnv();
  if (entries.length > 0) {
    return entries;
  }

  const fallback = fallbackEntry();
  if (fallback) {
    return [fallback];
  }

  return [] as SeasonRegistryEntry[];
}

export function getLatestSeasonEntry() {
  const entries = getSeasonRegistry();
  if (entries.length === 0) {
    return null;
  }
  return entries[entries.length - 1];
}

export function resolveSeasonEntry(options: ResolveSeasonOptions = {}) {
  if (options.appId !== undefined) {
    const appId = toPositiveBigInt(options.appId);
    if (!appId) {
      throw new Error("Invalid appId");
    }
    const registry = getSeasonRegistry();
    const matched = registry.find((entry) => entry.appId === appId);
    return {
      season: matched?.season,
      appId,
    };
  }

  const registry = getSeasonRegistry();
  if (registry.length === 0) {
    throw new Error(
      "No tournament registry configured. Set NEXT_PUBLIC_TOURNAMENT_SEASONS or NEXT_PUBLIC_TOURNAMENT_APP_ID"
    );
  }

  if (options.season !== undefined) {
    const season = toPositiveInt(options.season);
    if (!season) {
      throw new Error("Invalid season");
    }

    const found = registry.find((entry) => entry.season === season);
    if (!found) {
      throw new Error(`Season ${season} is not configured`);
    }

    return {
      season: found.season,
      appId: found.appId,
    };
  }

  const latest = registry[registry.length - 1];
  return {
    season: latest.season,
    appId: latest.appId,
  };
}

export function listSeasons() {
  const registry = getSeasonRegistry();
  const latestSeason = registry.length > 0 ? registry[registry.length - 1].season : null;

  return registry.map((entry) => ({
    season: entry.season,
    appId: entry.appId.toString(),
    isLatest: entry.season === latestSeason,
  }));
}
