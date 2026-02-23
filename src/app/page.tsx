"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useWallet } from "@txnlab/use-wallet-react";
import { AlgoAmount } from "@algorandfoundation/algokit-utils/types/amount";
import { useTournamentContract } from "@/hooks/useTournamentContract";
import { StupidRacingTournamentFactory } from "@/lib/contracts/StupidRacingTournamentClient";
import { env } from "@/lib/config";

import { STUPIDHORSE_ASSETS, type StupidHorseAsset } from "@/lib/stupidhorse";
import { fetchNfdForAddresses, shortAddress } from "@/lib/nfd";


const BRACKET_SIZE_OPTIONS = [2, 4, 8, 16, 32, 64] as const;
const DEFAULT_BEACON_BY_NETWORK =
  env.network === "mainnet" ? "1615566206" : env.network === "testnet" ? "600011887" : "1";
const DEFAULT_BEACON_APP_ID = env.beaconAppId || DEFAULT_BEACON_BY_NETWORK;

type HorseProfile = {
  asset_id: number;
  name: string | null;
  description: string | null;
  season: number;
  stats?: Record<string, unknown> | null;
};

type RaceLogEntry = {
  left: number;
  right: number;
  leftRoll: number;
  rightRoll: number;
  status: string;
};

type Arc69Metadata = {
  description?: string;
  external_url?: string;
  attributes?: Array<{ trait_type?: string; value?: string }>;
};

type OwnedHorse = StupidHorseAsset & { metadata?: Arc69Metadata | null };

type TeamEntry = {
  address: string;
  assetIds: number[];
  horses: OwnedHorse[];
};

type MatchResult = {
  id: string;
  season: number;
  wallet_address: string | null;
  team_asset_ids: number[] | null;
  match_id: string | null;
  log: {
    opponent_address?: string | null;
    opponent_asset_ids?: number[] | null;
    winner_address?: string | null;
    heats?: RaceLogEntry[] | null;
  } | null;
  created_at: string;
};

type BracketMatchResult = {
  winnerAddress: string | null;
  score: { left: number; right: number };
  logs: RaceLogEntry[];
};

type SeasonDescriptor = {
  season: number;
  appId: string;
  isLatest: boolean;
};

const READ_ONLY_SENDER = env.readOnlySender;
const NETWORK_LABEL = env.networkLabel;
const ADMIN_CONTROLLER_NFD = "twirtle2.algo";
const TOURNAMENT_STATE_LABELS: Record<number, string> = {
  0: "Created",
  1: "Open",
  2: "Locked",
  3: "Racing",
  4: "Completed",
  5: "Cancelled",
};

export default function Home() {
  const { wallets, activeAddress } = useWallet();
  const [seasonOptions, setSeasonOptions] = useState<SeasonDescriptor[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const latestSeason = useMemo(
    () => seasonOptions.find((option) => option.isLatest)?.season ?? null,
    [seasonOptions]
  );
  const activeSeason = selectedSeason ?? latestSeason ?? 1;
  const selectedSeasonMeta = useMemo(
    () => seasonOptions.find((option) => option.season === activeSeason) ?? null,
    [activeSeason, seasonOptions]
  );
  const selectedAppId = useMemo(() => {
    if (!selectedSeasonMeta) return null;
    try {
      return BigInt(selectedSeasonMeta.appId);
    } catch {
      return null;
    }
  }, [selectedSeasonMeta]);
  const isLatestSeason = latestSeason === null || activeSeason === latestSeason;
  const hasSeasonRegistry = seasonOptions.length > 0;
  const contract = useTournamentContract(selectedAppId);
  const [ownedHorses, setOwnedHorses] = useState<OwnedHorse[]>([]);
  const [profiles, setProfiles] = useState<Record<number, HorseProfile>>({});
  const [drafts, setDrafts] = useState<
    Record<number, { name: string; description: string }>
  >({});
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [creatingSeason, setCreatingSeason] = useState(false);
  const [seasonState, setSeasonState] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<number[]>([]);
  const [teams, setTeams] = useState<Record<string, TeamEntry>>({});
  const [matchHistory, setMatchHistory] = useState<MatchResult[]>([]);
  const [bracketSize, setBracketSize] = useState<(typeof BRACKET_SIZE_OPTIONS)[number]>(8);
  const [bracketSlots, setBracketSlots] = useState<string[]>(Array(8).fill(""));
  const syncInProgress = React.useRef(false);
  const lastSyncTime = React.useRef(0);
  const teamsCache = React.useRef<Record<string, TeamEntry>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [stableAddressOverride, setStableAddressOverride] = useState("");
  const [nfdMap, setNfdMap] = useState<Record<string, string>>({});
  const [view, setView] = useState<"stable" | "bracket">("stable");
  const [hasMounted, setHasMounted] = useState(false);
  const [bracketResults, setBracketResults] = useState<Record<string, BracketMatchResult>>({});
  const [simulatingMatch, setSimulatingMatch] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isPopulating, setIsPopulating] = useState(false);
  const [bracketTab, setBracketTab] = useState<"assign" | "bracket" | "history">("assign");
  const loadSeasons = useCallback(async () => {
    const response = await fetch("/api/seasons");
    if (!response.ok) {
      throw new Error("Failed to load season registry");
    }

    const data = (await response.json()) as { seasons?: SeasonDescriptor[] };
    const seasons = data.seasons ?? [];
    setSeasonOptions(seasons);
    setSelectedSeason((previous) => {
      if (previous && seasons.some((entry) => entry.season === previous)) {
        return previous;
      }
      return seasons.find((entry) => entry.isLatest)?.season ?? seasons.at(-1)?.season ?? 1;
    });
    return seasons;
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        await loadSeasons();
      } catch (err) {
        if (mounted) {
          setError((err as Error).message);
        }
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, [loadSeasons]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    teamsCache.current = {};
    setTeams({});
    setBracketResults({});
    setMatchHistory([]);
    setTeam([]);
    setBracketSize(8);
    setBracketSlots(Array(8).fill(""));
    setSeasonState(null);
  }, [activeSeason]);



  const stableAddress = stableAddressOverride.trim() || activeAddress || "";
  const connectedNfd = activeAddress ? (nfdMap[activeAddress] ?? "").toLowerCase() : "";
  const canUseAdminMode = connectedNfd === ADMIN_CONTROLLER_NFD;
  const isAuthorizedAdmin = Boolean(
    activeAddress &&
    env.tournamentAdminAddress &&
    activeAddress === env.tournamentAdminAddress
  );
  const activeAppIdParam = selectedSeasonMeta?.appId || "";
  const seasonQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("season", String(activeSeason));
    if (activeAppIdParam) {
      params.set("appId", activeAppIdParam);
    }
    return params.toString();
  }, [activeSeason, activeAppIdParam]);

  const displayAddress = (address?: string | null) => {
    if (!address) {
      return "";
    }
    return nfdMap[address] ?? shortAddress(address);
  };

  const formatRunMatchError = (error: unknown) => {
    const message = (error as Error)?.message || String(error);
    const lower = message.toLowerCase();

    if (lower.includes("fee") || lower.includes("pool")) {
      return `${message} (Hint: provide extra fee budget for the beacon inner call.)`;
    }
    if (lower.includes("beacon") || lower.includes("app") || lower.includes("log")) {
      return `${message} (Hint: verify the configured randomness beacon app ID for this season.)`;
    }
    return message;
  };

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      ownedHorses.forEach((horse) => {
        const profile = profiles[horse.assetId];
        if (!next[horse.assetId]) {
          next[horse.assetId] = {
            name: profile?.name ?? "",
            description: profile?.description ?? "",
          };
        }
      });
      return next;
    });
  }, [ownedHorses, profiles]);

  useEffect(() => {
    const addresses = new Set<string>();
    if (stableAddress) addresses.add(stableAddress);
    if (activeAddress) addresses.add(activeAddress);
    bracketSlots.forEach((slot) => slot && addresses.add(slot));
    matchHistory.forEach((match) => {
      if (match.wallet_address) addresses.add(match.wallet_address);
      const opponent = match.log?.opponent_address;
      if (opponent) addresses.add(opponent);
      const winner = match.log?.winner_address;
      if (winner) addresses.add(winner);
    });

    const fetchNfds = async () => {
      const map = await fetchNfdForAddresses(Array.from(addresses));
      setNfdMap(map);
    };

    fetchNfds();
  }, [stableAddress, activeAddress, bracketSlots, matchHistory]);

  useEffect(() => {
    if (!canUseAdminMode && isAdmin) {
      setIsAdmin(false);
    }
  }, [canUseAdminMode, isAdmin]);


  const teamAssets = useMemo(
    () => ownedHorses.filter((horse) => team.includes(horse.assetId)),
    [ownedHorses, team]
  );

  const toggleTeam = (assetId: number) => {
    setTeam((prev) => {
      if (prev.includes(assetId)) {
        return prev.filter((id) => id !== assetId);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, assetId];
    });
  };

  const clearBracket = () => {
    setBracketSlots(Array(bracketSize).fill(""));
  };

  const autoPopulateBracket = async () => {
    if (!isAdmin) {
      return;
    }
    if (!isLatestSeason) {
      setError("Auto-populate is disabled for past seasons.");
      return;
    }
    setIsPopulating(true);
    setError(null);
    try {
      const sourceImages = STUPIDHORSE_ASSETS.length > 0
        ? STUPIDHORSE_ASSETS
        : [{ assetId: 1, imageUrl: "https://ipfs.io/ipfs/bafkreif4lli2jm3wqit5z7y2exbh4wwxwy5q4laxshjnkhzf4ptgox3nla", name: "Horse", unitName: "HORSE" }];
      const nextSlots: string[] = [];
      const nextTeams: Record<string, TeamEntry> = {};

      for (let slotIndex = 0; slotIndex < bracketSize; slotIndex += 1) {
        const address =
          slotIndex === 0 && activeAddress
            ? activeAddress
            : `dummy-slot-${String(slotIndex + 1).padStart(2, "0")}.algo`;
        const assetIds = Array.from(
          { length: 5 },
          (_, horseIndex) => 900_000_000 + slotIndex * 10 + horseIndex
        );
        const horses: OwnedHorse[] = assetIds.map((assetId, horseIndex) => {
          const imageSeed = sourceImages[(slotIndex * 5 + horseIndex) % sourceImages.length];
          return {
            assetId,
            name: `Dummy Horse ${slotIndex + 1}-${horseIndex + 1}`,
            unitName: `DMY${slotIndex + 1}${horseIndex + 1}`,
            imageUrl: imageSeed.imageUrl,
          };
        });
        nextSlots.push(address);
        nextTeams[address] = {
          address,
          assetIds,
          horses,
        };
      }

      teamsCache.current = nextTeams;
      setBracketSlots(nextSlots);
      setTeams(nextTeams);
      setBracketResults({});
      setMatchHistory([]);

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsPopulating(false);
    }
  };



  const loadTeamForAddress = useCallback(async (address: string) => {
    if (!address) return null;
    if (teamsCache.current[address]) {
      return teamsCache.current[address];
    }

    const params = new URLSearchParams();
    params.set("address", address);
    params.set("season", String(activeSeason));
    if (activeAppIdParam) {
      params.set("appId", activeAppIdParam);
    }
    const response = await fetch(`/api/team-entry?${params.toString()}`);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      entry: { asset_ids: number[] } | null;
    };
    if (!data.entry?.asset_ids) {
      return null;
    }

    const assetsRes = await fetch("/api/asset-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetIds: data.entry.asset_ids,
        includeMetadata: true,
      }),
    });
    if (!assetsRes.ok) {
      return null;
    }
    const assetsData = (await assetsRes.json()) as { assets: OwnedHorse[] };

    const teamEntry = {
      address,
      assetIds: data.entry.asset_ids,
      horses: assetsData.assets,
    } as TeamEntry;

    teamsCache.current[address] = teamEntry;
    return teamEntry;
  }, [activeAppIdParam, activeSeason]);

  const assignBracketAddress = useCallback(
    async (slotIndex: number, address: string) => {
      const normalized = address.trim();
      if (
        normalized &&
        bracketSlots.some(
          (slot, index) => index !== slotIndex && slot === normalized
        )
      ) {
        setError("Owner already has a bracket slot.");
        return;
      }

      setBracketSlots((prev) => {
        const next = [...prev];
        next[slotIndex] = normalized;
        return next;
      });
      if (!normalized) {
        return;
      }
      const teamEntry = await loadTeamForAddress(normalized);
      if (teamEntry) {
        setTeams((prev) => ({ ...prev, [normalized]: teamEntry }));
      }
    },
    [bracketSlots, loadTeamForAddress]
  );

  useEffect(() => {
    if (!hasSeasonRegistry) {
      return;
    }
    if (!activeAddress) {
      return;
    }
    if (bracketSlots[0]) {
      return;
    }
    assignBracketAddress(0, activeAddress);
  }, [activeAddress, bracketSlots, assignBracketAddress, hasSeasonRegistry]);

  useEffect(() => {
    if (!hasSeasonRegistry) {
      return;
    }
    if (!stableAddress) {
      setOwnedHorses([]);
      setProfiles({});
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const ownedRes = await fetch("/api/owned-horses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: stableAddress }),
        });

        if (!ownedRes.ok) {
          throw new Error("Failed to load stable");
        }

        const ownedData = (await ownedRes.json()) as {
          assets: OwnedHorse[];
        };

        setOwnedHorses(ownedData.assets ?? []);

        const profilesRes = await fetch(
          `/api/horse-profile?address=${stableAddress}&${seasonQuery}`
        );

        if (!profilesRes.ok) {
          throw new Error("Failed to load profiles");
        }

        const profileData = (await profilesRes.json()) as {
          profiles: HorseProfile[];
          persistenceConfigured?: boolean;
        };

        const byId: Record<number, HorseProfile> = {};
        profileData.profiles.forEach((profile) => {
          byId[profile.asset_id] = profile;
        });
        setProfiles(byId);

        if (profileData.persistenceConfigured === false) {
          console.info("[Profiles] Supabase not configured; profile persistence disabled.");
        }

        const teamRes = await fetch(
          `/api/team-entry?address=${stableAddress}&${seasonQuery}`
        );
        if (teamRes.ok) {
          const teamData = (await teamRes.json()) as {
            entry: { asset_ids: number[] } | null;
          };
          if (teamData.entry?.asset_ids) {
            setTeam(teamData.entry.asset_ids);
            if (stableAddress === activeAddress) {
              const loadedTeam = await loadTeamForAddress(stableAddress);
              if (loadedTeam) {
                setTeams((prev) => ({ ...prev, [stableAddress]: loadedTeam }));
              }
            }
          }
        }

        const historyUrl = view === "bracket"
          ? `/api/race-results/get?${seasonQuery}`
          : `/api/race-results/get?address=${stableAddress}&${seasonQuery}`;

        const historyRes = await fetch(historyUrl);
        if (historyRes.ok) {
          const historyData = (await historyRes.json()) as {
            results: MatchResult[];
          };
          setMatchHistory(historyData.results ?? []);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [stableAddress, activeAddress, loadTeamForAddress, refreshTrigger, view, activeSeason, hasSeasonRegistry, seasonQuery]);


  // Poll contract for global tournament state
  useEffect(() => {
    if (!contract) return;
    let mounted = true;

    const fetchContractState = async () => {
      if (syncInProgress.current) return;

      // Don't sync more than once every 5 seconds even if effect re-runs
      const now = Date.now();
      if (now - lastSyncTime.current < 5000) return;

      syncInProgress.current = true;
      lastSyncTime.current = now;

      try {
        const sender = activeAddress || READ_ONLY_SENDER;
        const info = await contract.getTournamentInfo({ sender, args: [] });
        const size = Number(info.registeredCount);
        const totalSlots = Number(info.bracketSize);
        const stateValue = Number(info.state);

        if (mounted) {
          if (BRACKET_SIZE_OPTIONS.includes(totalSlots as (typeof BRACKET_SIZE_OPTIONS)[number])) {
            setBracketSize(totalSlots as (typeof BRACKET_SIZE_OPTIONS)[number]);
          }
          setSeasonState(Number.isFinite(stateValue) ? stateValue : null);
        }

        const slotPromises = [];
        for (let i = 0; i < size; i++) {
          slotPromises.push(contract.getSlot({ sender, args: { slotIndex: BigInt(i) } }));
        }

        const slotAddresses = await Promise.all(slotPromises);

        if (mounted) {
          setBracketSlots(() => {
            const next = Array(totalSlots).fill("");
            slotAddresses.forEach((addr, i) => {
              next[i] = addr;
            });
            return next;
          });

          // Fetch teams only for new addresses or if not in cache
          const teamResults = await Promise.all(
            slotAddresses.map((addr) => loadTeamForAddress(addr))
          );

          setTeams((prev) => {
            const next = { ...prev };
            slotAddresses.forEach((addr, i) => {
              if (teamResults[i]) next[addr] = teamResults[i];
            });
            return next;
          });
        }
      } catch (e) {
        console.error("[Contract] Failed to sync state:", e);
      } finally {
        syncInProgress.current = false;
      }
    };

    fetchContractState();
    const interval = setInterval(() => {
      if (view === "bracket") fetchContractState();
    }, 15000); // Sync every 15s in bracket view
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [contract, refreshTrigger, loadTeamForAddress, view, activeAddress]);


  const setBracketSlotInput = (slotIndex: number, address: string) => {
    setBracketSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = address;
      return next;
    });
  };

  const saveProfile = async (
    assetId: number,
    name: string,
    description: string
  ) => {
    if (!activeAddress) {
      return;
    }

    const response = await fetch("/api/horse-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: activeAddress,
        assetId,
        name,
        description,
        season: activeSeason,
      }),
    });

    if (!response.ok) {
      setError("Failed to save profile");
      return;
    }

    const data = (await response.json()) as { profile: HorseProfile };
    setProfiles((prev) => ({ ...prev, [assetId]: data.profile }));
  };

  const createNextSeasonOnChain = async () => {
    if (!activeAddress || !contract) {
      setError("Connect admin wallet to create a new season.");
      return;
    }
    if (!env.tournamentAdminAddress) {
      setError("Set NEXT_PUBLIC_TOURNAMENT_ADMIN_ADDRESS to enable admin-only season creation.");
      return;
    }
    if (!isAuthorizedAdmin) {
      setError("Connected wallet is not the configured tournament admin.");
      return;
    }
    if (!isLatestSeason) {
      setError("Switch to the latest season before creating the next season.");
      return;
    }

    const nextSeason = (latestSeason ?? activeSeason) + 1;
    const bracketInput = window.prompt(
      `Bracket size for Season ${nextSeason} (${BRACKET_SIZE_OPTIONS.join(", ")})`,
      String(bracketSize)
    );
    if (!bracketInput) {
      return;
    }

    const parsedBracket = Number(bracketInput);
    if (!BRACKET_SIZE_OPTIONS.includes(parsedBracket as (typeof BRACKET_SIZE_OPTIONS)[number])) {
      setError("Invalid bracket size. Use one of: 2, 4, 8, 16, 32, 64.");
      return;
    }
    const nextBracketSize = parsedBracket as (typeof BRACKET_SIZE_OPTIONS)[number];

    const beaconInput = window.prompt(
      `Randomness Beacon App ID for Season ${nextSeason}`,
      DEFAULT_BEACON_APP_ID
    );
    if (!beaconInput) {
      return;
    }

    let beaconAppId: bigint;
    try {
      beaconAppId = BigInt(beaconInput);
      if (beaconAppId <= 0n) {
        throw new Error("Beacon App ID must be positive");
      }
    } catch {
      setError("Invalid beacon app ID.");
      return;
    }

    setCreatingSeason(true);
    setError(null);
    try {
      const factory = new StupidRacingTournamentFactory({
        algorand: contract.algorand,
        defaultSender: activeAddress,
      });

      const created = await factory.send.create.create({
        sender: activeAddress,
        args: {
          season: BigInt(nextSeason),
          bracketSize: BigInt(nextBracketSize),
          beaconAppId,
        },
      });

      try {
        await contract.algorand.send.payment({
          sender: activeAddress,
          receiver: created.appClient.appAddress,
          amount: AlgoAmount.Algos(2),
        });
      } catch (fundError) {
        console.warn("Season app funding skipped/failed:", fundError);
      }

      try {
        await created.appClient.send.openRegistration({
          sender: activeAddress,
          args: {},
        });
      } catch (openError) {
        console.warn("Open registration failed:", openError);
      }

      const newAppId = created.appClient.appId.toString();
      setSeasonOptions((previous) => {
        const withoutNext = previous.filter((entry) => entry.season !== nextSeason);
        const next = [
          ...withoutNext.map((entry) => ({ ...entry, isLatest: false })),
          { season: nextSeason, appId: newAppId, isLatest: true },
        ].sort((a, b) => a.season - b.season);
        return next;
      });
      setSelectedSeason(nextSeason);
      setBracketSize(nextBracketSize);
      setBracketSlots(Array(nextBracketSize).fill(""));
      setRefreshTrigger((prev) => prev + 1);

      window.setTimeout(() => {
        void loadSeasons();
      }, 4000);
      alert(`Season ${nextSeason} created (App ID ${newAppId}) and set active.`);
    } catch (err) {
      setError(`Failed to create new season: ${(err as Error).message}`);
    } finally {
      setCreatingSeason(false);
    }
  };

  const registerTeamOnChain = async () => {
    console.log("[Register] clicked", { activeAddress, contract: !!contract, teamLen: team.length });

    if (!activeAddress) {
      setError("Connect your wallet first (tap 'Connect Wallet' in the header).");
      return;
    }
    if (!contract) {
      setError("Contract client not ready — check browser console for [TournamentContract] errors and try refreshing.");
      return;
    }
    if (!isLatestSeason) {
      setError("Team registration is disabled for past seasons.");
      return;
    }
    if (team.length !== 5) {
      setError("Select exactly 5 horses before registering.");
      return;
    }

    setRegistering(true);
    setError(null);
    try {
      const args = {
        assetId0: BigInt(team[0]),
        assetId1: BigInt(team[1]),
        assetId2: BigInt(team[2]),
        assetId3: BigInt(team[3]),
        assetId4: BigInt(team[4]),
      };
      console.log("[Register] sending registerTeam", args);

      await contract.send.registerTeam({
        sender: activeAddress,
        args,
        // The generated client type does not expose foreign assets yet; runtime supports it.
        assets: team.map((assetId) => BigInt(assetId)),
      } as unknown as Parameters<typeof contract.send.registerTeam>[0]);

      alert(`Registration successful on ${NETWORK_LABEL}!`);

      // Refresh global state
      setRefreshTrigger((prev) => prev + 1);

    } catch (e: unknown) {
      console.error("[Register] error:", e);
      const err = e as Error;
      setError("Registration failed: " + (err.message || String(e)));
    } finally {
      setRegistering(false);
    }
  };

  const bracketSlotsArray = useMemo(() => {
    return Array.from({ length: bracketSize }, (_, index) => {
      const address = bracketSlots[index];
      const teamEntry = address ? teams[address] : null;
      return { slotIndex: index, address, teamEntry };
    });
  }, [bracketSize, bracketSlots, teams]);

  const bracketRounds = useMemo(() => {
    const rounds: Array<{ name: string; matches: number[] }> = [];
    let matchCount = bracketSize / 2;
    const roundName =
      bracketSize === 64
        ? "Round of 64"
        : bracketSize === 32
        ? "Round of 32"
        : bracketSize === 16
          ? "Round of 16"
          : bracketSize === 8
            ? "Quarterfinals"
            : bracketSize === 4
              ? "Semifinals"
              : "Final";
    let roundIndex = 0;
    while (matchCount >= 1) {
      rounds.push({
        name:
          roundIndex === 0
            ? roundName
            : matchCount === 4
              ? "Quarterfinals"
              : matchCount === 2
                ? "Semifinals"
                : matchCount === 1
                  ? "Final"
                  : `Round ${roundIndex + 1}`,
        matches: Array.from({ length: matchCount }, (_, idx) => idx),
      });
      matchCount = Math.floor(matchCount / 2);
      roundIndex += 1;
    }
    return rounds;
  }, [bracketSize]);

  const getRoundParticipant = useCallback((roundIndex: number, matchIndex: number, slotIndex: number): string | null => {
    if (roundIndex === 0) {
      const actualSlotIndex = matchIndex * 2 + slotIndex;
      return bracketSlots[actualSlotIndex] || null;
    }
    const prevRoundIndex = roundIndex - 1;
    const prevMatchIndex = matchIndex * 2 + slotIndex;
    const prevResult = bracketResults[`round-${prevRoundIndex}-match-${prevMatchIndex}`];
    return prevResult?.winnerAddress || null;
  }, [bracketSlots, bracketResults]);

  const runBracketMatch = async (roundIndex: number, matchIndex: number) => {
    const addressA = getRoundParticipant(roundIndex, matchIndex, 0);
    const addressB = getRoundParticipant(roundIndex, matchIndex, 1);
    if (!addressA || !addressB) return;

    const matchId = `round-${roundIndex}-match-${matchIndex}`;
    setSimulatingMatch(matchId);

    try {
      let teamA: TeamEntry | undefined = teams[addressA];
      let teamB: TeamEntry | undefined = teams[addressB];

      if (!teamA) teamA = (await loadTeamForAddress(addressA)) || undefined;
      if (!teamB) teamB = (await loadTeamForAddress(addressB)) || undefined;

      if (!teamA || !teamB) {
        setError(`Failed to load teams for bracket match: ${!teamA ? addressA : ""} ${!teamB ? addressB : ""}`);
        return;
      }

      if (!contract || !activeAddress) {
        setError("Connect an admin wallet to run on-chain matches.");
        return;
      }
      if (!env.tournamentAdminAddress) {
        setError("Set NEXT_PUBLIC_TOURNAMENT_ADMIN_ADDRESS to enforce admin match execution.");
        return;
      }
      if (!isAuthorizedAdmin) {
        setError("Connected wallet is not the configured tournament admin.");
        return;
      }
      if (!isLatestSeason) {
        setError("On-chain match execution is disabled for past seasons.");
        return;
      }

      await contract.send.runMatch({
        sender: activeAddress,
        args: {
          roundIndex: BigInt(roundIndex),
          matchIndex: BigInt(matchIndex),
        },
        extraFee: AlgoAmount.MicroAlgos(1000),
      });

      const chainResult = await contract.getMatchResult({
        sender: activeAddress,
        args: { matchId: BigInt(roundIndex * 100 + matchIndex) },
      });

      if (!chainResult) {
        setError("Match completed on-chain but result could not be read.");
        return;
      }

      const leftWins = Number(chainResult.leftScore);
      const rightWins = Number(chainResult.rightScore);
      const winnerAddress = chainResult.winner;

      setBracketResults(prev => ({
        ...prev,
        [matchId]: {
          winnerAddress,
          score: { left: leftWins, right: rightWins },
          logs: [],
        }
      }));
      setRefreshTrigger(prev => prev + 1);

    } catch (err) {
      setError(`On-chain match failed: ${formatRunMatchError(err)}`);
    } finally {
      setSimulatingMatch(null);
    }



  };




  if (!hasMounted) {
    return (
      <main className="min-h-screen items-center justify-center flex">
        <div className="animate-pulse text-[var(--accent)] font-bold tracking-widest text-xl">
          LOADING STUPIDHORSE...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 lg:px-12">

      <section className="mx-auto flex max-w-6xl flex-col gap-10">
        <header className="sticky top-4 z-20 rounded-3xl border border-white/10 bg-black/50 px-8 py-5 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-x-8">
            <div className="flex flex-col min-w-0">
              <h1 className="text-2xl font-black uppercase tracking-tighter md:text-3xl bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent whitespace-nowrap">
                StupidHorse Racing
              </h1>
              <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.35em] text-[var(--muted)] opacity-70 max-w-[280px]">
                You can lead a horse to water, but you can’t stop it from jumping off the cliff.
              </p>
            </div>

            <nav className="flex items-center gap-8 flex-shrink-0">
              <button
                onClick={() => setView("stable")}
                className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${view === "stable" ? "text-[var(--accent)] scale-110" : "text-[var(--muted)] hover:text-white"
                  }`}
              >
                Your Stable
              </button>
              <button
                onClick={() => setView("bracket")}
                className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${view === "bracket" ? "text-[var(--accent)] scale-110" : "text-[var(--muted)] hover:text-white"
                  }`}
              >
                Tournament Bracket
              </button>
            </nav>

            <div className="flex items-center gap-6 flex-shrink-0">
              {canUseAdminMode && (
                <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                  <span>User</span>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      className="peer sr-only"
                      type="checkbox"
                      checked={isAdmin}
                      onChange={(event) => setIsAdmin(event.target.checked)}
                    />
                    <div className="h-5 w-10 rounded-full bg-white/10 ring-1 ring-white/10 transition-colors peer-checked:bg-[var(--accent)]" />
                    <div className="absolute left-1 top-1 h-3 w-3 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                  </label>
                  <span>Admin</span>
                </div>
              )}

              <button
                className={`rounded-full border px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeAddress
                  ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-[var(--accent)]/20"
                  : "border-white/10 bg-white/5 text-white hover:border-white/40 hover:bg-white/10"
                  }`}
                onClick={() => setConnectOpen((prev) => !prev)}
              >
                {activeAddress ? displayAddress(activeAddress) : "Connect Wallet"}
              </button>

              {connectOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-white/10 bg-black/95 p-2 shadow-2xl z-50 transition-all">
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
                    Choose Wallet
                  </p>
                  {wallets.map((wallet) => (
                    <button
                      key={wallet.walletKey}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 transition-colors"
                      onClick={() => {
                        setConnectOpen(false);
                        if (wallet.isConnected) {
                          wallet.disconnect();
                        } else {
                          wallet.connect();
                        }

                      }}
                    >
                      <div className="flex items-center gap-2">
                        {wallet.metadata.icon ? (
                          <Image
                            src={wallet.metadata.icon}
                            alt={wallet.metadata.name}
                            width={20}
                            height={20}
                            className="rounded-sm"
                          />
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-white/20" />
                        )}
                        <span>{wallet.metadata.name}</span>
                      </div>
                      {wallet.metadata.name === displayAddress(activeAddress) && (
                        <div className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
                      )}

                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex justify-center -mt-6 sticky top-28 z-10 pointer-events-none">
          <div className="pointer-events-auto">

          </div>
        </div>







        {error && (
          <div className="rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {view === "stable" && (
          <section
            id="stable"
            className="rounded-3xl border border-white/10 bg-black/40 p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Your Stable</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {loading
                    ? "Scanning blockchain holdings..."
                    : `Managing ${ownedHorses.length} stupid horses.`}

                </p>
                {stableAddress && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 w-fit border border-white/10">
                    <span className="text-[10px] uppercase tracking-widest text-[var(--muted)]">Viewing:</span>
                    <span className="text-sm font-mono text-[var(--accent)]">{displayAddress(stableAddress)}</span>
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <input
                      className="w-64 rounded-full border border-white/10 bg-black/60 px-5 py-3 text-xs text-white placeholder:text-white/20 focus:border-[var(--accent)]/50 focus:outline-none transition-all"
                      placeholder="Test with another address..."
                      value={stableAddressOverride}
                      onChange={(e) => setStableAddressOverride(e.target.value)}
                    />
                    {stableAddressOverride && (
                      <button
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white"
                        onClick={() => setStableAddressOverride("")}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <button
                    className="group flex items-center gap-2 rounded-full border border-[var(--accent)]/30 px-6 py-3 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all"
                    onClick={() => {
                      window.location.reload();
                    }}

                  >
                    <svg className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh Stable
                  </button>
                </div>
              )}
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">

              {ownedHorses.map((horse) => {
                const profile = profiles[horse.assetId];
                const draft = drafts[horse.assetId] ?? {
                  name: profile?.name ?? "",
                  description: profile?.description ?? "",
                };
                const stats = (profile?.stats ?? {}) as {
                  wins?: number;
                  losses?: number;
                  cliffs?: number;
                };
                return (
                  <div
                    key={horse.assetId}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        {horse.unitName}
                      </span>
                      <button
                        className={`rounded-full border px-3 py-1 text-xs ${team.includes(horse.assetId)
                          ? "border-[var(--accent)] text-[var(--accent)]"
                          : "border-white/20 text-white"
                          }`}
                        onClick={() => toggleTeam(horse.assetId)}
                      >
                        {team.includes(horse.assetId) ? "In Team" : "Pick"}
                      </button>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-xl">
                      <Image
                        src={horse.imageUrl}
                        alt={horse.name}
                        width={512}
                        height={512}
                        className="h-48 w-full object-cover"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    </div>
                    <h3 className="mt-4 text-2xl">{horse.name}</h3>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                      <span>Wins: {String(stats.wins ?? 0)}</span>
                      <span>Losses: {String(stats.losses ?? 0)}</span>
                      <span>Cliffs: {String(stats.cliffs ?? 0)}</span>
                    </div>
                    {horse.metadata?.attributes && horse.metadata.attributes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {horse.metadata.attributes.slice(0, 6).map((attr, index) => (
                          <span
                            key={`${horse.assetId}-attr-${index}`}
                            className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-[var(--muted)]"
                          >
                            {attr.trait_type ?? "Trait"}: {attr.value ?? "-"}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 grid gap-2">
                      <input
                        className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm"
                        placeholder="Stable name"
                        value={draft.name}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [horse.assetId]: {
                              name: event.target.value,
                              description: draft.description,
                            },
                          }))
                        }
                        onBlur={() =>
                          saveProfile(
                            horse.assetId,
                            draft.name,
                            draft.description
                          )
                        }
                      />
                      <textarea
                        className="min-h-[72px] w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm"
                        placeholder="Bio / notes"
                        value={draft.description}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [horse.assetId]: {
                              name: draft.name,
                              description: event.target.value,
                            },
                          }))
                        }
                        onBlur={() =>
                          saveProfile(
                            horse.assetId,
                            draft.name,
                            draft.description
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {view === "bracket" && (
          <div className="space-y-10">
            <section className={`grid gap-6 ${isAdmin ? "lg:grid-cols-1" : "lg:grid-cols-[1fr_1fr]"}`}>
              {!isAdmin && activeAddress && (
                <div className="rounded-3xl border border-white/10 bg-black/40 p-6">
                  <h2 className="text-2xl">Tournament Team</h2>
                  <p className="text-sm text-[var(--muted)]">
                    Select exactly 5 horses for this season’s bracket.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {teamAssets.map((horse) => (
                      <span
                        key={horse.assetId}
                        className="rounded-full border border-[var(--accent-2)]/60 px-3 py-1 text-xs text-[var(--accent-2)]"
                      >
                        {horse.name}
                      </span>
                    ))}
                  </div>
                  <div className="mt-6 flex items-center gap-3">
                    <button
                      className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={registerTeamOnChain}
                      disabled={registering || team.length !== 5 || !isLatestSeason}
                      title={!contract ? "Contract not connected" : !activeAddress ? "Connect wallet first" : !isLatestSeason ? "Registration is only available for the latest season" : team.length !== 5 ? "Select 5 horses" : "Register team on-chain"}
                    >
                      {registering ? "Registering…" : "Register"}
                    </button>
                    <span className="text-sm text-[var(--muted)]">
                      {team.length}/5 selected
                    </span>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter text-[var(--accent)]">
                    Tournament Hub
                  </h2>
                  <div className="mt-1 flex items-center gap-3 text-xs font-bold tracking-widest text-[var(--muted)]">
                    <span>Season {activeSeason}</span>
                    <span>•</span>
                    <span>{bracketSize} Teams</span>
                    <span>•</span>
                    <span>One Champion</span>
                    {seasonState !== null && (
                      <>
                        <span>•</span>
                        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-white">
                          {TOURNAMENT_STATE_LABELS[seasonState] ?? `State ${seasonState}`}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">
                      Season
                    </label>
                    <select
                      value={activeSeason}
                      onChange={(event) => setSelectedSeason(Number(event.target.value))}
                      className="rounded-lg border border-white/15 bg-black/40 px-3 py-1 text-xs font-bold text-white outline-none focus:border-[var(--accent)]"
                    >
                      {seasonOptions
                        .slice()
                        .sort((a, b) => b.season - a.season)
                        .map((option) => (
                          <option key={option.season} value={option.season}>
                            Season {option.season}{option.isLatest ? " (Latest)" : ""}
                          </option>
                        ))}
                    </select>
                    {!isLatestSeason && (
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                        Read-only season
                      </span>
                    )}
                  </div>
                  {!contract && (
                    <div className="mt-2 text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded inline-block">
                      Contract not connected on {NETWORK_LABEL} (check env config)
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex flex-wrap gap-4 items-center bg-white/5 p-4 rounded-2xl border border-white/10 ring-1 ring-white/5">
                    <div className="text-[10px] uppercase font-black tracking-widest text-[var(--muted)] border-r border-white/10 pr-4 mr-2">
                      Admin Widget
                    </div>
                    <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-white/5">
                      {BRACKET_SIZE_OPTIONS.map((size) => (
                        <button
                          key={size}
                          onClick={() => setBracketSize(size)}
                          className={`px-3 py-1 text-[9px] font-bold rounded-lg transition-all ${bracketSize === size ? "bg-[var(--accent)] text-black shadow-[0_0_12px_var(--accent)]" : "text-[var(--muted)] hover:text-white"}`}
                        >
                          {size}P
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        if (!contract) return;
                        if (!env.tournamentAdminAddress) {
                          alert("Set NEXT_PUBLIC_TOURNAMENT_ADMIN_ADDRESS to enforce admin actions.");
                          return;
                        }
                        if (!isAuthorizedAdmin) {
                          alert("Connected wallet is not the configured tournament admin.");
                          return;
                        }
                        if (!isLatestSeason) {
                          alert("Contract administration is disabled for past seasons.");
                          return;
                        }
                        if (!confirm("Are you sure you want to CANCEL this tournament?")) return;
                        try {
                          await contract.send.closeTournament({ args: [] });
                          alert("Tournament marked as Cancelled.");
                          setRefreshTrigger(prev => prev + 1);
                        } catch (e) {
                          alert("Failed to cancel: " + (e as Error).message);
                        }
                      }}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                    >
                      Cancel Contract
                    </button>
                    <button
                      onClick={createNextSeasonOnChain}
                      disabled={creatingSeason || !isLatestSeason || !isAuthorizedAdmin}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                    >
                      {creatingSeason ? "Creating..." : "Create New"}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex border-b border-white/5">
                {[
                  { id: "assign", label: "1. Assign" },
                  { id: "bracket", label: "2. Bracket" },
                  { id: "history", label: "3. History" }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setBracketTab(tab.id as "assign" | "bracket" | "history")}
                    className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${bracketTab === tab.id
                      ? "text-[var(--accent)]"
                      : "text-[var(--muted)] hover:text-white"
                      }`}
                  >
                    {tab.label}
                    {bracketTab === tab.id && (
                      <div className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-[var(--accent)] shadow-[0_0_15px_var(--accent)]" />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <button
                      className="rounded-full border border-[var(--accent)]/60 px-4 py-2 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                      onClick={autoPopulateBracket}
                      disabled={!isLatestSeason || isPopulating}
                    >
                      Auto-Populate
                    </button>
                  )}
                  <select
                    className="rounded-full border border-white/20 bg-black/60 px-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent)]/50"
                    value={bracketSize}
                    disabled={!isLatestSeason}
                    onChange={(event) => {
                      const next = Number(event.target.value) as 2 | 4 | 8 | 16 | 32 | 64;
                      setBracketSize(next);
                      setBracketSlots(Array(next).fill(""));
                    }}
                  >
                    <option value={2}>2 Slots</option>
                    <option value={4}>4 Slots</option>
                    <option value={8}>8 Slots</option>
                    <option value={16}>16 Slots</option>
                    <option value={32}>32 Slots</option>
                    <option value={64}>64 Slots</option>
                  </select>
                  <button
                    className="rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10"
                    onClick={clearBracket}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="mt-8 space-y-6 relative min-h-[400px]">
                {isPopulating && (
                  <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center rounded-2xl bg-black/80 backdrop-blur-md">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                    <p className="mt-4 text-sm font-bold uppercase tracking-[0.4em] text-[var(--accent)] animate-pulse">
                      loading...
                    </p>
                  </div>
                )}



                {bracketTab === "assign" && (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-8 shadow-inner animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-bold uppercase tracking-tight">Assign Entrants</h3>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] bg-white/5 px-3 py-1 rounded-full">
                        {bracketSlots.filter(s => s).length} / {bracketSize} Slots Filled
                      </div>
                    </div>

                    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {bracketSlotsArray.map((slot) => (
                        <div
                          key={`slot-${slot.slotIndex}`}
                          className={`group rounded-2xl border transition-all duration-300 ${slot.address ? "border-[var(--accent)]/40 bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]/10" : "border-white/5 bg-black/30 hover:bg-black/40"
                            } p-5`}
                        >
                          <div className="flex items-center justify-between mb-4">
                            <div className="text-[10px] uppercase font-black tracking-[0.3em] text-[var(--muted)]">
                              Slot {slot.slotIndex + 1}
                            </div>
                            {slot.teamEntry && (
                              <div className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_8px_var(--accent)]" />
                            )}
                          </div>

                          {isAdmin ? (
                            <div className="space-y-2">
                              <input
                                className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-[10px] font-mono text-white placeholder:text-white/20 focus:border-[var(--accent)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/20 transition-all"
                                placeholder="Owner Address"
                                value={slot.address ?? ""}
                                onChange={(event) => setBracketSlotInput(slot.slotIndex, event.target.value)}
                                onBlur={(event) => assignBracketAddress(slot.slotIndex, event.target.value)}
                              />
                            </div>
                          ) : (
                            <div className="font-mono text-[10px] text-white whitespace-nowrap overflow-x-auto no-scrollbar py-1">
                              {slot.address ? displayAddress(slot.address) : <span className="text-[var(--muted)]">Available</span>}
                            </div>
                          )}

                          <div className="mt-5 pt-5 border-t border-white/5">
                            {slot.teamEntry ? (
                              (() => {
                                const teamEntry = slot.teamEntry;
                                return (
                                  <div className="space-y-3">
                                    <div className="text-[9px] uppercase font-bold tracking-widest text-[var(--muted)]">Selected Horses</div>
                                    <div className="flex flex-wrap gap-2">
                                      {teamEntry.assetIds.map((assetId) => (
                                        <span
                                          key={`slot-${slot.slotIndex}-asset-chip-${assetId}`}
                                          className="rounded-full border border-white/15 bg-black/40 px-2 py-1 text-[9px] font-mono text-white/90"
                                        >
                                          #{assetId}
                                        </span>
                                      ))}
                                    </div>
                                    <div className="grid grid-cols-5 gap-2">
                                      {teamEntry.assetIds.map((assetId, i) => {
                                        const horse = teamEntry.horses.find(
                                          (candidate) => candidate.assetId === assetId
                                        );

                                        if (!horse) {
                                          return (
                                            <div
                                              key={`slot-${slot.slotIndex}-asset-fallback-${assetId}-${i}`}
                                              className="aspect-square rounded-lg border border-white/10 bg-black/40 ring-1 ring-white/5 shadow-inner flex flex-col items-center justify-center px-1"
                                              title={`Asset #${assetId}`}
                                            >
                                              <span className="text-[7px] uppercase tracking-widest text-[var(--muted)]">
                                                Asset
                                              </span>
                                              <span className="mt-1 text-[9px] font-mono text-white/80">
                                                #{assetId}
                                              </span>
                                            </div>
                                          );
                                        }

                                        return (
                                          <div
                                            key={`slot-${slot.slotIndex}-asset-${assetId}-${i}`}
                                            className="aspect-square rounded-lg border border-white/10 bg-black/40 overflow-hidden ring-1 ring-white/5 shadow-inner group/horse relative"
                                            title={`${horse.name} (#${assetId})`}
                                          >
                                            <Image
                                              src={horse.imageUrl}
                                              alt={horse.name}
                                              fill
                                              sizes="40px"
                                              className="object-cover transition-transform group-hover/horse:scale-110"
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover/horse:bg-black/20 transition-colors" />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div className="grid grid-cols-5 gap-2 opacity-20">
                                {[...Array(5)].map((_, i) => (
                                  <div key={i} className="aspect-square rounded-lg border-2 border-dashed border-white/10 flex items-center justify-center text-[8px]">
                                    ?
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bracket Visualization */}
                {bracketTab === "bracket" && (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-8 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h3 className="text-xl font-bold uppercase tracking-tight mb-8">Tournament Tree</h3>
                    <div className="bracket-container custom-scrollbar pb-6">
                      {bracketRounds.map((round, roundIndex) => {
                        return (
                          <div key={`round-${roundIndex}`} className="bracket-round">
                            <div className="mb-6 text-center text-[10px] font-black uppercase tracking-[0.4em] text-[var(--accent)]/60 border-b border-white/10 pb-3">
                              {round.name}
                            </div>
                            <div className="flex flex-col flex-grow justify-around gap-12">
                              {round.matches.map((matchIndex) => {
                                const addressA = getRoundParticipant(roundIndex, matchIndex, 0);
                                const addressB = getRoundParticipant(roundIndex, matchIndex, 1);
                                const matchId = `round-${roundIndex}-match-${matchIndex}`;
                                const result = bracketResults[matchId];

                                return (
                                  <div
                                    key={matchId}
                                    className={`bracket-match border shadow-[0_10px_30px_rgba(0,0,0,0.5)] group hover:border-[var(--accent)]/40 transition-all duration-500 relative ${result ? "border-white/20 bg-black/80 ring-1 ring-white/5" : "border-white/10 bg-black/60"}`}
                                  >
                                    <div className={`bracket-match-slot p-3 rounded-xl transition-all duration-300 ${result?.winnerAddress === addressA ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/30 scale-105 z-10" : addressA ? "bg-white/5 font-bold" : "text-[var(--muted)]/40"}`}>
                                      <span className="font-mono whitespace-nowrap overflow-x-auto no-scrollbar max-w-[150px] text-[10px]">
                                        {addressA ? displayAddress(addressA) : "-"}
                                      </span>
                                      <span className="font-black text-xs">{result?.score.left ?? 0}</span>
                                    </div>
                                    <div className="flex items-center gap-4 px-3 py-1">
                                      <div className="h-[1px] flex-grow bg-white/10" />
                                      {isAdmin && isAuthorizedAdmin && isLatestSeason && addressA && addressB && !result && (
                                        <button
                                          onClick={() => runBracketMatch(roundIndex, matchIndex)}
                                          disabled={!!simulatingMatch}
                                          className={`rounded-full bg-[var(--accent)] px-4 py-1.5 text-[9px] font-black uppercase tracking-widest text-black hover:scale-110 hover:shadow-[0_0_20px_var(--accent)] transition-all active:scale-95 z-20 ${simulatingMatch === matchId ? "animate-pulse ring-2 ring-white/40" : ""}`}
                                        >
                                          {simulatingMatch === matchId ? "RACING..." : "RUN MATCH"}
                                        </button>
                                      )}

                                      <span className="text-[10px] font-black tracking-tighter text-[var(--muted)] opacity-50">VS</span>
                                      <div className="h-[1px] flex-grow bg-white/10" />
                                    </div>
                                    <div className={`bracket-match-slot p-3 rounded-xl transition-all duration-300 ${result?.winnerAddress === addressB ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/30 scale-105 z-10" : addressB ? "bg-white/5 font-bold" : "text-[var(--muted)]/40"}`}>
                                      <span className="font-mono whitespace-nowrap overflow-x-auto no-scrollbar max-w-[150px] text-[10px]">
                                        {addressB ? displayAddress(addressB) : "-"}
                                      </span>
                                      <span className="font-black text-xs">{result?.score.right ?? 0}</span>
                                    </div>

                                    {roundIndex < bracketRounds.length - 1 && (
                                      <div className="bracket-connector transition-all duration-500 group-hover:bg-[var(--accent)]/50" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tournament History Tab */}
                {bracketTab === "history" && (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-8 shadow-inner animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-bold uppercase tracking-tight">Race Results</h3>
                      <button
                        className="rounded-full border border-white/20 bg-white/5 px-5 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all active:scale-95"
                        onClick={async () => {
                          const historyUrl = `/api/race-results/get?${seasonQuery}`;
                          const historyRes = await fetch(historyUrl);
                          if (historyRes.ok) {
                            const historyData = (await historyRes.json()) as {
                              results: MatchResult[];
                            };
                            setMatchHistory(historyData.results ?? []);
                          }
                        }}
                      >
                        Refresh Results
                      </button>
                    </div>

                    <div className="grid gap-4 max-h-[800px] overflow-y-auto custom-scrollbar pr-2">
                      {matchHistory.length === 0 && (
                        <div className="py-20 text-center">
                          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--muted)]">No matches recorded this season yet.</p>
                        </div>
                      )}
                      {matchHistory.map((match) => (
                        <div
                          key={match.id}
                          className="group rounded-2xl border border-white/5 bg-black/40 p-6 hover:border-[var(--accent)]/30 transition-all duration-300"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--muted)] flex items-center gap-2">
                              <span className="h-1 w-5 bg-[var(--accent)]/50" />
                              {new Date(match.created_at).toLocaleString()}
                            </span>
                            <span className="text-[9px] font-mono text-[var(--muted)]/50 bg-white/5 px-2 py-0.5 rounded">
                              {match.match_id ?? "EXHIBITION"}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-8 py-4 px-6 rounded-xl bg-white/5">
                            <div className="flex items-center gap-4 flex-1">
                              <div className={`text-sm font-bold uppercase tracking-tight ${match.log?.winner_address === match.wallet_address ? "text-[var(--accent)]" : ""}`}>
                                {match.wallet_address ? displayAddress(match.wallet_address) : "unknown"}
                              </div>
                            </div>
                            <div className="text-xs font-black text-[var(--muted)] opacity-50 px-3 cursor-default">VS</div>
                            <div className="flex items-center gap-4 flex-1 justify-end text-right">
                              <div className={`text-sm font-bold uppercase tracking-tight ${match.log?.winner_address === match.log?.opponent_address ? "text-[var(--accent)]" : ""}`}>
                                {match.log?.opponent_address ? displayAddress(match.log.opponent_address) : "unknown"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                              Result: <span className="text-white ml-2">{match.log?.winner_address ? `Winner ${displayAddress(match.log.winner_address)}` : "Draw"}</span>
                            </div>

                            {match.log?.heats && match.log.heats.length > 0 && (
                              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                                {match.log.heats.map((heat, index) => (
                                  <div
                                    key={`${match.id}-heat-${index}`}
                                    title={heat.status}
                                    className={`h-2 w-2 rounded-full ring-1 ring-white/5 ${heat.status === "left wins" ? "bg-[var(--accent)]" : heat.status === "right wins" ? "bg-[var(--accent-2)]" : "bg-white/20"
                                      }`}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </section>

      <footer className="mt-20 border-t border-white/5 py-10 text-center">
        <p className="text-sm text-[var(--muted)]">
          © 2026 StupidHorse Racing. Move fast and break legs.
        </p>
        {canUseAdminMode && (
          <button
            onClick={() => setIsAdmin(!isAdmin)}
            className="mt-4 text-[10px] uppercase tracking-widest text-white/10 hover:text-[var(--accent)] transition-colors"
          >
            [Admin Mode: {isAdmin ? "Enabled" : "Disabled"}]
          </button>
        )}
      </footer>
    </main>
  );
}
