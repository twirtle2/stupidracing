export type AppNetwork = "mainnet" | "testnet" | "localnet";

const READ_ONLY_SENDER_FALLBACK =
  "CMYTBDMMKVKJSN4YO7BSVMBJCVTC2GBG6BY22Z4KKIUDNZGKUQI54MNTHU";
const LOCALNET_TOKEN_FALLBACK =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function parseNetwork(raw: string | undefined): AppNetwork {
  const value = (raw ?? "mainnet").toLowerCase();
  if (value === "mainnet" || value === "testnet" || value === "localnet") {
    return value;
  }
  throw new Error(
    `Invalid NEXT_PUBLIC_NETWORK: "${raw}". Expected one of mainnet, testnet, localnet.`
  );
}

function getDefaultNodes(network: AppNetwork) {
  if (network === "mainnet") {
    return {
      algodUrl: "https://mainnet-api.algonode.cloud",
      indexerUrl: "https://mainnet-idx.algonode.cloud",
    };
  }

  if (network === "testnet") {
    return {
      algodUrl: "https://testnet-api.algonode.cloud",
      indexerUrl: "https://testnet-idx.algonode.cloud",
    };
  }

  return {
    algodUrl: "http://localhost:4001",
    indexerUrl: "http://localhost:8980",
  };
}

const network = parseNetwork(process.env.NEXT_PUBLIC_NETWORK);
const defaults = getDefaultNodes(network);

export const env = {
  network,
  networkLabel:
    network === "mainnet" ? "Mainnet" : network === "testnet" ? "Testnet" : "Localnet",
  algodUrl: process.env.NEXT_PUBLIC_ALGOD_URL ?? defaults.algodUrl,
  indexerUrl: process.env.NEXT_PUBLIC_INDEXER_URL ?? defaults.indexerUrl,
  algodToken:
    process.env.NEXT_PUBLIC_ALGOD_TOKEN ??
    (network === "localnet" ? LOCALNET_TOKEN_FALLBACK : ""),
  indexerToken:
    process.env.NEXT_PUBLIC_INDEXER_TOKEN ??
    (network === "localnet" ? LOCALNET_TOKEN_FALLBACK : ""),
  tournamentAdminAddress: process.env.NEXT_PUBLIC_TOURNAMENT_ADMIN_ADDRESS ?? "",
  beaconAppId: process.env.NEXT_PUBLIC_BEACON_APP_ID ?? "",
  tournamentSeasons: process.env.NEXT_PUBLIC_TOURNAMENT_SEASONS ?? "",
  tournamentSeason: process.env.NEXT_PUBLIC_TOURNAMENT_SEASON ?? "",
  tournamentAppId: process.env.NEXT_PUBLIC_TOURNAMENT_APP_ID ?? "",
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  magicApiKey: process.env.NEXT_PUBLIC_MAGIC_API_KEY ?? "",
  web3AuthClientId: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  readOnlySender:
    process.env.NEXT_PUBLIC_READ_ONLY_SENDER ?? READ_ONLY_SENDER_FALLBACK,
} as const;

function validateRuntimeConfig() {
  const errors: string[] = [];
  const hasSeasonDiscoveryConfig =
    Boolean(env.tournamentAdminAddress) ||
    Boolean(env.tournamentSeasons) ||
    Boolean(env.tournamentAppId);

  if (!hasSeasonDiscoveryConfig) {
    errors.push(
      "Missing tournament discovery config: set NEXT_PUBLIC_TOURNAMENT_ADMIN_ADDRESS or NEXT_PUBLIC_TOURNAMENT_SEASONS or NEXT_PUBLIC_TOURNAMENT_APP_ID."
    );
  }

  if (!env.algodUrl) {
    errors.push("Missing NEXT_PUBLIC_ALGOD_URL.");
  }
  if (!env.indexerUrl) {
    errors.push("Missing NEXT_PUBLIC_INDEXER_URL.");
  }
  if (env.network === "localnet" && !env.algodToken) {
    errors.push("Missing NEXT_PUBLIC_ALGOD_TOKEN for localnet.");
  }

  if (errors.length === 0) {
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`Invalid runtime config:\n- ${errors.join("\n- ")}`);
  }

  console.warn(`Runtime config warnings:\n- ${errors.join("\n- ")}`);
}

validateRuntimeConfig();

export const appMetadata = {
  name: "StupidHorse",
  description: "StupidHorse racing on Algorand",
  url: env.appUrl,
  icons: [`${env.appUrl}/icon.svg`],
};
