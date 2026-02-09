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
        if (!APP_ID) return null;

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

        // Create a signer adapter for useWallet if account is connected
        let sender;
        if (activeAccount) {
            const signer: TransactionSigner = async (txns: Transaction[], indexesToSign?: number[]) => {
                // useWallet expects transactions as Uint8Array[]
                const encodedTxns = txns.map(t => t.toByte());

                // Return signed transactions
                // Note: useWallet signTransactions returns Promise<(Uint8Array | null)[]>
                const result = await signTransactions(encodedTxns, indexesToSign);

                if (result.some(r => r === null)) {
                    throw new Error("Failed to sign all transactions");
                }
                return result as Uint8Array[];
            };

            sender = {
                addr: activeAccount.address,
                signer,
            };
        }

        return new StupidRacingTournamentClient({
            appId: APP_ID,
            sender,
            algorand,
        });
    }, [activeAccount, signTransactions]);

    return client;
}
