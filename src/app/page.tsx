"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useWallet } from "@txnlab/use-wallet-react";
import type { StupidHorseAsset } from "@/lib/stupidhorse";
import { fetchNfdForAddresses, shortAddress } from "@/lib/nfd";


const SEASON = 1;
const FINISH_LINE = 12;
const CLIFF = -5;
const ROLL_OPTIONS = [-3, -2, -1, 1, 2, 3, 4];

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


export default function Home() {
  const { wallets, activeAddress } = useWallet();
  const [ownedHorses, setOwnedHorses] = useState<OwnedHorse[]>([]);
  const [profiles, setProfiles] = useState<Record<number, HorseProfile>>({});
  const [drafts, setDrafts] = useState<
    Record<number, { name: string; description: string }>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<number[]>([]);
  const [teams, setTeams] = useState<Record<string, TeamEntry>>({});
  const [matchLeftSlot, setMatchLeftSlot] = useState<number | null>(null);
  const [matchRightSlot, setMatchRightSlot] = useState<number | null>(null);
  const [heatLog, setHeatLog] = useState<RaceLogEntry[]>([]);
  const [matchScore, setMatchScore] = useState<{ left: number; right: number }>({
    left: 0,
    right: 0,
  });
  const [matchStatus, setMatchStatus] = useState<string>("ready");
  const [matchHistory, setMatchHistory] = useState<MatchResult[]>([]);
  const [bracketSize, setBracketSize] = useState<8 | 16 | 32>(8);
  const [bracketSlots, setBracketSlots] = useState<string[]>(Array(8).fill(""));
  const [isAdmin, setIsAdmin] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [stableAddressOverride, setStableAddressOverride] = useState("");
  const [nfdMap, setNfdMap] = useState<Record<string, string>>({});
  const [view, setView] = useState<"stable" | "bracket">("stable");
  const [hasMounted, setHasMounted] = useState(false);
  const [bracketResults, setBracketResults] = useState<Record<string, BracketMatchResult>>({});


  useEffect(() => {
    setHasMounted(true);
  }, []);



  const stableAddress = stableAddressOverride.trim() || activeAddress || "";
  const displayAddress = (address?: string | null) => {
    if (!address) {
      return "";
    }
    return nfdMap[address] ?? shortAddress(address);
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
    setLoading(true);
    try {
      const res = await fetch(`/api/eligible-accounts?limit=${bracketSize}`);
      if (!res.ok) {
        throw new Error("Failed to query eligible accounts");
      }
      const data = (await res.json()) as {
        accounts: Array<{ address: string; assetIds: number[] }>;
      };

      if (data.accounts.length === 0) {
        setError("No eligible accounts found with 5+ horses.");
        return;
      }

      const addresses = data.accounts.map(a => a.address);
      const padded = addresses.concat(Array(bracketSize).fill("")).slice(0, bracketSize);
      setBracketSlots(padded);

      const newTeams: Record<string, TeamEntry> = { ...teams };

      await Promise.all(
        data.accounts.map(async (account) => {
          const shuffledAssets = account.assetIds.sort(() => 0.5 - Math.random());
          const selectedAssetIds = shuffledAssets.slice(0, 5);

          const assetsRes = await fetch("/api/asset-details", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assetIds: selectedAssetIds,
              includeMetadata: true,
            }),
          });

          if (assetsRes.ok) {
            const assetsData = await assetsRes.json();
            newTeams[account.address] = {
              address: account.address,
              assetIds: selectedAssetIds,
              horses: assetsData.assets
            };
          }
        })
      );
      setTeams(newTeams);

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };



  const loadTeamForAddress = useCallback(async (address: string) => {
    const response = await fetch(
      `/api/team-entry?address=${address}&season=${SEASON}`
    );
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

    return {
      address,
      assetIds: data.entry.asset_ids,
      horses: assetsData.assets,
    } as TeamEntry;
  }, []);

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
    if (!activeAddress) {
      return;
    }
    if (bracketSlots[0]) {
      return;
    }
    assignBracketAddress(0, activeAddress);
  }, [activeAddress, bracketSlots, assignBracketAddress]);

  useEffect(() => {
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
          `/api/horse-profile?address=${stableAddress}&season=${SEASON}`
        );

        if (!profilesRes.ok) {
          throw new Error("Failed to load profiles");
        }

        const profileData = (await profilesRes.json()) as {
          profiles: HorseProfile[];
        };

        const byId: Record<number, HorseProfile> = {};
        profileData.profiles.forEach((profile) => {
          byId[profile.asset_id] = profile;
        });
        setProfiles(byId);

        const teamRes = await fetch(
          `/api/team-entry?address=${stableAddress}&season=${SEASON}`
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

        const historyRes = await fetch(
          `/api/race-results/get?address=${stableAddress}&season=${SEASON}`
        );
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
  }, [stableAddress, activeAddress, loadTeamForAddress]);

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
        season: SEASON,
      }),
    });

    if (!response.ok) {
      setError("Failed to save profile");
      return;
    }

    const data = (await response.json()) as { profile: HorseProfile };
    setProfiles((prev) => ({ ...prev, [assetId]: data.profile }));
  };

  const saveTeam = async () => {
    if (!activeAddress) {
      return;
    }
    if (team.length !== 5) {
      setError("Pick exactly 5 horses for your tournament team.");
      return;
    }

    const response = await fetch("/api/team-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: activeAddress,
        assetIds: team,
        season: SEASON,
      }),
    });

    if (!response.ok) {
      setError("Failed to save team entry");
      return;
    }

    setError(null);
  };

  const resetMatch = () => {
    setHeatLog([]);
    setMatchScore({ left: 0, right: 0 });
    setMatchStatus("ready");
  };

  const runHeat = () => {
    let leftPos = 0;
    let rightPos = 0;
    let status = "running";
    let safety = 0;

    while (status === "running" && safety < 100) {
      const leftRoll =
        ROLL_OPTIONS[Math.floor(Math.random() * ROLL_OPTIONS.length)];
      const rightRoll =
        ROLL_OPTIONS[Math.floor(Math.random() * ROLL_OPTIONS.length)];

      leftPos += leftRoll;
      rightPos += rightRoll;

      const leftCliff = leftPos <= CLIFF;
      const rightCliff = rightPos <= CLIFF;
      const leftFinish = leftPos >= FINISH_LINE;
      const rightFinish = rightPos >= FINISH_LINE;

      if (leftCliff && rightCliff) {
        status = "draw";
      } else if (leftFinish && rightFinish) {
        status = "draw";
      } else if (leftFinish || rightCliff) {
        status = "left wins";
      } else if (rightFinish || leftCliff) {
        status = "right wins";
      }

      safety += 1;
    }

    if (status === "running") {
      status = "draw";
    }

    return {
      left: leftPos,
      right: rightPos,
      status,
    };
  };

  const runMatch = async () => {
    if (matchLeftSlot === null || matchRightSlot === null) {
      return;
    }
    if (matchLeftSlot === matchRightSlot) {
      setError("Choose two different bracket slots.");
      return;
    }
    const leftAddress = bracketSlots[matchLeftSlot];
    const rightAddress = bracketSlots[matchRightSlot];
    const leftTeam = leftAddress ? teams[leftAddress] : null;
    const rightTeam = rightAddress ? teams[rightAddress] : null;

    if (!leftTeam || !rightTeam) {
      setError("Both slots must have teams loaded.");
      return;
    }

    if (leftTeam.assetIds.length !== 5 || rightTeam.assetIds.length !== 5) {
      setError("Each team must have exactly 5 horses.");
      return;
    }

    const logs: RaceLogEntry[] = [];
    let leftWins = 0;
    let rightWins = 0;

    for (let i = 0; i < 5; i += 1) {
      const leftHorse = leftTeam.horses[i];
      const rightHorse = rightTeam.horses[i];
      if (!leftHorse || !rightHorse) {
        logs.push({
          left: 0,
          right: 0,
          leftRoll: 0,
          rightRoll: 0,
          status: `Heat ${i + 1}: missing horse`,
        });
        continue;
      }
      const heat = runHeat();
      const heatStatus = `${leftHorse.name} vs ${rightHorse.name}: ${heat.status}`;
      logs.push({
        left: heat.left,
        right: heat.right,
        leftRoll: 0,
        rightRoll: 0,
        status: heatStatus,
      });
      if (heat.status === "left wins") {
        leftWins += 1;
      } else if (heat.status === "right wins") {
        rightWins += 1;
      }
    }

    const winnerAddress =
      leftWins === rightWins
        ? null
        : leftWins > rightWins
          ? leftAddress
          : rightAddress;

    setHeatLog(logs);
    setMatchScore({ left: leftWins, right: rightWins });
    if (leftWins === rightWins) {
      setMatchStatus("draw - rerun match");
    } else if (leftWins > rightWins) {
      setMatchStatus("left team advances");
    } else {
      setMatchStatus("right team advances");
    }

    try {
      await fetch("/api/race-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: SEASON,
          walletAddress: leftAddress,
          opponentAddress: rightAddress,
          teamAssetIds: leftTeam.assetIds,
          opponentAssetIds: rightTeam.assetIds,
          winnerAddress,
          matchId: `slot-${matchLeftSlot}-vs-${matchRightSlot}-${Date.now()}`,
          log: logs,
        }),
      });
      const historyRes = await fetch(
        `/api/race-results/get?address=${stableAddress}&season=${SEASON}`
      );
      if (historyRes.ok) {
        const historyData = (await historyRes.json()) as {
          results: MatchResult[];
        };
        setMatchHistory(historyData.results ?? []);
      }
    } catch (err) {
      console.error("Failed to save match result", err);
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
      bracketSize === 32
        ? "Round of 32"
        : bracketSize === 16
          ? "Round of 16"
          : "Quarterfinals";
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

    const teamA = await loadTeamForAddress(addressA);
    const teamB = await loadTeamForAddress(addressB);

    if (!teamA || !teamB) {
      setError("Failed to load teams for bracket match.");
      return;
    }

    const logs: RaceLogEntry[] = [];
    let leftWins = 0;
    let rightWins = 0;

    for (let i = 0; i < 5; i++) {
      const hA = teamA.horses[i];
      const hB = teamB.horses[i];
      if (!hA || !hB) continue;
      const heat = runHeat();
      logs.push({
        left: heat.left,
        right: heat.right,
        leftRoll: 0,
        rightRoll: 0,
        status: `${hA.name} vs ${hB.name}: ${heat.status}`
      });
      if (heat.status === "left wins") leftWins++;
      else if (heat.status === "right wins") rightWins++;
    }

    const winnerAddress = leftWins === rightWins ? null : (leftWins > rightWins ? addressA : addressB);
    const matchId = `round-${roundIndex}-match-${matchIndex}`;

    setBracketResults(prev => ({
      ...prev,
      [matchId]: {
        winnerAddress,
        score: { left: leftWins, right: rightWins },
        logs
      }
    }));
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
        <header className="sticky top-4 z-20 rounded-3xl border border-white/10 bg-black/40 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/60 px-4 py-2">
                <h1 className="text-3xl leading-none md:text-4xl">
                  StupidHorse Racing
                </h1>
                <p className="mt-1 text-xs font-medium italic tracking-wide text-[var(--muted)] opacity-80">
                  You can lead a horse to water, but you can’t stop it from jumping off the cliff.
                </p>
              </div>


              <nav className="flex items-center gap-6 ml-4">
                <button
                  onClick={() => setView("stable")}
                  className={`text-sm uppercase tracking-widest transition-colors ${view === "stable" ? "text-[var(--accent)] font-bold" : "text-[var(--muted)] hover:text-white"
                    }`}
                >
                  Your Stable
                </button>
                <button
                  onClick={() => setView("bracket")}
                  className={`text-sm uppercase tracking-widest transition-colors ${view === "bracket" ? "text-[var(--accent)] font-bold" : "text-[var(--muted)] hover:text-white"
                    }`}
                >
                  Tournament Bracket
                </button>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <span>User</span>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    className="peer sr-only"
                    type="checkbox"
                    checked={isAdmin}
                    onChange={(event) => setIsAdmin(event.target.checked)}
                  />
                  <div className="h-5 w-9 rounded-full bg-white/20 peer-checked:bg-[var(--accent)]" />
                  <div className="absolute left-1 top-1 h-3 w-3 rounded-full bg-white transition peer-checked:translate-x-4" />
                </label>
                <span>Admin</span>
              </div>
              <div className="relative">
                <button
                  className={`rounded-full border px-4 py-2 text-sm transition-all duration-200 ${activeAddress
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/5 text-[var(--accent)]"
                    : "border-white/20 text-white hover:border-white"
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
          </div>
        </header>







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
            <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">

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
                    className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
                    onClick={saveTeam}
                  >
                    Lock In Team
                  </button>
                  <span className="text-sm text-[var(--muted)]">
                    {team.length}/5 selected
                  </span>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/40 p-6">
                <h2 className="text-2xl">Match Simulator</h2>
                <p className="text-sm text-[var(--muted)]">
                  Best-of-5, but all 5 heats run. Ties count as draws and move on.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <select
                    className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm"
                    value={matchLeftSlot ?? ""}
                    onChange={(event) => {
                      const value = event.target.value
                        ? Number(event.target.value)
                        : null;
                      setMatchLeftSlot(value);
                    }}
                  >
                    <option value="">Left slot</option>
                    {bracketSlots.map((slot, index) => (
                      <option key={`left-slot-${index}`} value={index}>
                        Slot {index + 1} {slot ? `(${displayAddress(slot)})` : ""}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm"
                    value={matchRightSlot ?? ""}
                    onChange={(event) => {
                      const value = event.target.value
                        ? Number(event.target.value)
                        : null;
                      setMatchRightSlot(value);
                    }}
                  >
                    <option value="">Right slot</option>
                    {bracketSlots.map((slot, index) => (
                      <option key={`right-slot-${index}`} value={index}>
                        Slot {index + 1} {slot ? `(${displayAddress(slot)})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
                    onClick={runMatch}
                  >
                    Run Match
                  </button>
                  <button
                    className="rounded-full border border-white/20 px-4 py-2 text-sm text-white"
                    onClick={resetMatch}
                  >
                    Reset
                  </button>
                  <span className="text-sm text-[var(--muted)]">
                    {matchStatus === "ready" ? "Awaiting match" : matchStatus}
                  </span>
                </div>

                <div className="mt-4 text-xs text-[var(--muted)]">
                  Score: Left {matchScore.left} — Right {matchScore.right}
                </div>

                <div className="mt-4 max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
                  {heatLog.length === 0 && (
                    <p className="text-[var(--muted)]">No heats yet.</p>
                  )}
                  {heatLog.map((entry, index) => (
                    <div key={index} className="flex justify-between">
                      <span>Heat {index + 1}</span>
                      <span className="text-[var(--accent)]">{entry.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section
              id="bracket"
              className="rounded-3xl border border-white/10 bg-black/40 p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl">Tournament Bracket</h2>
                  <p className="text-sm text-[var(--muted)]">
                    Start with 8 slots, scale to 16 or 32. One team per owner.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <button
                      className="rounded-full border border-[var(--accent)]/60 px-4 py-2 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                      onClick={autoPopulateBracket}
                    >
                      Auto-Populate
                    </button>
                  )}
                  <select
                    className="rounded-full border border-white/20 bg-black/60 px-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent)]/50"
                    value={bracketSize}
                    onChange={(event) => {
                      const next = Number(event.target.value) as 8 | 16 | 32;
                      setBracketSize(next);
                      setBracketSlots(Array(next).fill(""));
                    }}
                  >
                    <option value={8}>8 Slots</option>
                    <option value={16}>16 Slots</option>
                    <option value={32}>32 Slots</option>
                  </select>
                  <button
                    className="rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10"
                    onClick={clearBracket}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Slots Section */}
              <div className="mt-8 space-y-6">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
                  <h3 className="text-xl font-bold uppercase tracking-tight mb-4">Assign Slots</h3>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
                    {bracketSlotsArray.map((slot) => (
                      <div
                        key={`slot-${slot.slotIndex}`}
                        className={`rounded-2xl border transition-all duration-200 ${slot.address ? "border-[var(--accent)]/30 bg-[var(--accent)]/5" : "border-white/5 bg-black/30"
                          } p-4`}
                      >
                        <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-[var(--muted)]">
                          Slot {slot.slotIndex + 1}
                        </div>
                        {isAdmin ? (
                          <input
                            className="mt-3 w-full rounded-lg border border-white/10 bg-black/60 px-2 py-1.5 text-[10px] text-white focus:border-[var(--accent)]/50 focus:outline-none"
                            placeholder="Address"
                            value={slot.address ?? ""}
                            onChange={(event) => setBracketSlotInput(slot.slotIndex, event.target.value)}
                            onBlur={(event) => assignBracketAddress(slot.slotIndex, event.target.value)}
                          />
                        ) : (
                          <div className="mt-3 truncate font-mono text-[10px] text-white">
                            {slot.address ? displayAddress(slot.address) : "Empty"}
                          </div>
                        )}
                        <div className="mt-3">
                          {slot.teamEntry ? (
                            <div className="flex -space-x-2 overflow-hidden">
                              {slot.teamEntry.horses.slice(0, 3).map((horse, i) => (
                                <div key={i} className="inline-block h-6 w-6 rounded-full border-2 border-black bg-black/40 ring-1 ring-white/10 overflow-hidden">
                                  <Image src={horse.imageUrl} alt={horse.name} width={24} height={24} className="object-cover" />
                                </div>
                              ))}
                              {slot.teamEntry.horses.length > 3 && (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-white/10 text-[8px] font-bold text-white ring-1 ring-white/10">
                                  +{slot.teamEntry.horses.length - 3}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="h-6 w-6 rounded-full border border-dashed border-white/10 flex items-center justify-center text-[8px] text-[var(--muted)]">
                              ?
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bracket Visualization */}
                <div className="rounded-2xl border border-white/10 bg-black/30 p-6 overflow-hidden">
                  <h3 className="text-xl font-bold uppercase tracking-tight mb-6">Tournament Tree</h3>
                  <div className="bracket-container">
                    {bracketRounds.map((round, roundIndex) => {
                      // Show all rounds for visual structure

                      return (
                        <div key={`round-${roundIndex}`} className="bracket-round">
                          <div className="mb-4 text-center text-[10px] uppercase font-bold tracking-[0.3em] text-[var(--muted)] border-b border-white/5 pb-2">
                            {round.name}
                          </div>
                          <div className="flex flex-col flex-grow justify-around gap-8">
                            {round.matches.map((matchIndex) => {
                              const addressA = getRoundParticipant(roundIndex, matchIndex, 0);
                              const addressB = getRoundParticipant(roundIndex, matchIndex, 1);
                              const matchId = `round-${roundIndex}-match-${matchIndex}`;
                              const result = bracketResults[matchId];

                              return (
                                <div
                                  key={matchId}
                                  className="bracket-match border border-white/10 bg-black/60 shadow-xl group hover:border-[var(--accent)]/30 transition-all duration-300 relative"
                                >
                                  <div className={`bracket-match-slot p-2 rounded-lg transition-colors ${addressA ? "bg-white/5 font-bold" : "text-[var(--muted)]"}`}>
                                    <span className="truncate max-w-[120px]">
                                      {addressA ? displayAddress(addressA) : "-"}
                                    </span>
                                    <span className="text-[var(--accent)] font-mono">{result?.score.left ?? 0}</span>
                                  </div>
                                  <div className="flex items-center gap-3 px-2">
                                    <div className="h-[1px] flex-grow bg-white/5" />
                                    {isAdmin && addressA && addressB && !result && (
                                      <button
                                        onClick={() => runBracketMatch(roundIndex, matchIndex)}
                                        className="rounded bg-[var(--accent)] px-2 py-0.5 text-[8px] font-bold text-black hover:scale-110 transition-transform active:scale-95 z-10"
                                      >
                                        RUN
                                      </button>
                                    )}
                                    <span className="text-[8px] uppercase tracking-tighter text-[var(--muted)]">VS</span>
                                    <div className="h-[1px] flex-grow bg-white/5" />
                                  </div>
                                  <div className={`bracket-match-slot p-2 rounded-lg transition-colors ${addressB ? "bg-white/5 font-bold" : "text-[var(--muted)]"}`}>
                                    <span className="truncate max-w-[120px]">
                                      {addressB ? displayAddress(addressB) : "-"}
                                    </span>
                                    <span className="text-[var(--accent)] font-mono">{result?.score.right ?? 0}</span>
                                  </div>
                                  {roundIndex < bracketRounds.length - 1 && (
                                    <div className="bracket-connector transition-all duration-300 group-hover:bg-[var(--accent)]/30" />
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
              </div>
            </section>


            <section className="rounded-3xl border border-white/10 bg-black/40 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl">Match History</h2>
                <button
                  className="rounded-full border border-white/20 px-4 py-2 text-sm text-white"
                  onClick={async () => {
                    if (!stableAddress) {
                      return;
                    }
                    const historyRes = await fetch(
                      `/api/race-results/get?address=${stableAddress}&season=${SEASON}`
                    );
                    if (historyRes.ok) {
                      const historyData = (await historyRes.json()) as {
                        results: MatchResult[];
                      };
                      setMatchHistory(historyData.results ?? []);
                    }
                  }}
                >
                  Refresh
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                {matchHistory.length === 0 && (
                  <p className="text-sm text-[var(--muted)]">No matches yet.</p>
                )}
                {matchHistory.map((match) => (
                  <div
                    key={match.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        {new Date(match.created_at).toLocaleString()}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {match.match_id ?? "Match"}
                      </span>
                    </div>
                    <div className="mt-2 text-sm">
                      {match.wallet_address
                        ? displayAddress(match.wallet_address)
                        : "unknown"}
                      {" vs "}
                      {match.log?.opponent_address
                        ? displayAddress(match.log.opponent_address)
                        : "unknown"}
                    </div>
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      Winner:{" "}
                      {match.log?.winner_address
                        ? displayAddress(match.log.winner_address)
                        : "Draw"}
                    </div>
                    {match.log?.heats && match.log.heats.length > 0 && (
                      <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                        {match.log.heats.map((heat, index) => (
                          <div key={`${match.id}-heat-${index}`}>
                            Heat {index + 1}: {heat.status}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>

      <footer className="mt-20 border-t border-white/5 py-10 text-center">
        <p className="text-sm text-[var(--muted)]">
          © 2026 StupidHorse Racing. Move fast and break legs.
        </p>
        <button
          onClick={() => setIsAdmin(!isAdmin)}
          className="mt-4 text-[10px] uppercase tracking-widest text-white/10 hover:text-[var(--accent)] transition-colors"
        >
          [Admin Mode: {isAdmin ? "Enabled" : "Disabled"}]
        </button>
      </footer>
    </main >



  );
}
