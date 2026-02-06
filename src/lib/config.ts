export const env = {
  network: process.env.NEXT_PUBLIC_NETWORK ?? "mainnet",
  algodUrl: process.env.NEXT_PUBLIC_ALGOD_URL ?? "",
  indexerUrl: process.env.NEXT_PUBLIC_INDEXER_URL ?? "",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  magicApiKey: process.env.NEXT_PUBLIC_MAGIC_API_KEY ?? "",
  web3AuthClientId: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export const appMetadata = {
  name: "StupidHorse",
  description: "StupidHorse racing on Algorand",
  url: env.appUrl,
  icons: [`${env.appUrl}/icon.svg`],
};
