"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useWallet } from "@txnlab/use-wallet-react";
import type { StupidHorseAsset } from "@/lib/stupidhorse";

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

export default function Home() {
  const { wallets, activeWallet, activeAddress } = useWallet();
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

  const activeWalletLabel = activeWallet?.metadata.name ?? "";

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
    if (!activeAddress) {
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
          body: JSON.stringify({ address: activeAddress }),
        });

        if (!ownedRes.ok) {
          throw new Error("Failed to load stable");
        }

        const ownedData = (await ownedRes.json()) as {
          assets: OwnedHorse[];
        };

        setOwnedHorses(ownedData.assets ?? []);

        const profilesRes = await fetch(
          `/api/horse-profile?address=${activeAddress}&season=${SEASON}`
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
          `/api/team-entry?address=${activeAddress}&season=${SEASON}`
        );
        if (teamRes.ok) {
          const teamData = (await teamRes.json()) as {
            entry: { asset_ids: number[] } | null;
          };
          if (teamData.entry?.asset_ids) {
            setTeam(teamData.entry.asset_ids);
            const loadedTeam = await loadTeamForAddress(activeAddress);
            if (loadedTeam) {
              setTeams((prev) => ({ ...prev, [activeAddress]: loadedTeam }));
            }
          }
        }

        const historyRes = await fetch(
          `/api/race-results/get?address=${activeAddress}&season=${SEASON}`
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
  }, [activeAddress, loadTeamForAddress]);

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
        `/api/race-results/get?address=${activeAddress ?? ""}&season=${SEASON}`
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

  return (
    <main className="min-h-screen px-6 py-10 lg:px-12">
      <section className="mx-auto flex max-w-6xl flex-col gap-10">
        <header className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.4em] text-[var(--muted)]">
              Mainnet Season {SEASON}
            </p>
            <h1 className="text-5xl leading-none md:text-7xl">
              StupidHorse Championship
            </h1>
            <p className="max-w-xl text-lg text-[var(--muted)]">
              Connect your wallet, name your StupidHorse NFTs, and nominate a
              five-horse squad for the bracket. MVP logic is off-chain for speed.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/40 p-6 shadow-[0_0_40px_rgba(255,209,102,0.15)]">
            <h2 className="text-2xl">Wallet Stable</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {activeAddress
                ? `Connected as ${activeWalletLabel}`
                : "Pick a wallet to connect."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {wallets.map((wallet) => (
                <button
                  key={wallet.walletKey}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    wallet.isConnected
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-white/15 text-white hover:border-[var(--accent)]"
                  }`}
                  onClick={() =>
                    wallet.isConnected ? wallet.disconnect() : wallet.connect()
                  }
                >
                  {wallet.metadata.name}
                </button>
              ))}
            </div>
            {activeAddress && (
              <p className="mt-3 text-xs text-[var(--muted)] break-all">
                {activeAddress}
              </p>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-white/10 bg-black/40 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl">Your Stable</h2>
              <p className="text-sm text-[var(--muted)]">
                {loading
                  ? "Scanning mainnet holdings..."
                  : `Found ${ownedHorses.length} StupidHorses.`}
              </p>
            </div>
            <button
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:border-[var(--accent)]"
              onClick={() => activeAddress && window.location.reload()}
            >
              Refresh
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                      className={`rounded-full border px-3 py-1 text-xs ${
                        team.includes(horse.assetId)
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
                    Slot {index + 1} {slot ? `(${slot.slice(0, 6)}...)` : ""}
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
                    Slot {index + 1} {slot ? `(${slot.slice(0, 6)}...)` : ""}
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

        <section className="rounded-3xl border border-white/10 bg-black/40 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl">Tournament Bracket</h2>
              <p className="text-sm text-[var(--muted)]">
                Start with 8 slots, scale to 16 or 32. One team per owner.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                className="rounded-full border border-white/20 bg-black/60 px-3 py-2 text-sm"
                value={bracketSize}
                onChange={(event) => {
                  const next = Number(event.target.value) as 8 | 16 | 32;
                  setBracketSize(next);
                  setBracketSlots(Array(next).fill(""));
                }}
              >
                <option value={8}>8 slots</option>
                <option value={16}>16 slots</option>
                <option value={32}>32 slots</option>
              </select>
              <button
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-white"
                onClick={clearBracket}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <h3 className="text-xl">Slots</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {bracketSlotsArray.map((slot) => (
                  <div
                    key={`slot-${slot.slotIndex}`}
                    className="rounded-xl border border-white/10 bg-black/50 p-3"
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Slot {slot.slotIndex + 1}
                    </div>
                    <input
                      className="mt-2 w-full rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-xs"
                      placeholder="Owner address"
                      value={slot.address ?? ""}
                      onChange={(event) =>
                        setBracketSlotInput(slot.slotIndex, event.target.value)
                      }
                      onBlur={(event) =>
                        assignBracketAddress(slot.slotIndex, event.target.value)
                      }
                    />
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      {slot.teamEntry
                        ? `${slot.teamEntry.horses.length} horses loaded`
                        : "No team loaded"}
                    </div>
                    {slot.teamEntry && (
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-[var(--muted)]">
                        {slot.teamEntry.horses.map((horse) => (
                          <span
                            key={`${slot.slotIndex}-${horse.assetId}`}
                            className="rounded-full border border-white/10 px-2 py-0.5"
                          >
                            {horse.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <h3 className="text-xl">Bracket Map</h3>
              <div className="mt-4 space-y-4 text-sm">
                {bracketRounds.map((round, roundIndex) => (
                  <div key={`round-${roundIndex}`} className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      {round.name}
                    </div>
                    <div className="grid gap-2">
                      {round.matches.map((matchIndex) => {
                        const slotA = bracketSlotsArray[matchIndex * 2];
                        const slotB = bracketSlotsArray[matchIndex * 2 + 1];
                        return (
                          <div
                            key={`round-${roundIndex}-match-${matchIndex}`}
                            className="flex items-center justify-between rounded-lg border border-white/10 bg-black/60 px-3 py-2"
                          >
                            <span>
                              {slotA?.address
                                ? `Slot ${matchIndex * 2 + 1} (${slotA.address.slice(0, 6)}...)`
                                : `Slot ${matchIndex * 2 + 1}`}
                            </span>
                            <span className="text-[var(--muted)]">vs</span>
                            <span>
                              {slotB?.address
                                ? `Slot ${matchIndex * 2 + 2} (${slotB.address.slice(0, 6)}...)`
                                : `Slot ${matchIndex * 2 + 2}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
                if (!activeAddress) {
                  return;
                }
                const historyRes = await fetch(
                  `/api/race-results/get?address=${activeAddress}&season=${SEASON}`
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
                  {match.wallet_address?.slice(0, 6)}...
                  {" vs "}
                  {match.log?.opponent_address?.slice(0, 6) ?? "unknown"}...
                </div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Winner:{" "}
                  {match.log?.winner_address
                    ? `${match.log.winner_address.slice(0, 6)}...`
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
      </section>
    </main>
  );
}
