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

    // Memoize the base AlgorandClient once
    const algorand = useMemo(() => {
        try {
            return AlgorandClient.fromConfig({
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
        } catch (err) {
            console.error("[TournamentContract] failed to create algorand client:", err);
            return null;
        }
    }, []);

    const client = useMemo(() => {
        if (!APP_ID || !algorand) return null;

        try {
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

            return new StupidRacingTournamentClient({
                appId: APP_ID,
                algorand,
                defaultSender: activeAccount?.address,
            });
        } catch (err) {
            console.error("[TournamentContract] failed to create tournament client:", err);
            return null;
        }
    }, [activeAccount?.address, signTransactions, algorand]);

    return client;
}
