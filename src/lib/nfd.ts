export type NfdLookupResult = Record<string, { name?: string } | undefined>;
type NfdLookupArrayItem = { address?: string; name?: string };

export async function fetchNfdForAddresses(addresses: string[]) {
  const unique = Array.from(new Set(addresses.filter(Boolean)));
  if (unique.length === 0) {
    return {} as Record<string, string>;
  }

  const out: Record<string, string> = {};
  const chunkSize = 20;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const params = new URLSearchParams();
    chunk.forEach((addr: string) => params.append("address", addr));
    params.set("view", "tiny");

    try {
      const res = await fetch(`https://api.nf.domains/nfd/lookup?${params.toString()}`);

      if (!res.ok) {
        continue;
      }
      const data = (await res.json()) as NfdLookupResult | NfdLookupArrayItem[];
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item?.address && item?.name) {
            out[item.address] = item.name;
          }
        }
        continue;
      }
      for (const [address, value] of Object.entries(data)) {
        if (value?.name) {
          out[address] = value.name;
        }
      }
    } catch {
      // Silently handle NFD lookup failures (expected for non-NFD addresses)
    }
  }

  return out;
}

export function shortAddress(address: string) {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
