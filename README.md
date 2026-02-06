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
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (optional, WalletConnect metadata)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (optional, enables WalletConnect wallets)
- `NEXT_PUBLIC_MAGIC_API_KEY` (optional)
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` (optional)

## Supabase

Run the SQL in `supabase/schema.sql` in your Supabase project.

Note: The policies are public for MVP speed. Lock them down once you add wallet signature verification.

## App Structure

- `src/app/page.tsx` - stable UI, team selection, race sim
- `src/app/api/*` - indexer + Supabase API routes
- `src/lib/stupidhorse.ts` - asset registry
