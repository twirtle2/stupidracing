import { useMemo } from 'react';
import { useWallet } from '@txnlab/use-wallet-react';
import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { TransactionSigner, Transaction } from 'algosdk';
import { StupidRacingTournamentClient } from '@/lib/contracts/StupidRacingTournamentClient';

const APP_ID = BigInt(process.env.NEXT_PUBLIC_TOURNAMENT_APP_ID || "0");
const ALGOD_SERVER = process.env.NEXT_PUBLIC_ALGOD_URL || 'https://testnet-api.algonode.cloud';
const INDEXER_SERVER = process.env.NEXT_PUBLIC_INDEXER_URL || 'https://testnet-idx.algonode.cloud';

export function useTournamentContract() {
    const { activeAccount, signTransactions } = useWallet();

    const client = useMemo(() => {
        console.log("[TournamentContract] init", {
            APP_ID: APP_ID.toString(),
            hasActiveAccount: !!activeAccount,
            address: activeAccount?.address,
        });

        if (!APP_ID) {
            console.warn("[TournamentContract] APP_ID is 0 — check NEXT_PUBLIC_TOURNAMENT_APP_ID env var");
            return null;
        }

        try {
            // Initialize AlgorandClient
            const algorand = AlgorandClient.fromConfig({
                algodConfig: {
                    server: ALGOD_SERVER,
                    port: 443,
                    token: '',
                },
                indexerConfig: {
                    server: INDEXER_SERVER,
                    port: 443,
                    token: '',
                },
            });

            // If account is connected, register the signer and set default sender
            if (activeAccount) {
                const signer: TransactionSigner = async (txns: Transaction[], indexesToSign?: number[]) => {
                    const encodedTxns = txns.map(t => t.toByte());
                    const result = await signTransactions(encodedTxns, indexesToSign);

                    if (result.some(r => r === null)) {
                        throw new Error("Failed to sign all transactions");
                    }
                    return result as Uint8Array[];
                };

                algorand.account.setSigner(activeAccount.address, signer);
            }

            const tournamentClient = new StupidRacingTournamentClient({
                appId: APP_ID,
                algorand,
                defaultSender: activeAccount?.address,
            });

            console.log("[TournamentContract] client created successfully");
            return tournamentClient;
        } catch (err) {
            console.error("[TournamentContract] failed to create client:", err);
            return null;
        }
    }, [activeAccount?.address, signTransactions]);

    return client;
}
