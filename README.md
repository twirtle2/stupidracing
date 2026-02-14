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

- `NEXT_PUBLIC_ALGOD_URL`
- `NEXT_PUBLIC_INDEXER_URL`
- `NEXT_PUBLIC_TOURNAMENT_ADMIN_ADDRESS` (recommended, used to auto-discover all season apps)
- `NEXT_PUBLIC_BEACON_APP_ID` (optional default for admin panel season creation)
- `NEXT_PUBLIC_TOURNAMENT_SEASONS` (JSON map, e.g. `{"1":"12345","2":"67890"}`)
- `NEXT_PUBLIC_TOURNAMENT_APP_ID` (legacy fallback for single-season mode)
- `NEXT_PUBLIC_TOURNAMENT_SEASON` (legacy fallback season number, defaults to `1`)
- `NEXT_PUBLIC_APP_URL` (optional, WalletConnect metadata)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (optional, enables WalletConnect wallets)
- `NEXT_PUBLIC_MAGIC_API_KEY` (optional)
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` (optional)

The app defaults to the latest discovered season and lets users switch to past seasons for history views.
After initial setup, admins can create new season apps from the UI without updating env per season.

## App Structure

- `src/app/page.tsx` - stable UI, team selection, race sim
- `src/app/api/*` - indexer + on-chain tournament API routes
- `src/lib/stupidhorse.ts` - asset registry
