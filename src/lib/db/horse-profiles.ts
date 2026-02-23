import "server-only";

import { supabaseRestRequest } from "@/lib/db/supabase-rest";

export type HorseProfileRow = {
  id: string;
  wallet_address: string;
  asset_id: number | string;
  name: string | null;
  description: string | null;
  season: number;
  stats: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type HorseProfileUpsertInput = {
  wallet_address: string;
  asset_id: number;
  name: string | null;
  description: string | null;
  season: number;
  stats: Record<string, unknown> | null;
};

function profileSelect() {
  return "id,wallet_address,asset_id,name,description,season,stats,created_at,updated_at";
}

export async function listHorseProfilesByAddressSeason(input: {
  walletAddress: string;
  season: number;
}) {
  const params = new URLSearchParams();
  params.set("select", profileSelect());
  params.set("wallet_address", `eq.${input.walletAddress}`);
  params.set("season", `eq.${input.season}`);
  params.set("order", "updated_at.desc");

  return supabaseRestRequest<HorseProfileRow[]>(`/rest/v1/horse_profiles?${params.toString()}`);
}

export async function upsertHorseProfile(input: HorseProfileUpsertInput) {
  const params = new URLSearchParams();
  params.set("on_conflict", "wallet_address,asset_id,season");
  params.set("select", profileSelect());

  const rows = await supabaseRestRequest<HorseProfileRow[]>(
    `/rest/v1/horse_profiles?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([{ ...input, updated_at: new Date().toISOString() }]),
    }
  );

  if (!rows[0]) {
    throw new Error("Supabase did not return the persisted profile");
  }

  return rows[0];
}
