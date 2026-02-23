# StupidHorse Racing

Mainnet web app for the StupidHorse NFT racing league.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Create `.env.local` (already added for you) and set:

- `NEXT_PUBLIC_NETWORK` (`mainnet`, `testnet`, or `localnet`)
- `NEXT_PUBLIC_ALGOD_URL`
- `NEXT_PUBLIC_INDEXER_URL`
- `NEXT_PUBLIC_ALGOD_TOKEN` (required for localnet; optional otherwise)
- `NEXT_PUBLIC_INDEXER_TOKEN` (required for localnet; optional otherwise)
- `NEXT_PUBLIC_READ_ONLY_SENDER` (optional; fallback account for readonly calls)
- `NEXT_PUBLIC_TOURNAMENT_ADMIN_ADDRESS` (recommended, used to auto-discover all season apps)
- `NEXT_PUBLIC_BEACON_APP_ID` (optional default for admin panel season creation)
- `NEXT_PUBLIC_TOURNAMENT_SEASONS` (JSON map, e.g. `{"1":"12345","2":"67890"}`)
- `NEXT_PUBLIC_TOURNAMENT_APP_ID` (legacy fallback for single-season mode)
- `NEXT_PUBLIC_TOURNAMENT_SEASON` (legacy fallback season number, defaults to `1`)
- `NEXT_PUBLIC_APP_URL` (optional, WalletConnect metadata)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (optional, enables WalletConnect wallets)
- `NEXT_PUBLIC_MAGIC_API_KEY` (optional)
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` (optional)
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (required for `/api/horse-profile` persistence)

Example mainnet config:

```env
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_ALGOD_URL=https://mainnet-api.algonode.cloud
NEXT_PUBLIC_INDEXER_URL=https://mainnet-idx.algonode.cloud
NEXT_PUBLIC_TOURNAMENT_ADMIN_ADDRESS=YOUR_MAINNET_ADMIN_ADDRESS
NEXT_PUBLIC_TOURNAMENT_SEASONS={\"1\":\"123456789\"}
NEXT_PUBLIC_BEACON_APP_ID=1615566206
```

Example testnet config:

```env
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_ALGOD_URL=https://testnet-api.algonode.cloud
NEXT_PUBLIC_INDEXER_URL=https://testnet-idx.algonode.cloud
NEXT_PUBLIC_TOURNAMENT_ADMIN_ADDRESS=YOUR_TESTNET_ADMIN_ADDRESS
NEXT_PUBLIC_TOURNAMENT_SEASONS={\"1\":\"755448444\"}
NEXT_PUBLIC_BEACON_APP_ID=600011887
```

Example localnet config:

```env
NEXT_PUBLIC_NETWORK=localnet
NEXT_PUBLIC_ALGOD_URL=http://localhost:4001
NEXT_PUBLIC_INDEXER_URL=http://localhost:8980
NEXT_PUBLIC_ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
NEXT_PUBLIC_INDEXER_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
NEXT_PUBLIC_TOURNAMENT_APP_ID=1
```

The app defaults to the latest discovered season and lets users switch to past seasons for history views.
After initial setup, admins can create new season apps from the UI without updating env per season.

## App Structure

- `src/app/page.tsx` - stable UI, team selection, race sim
- `src/app/api/*` - indexer + on-chain tournament API routes
- `src/lib/stupidhorse.ts` - asset registry
