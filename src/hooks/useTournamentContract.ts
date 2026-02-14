import { useEffect, useMemo } from "react";
import { useWallet } from '@txnlab/use-wallet-react';
import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { TransactionSigner, Transaction } from 'algosdk';
import { StupidRacingTournamentClient } from '@/lib/contracts/StupidRacingTournamentClient';

const ALGOD_SERVER = process.env.NEXT_PUBLIC_ALGOD_URL || 'https://testnet-api.algonode.cloud';
const INDEXER_SERVER = process.env.NEXT_PUBLIC_INDEXER_URL || 'https://testnet-idx.algonode.cloud';

function parseNodeUrl(urlInput: string, defaultPort: number) {
    const url = new URL(urlInput);
    return {
        server: `${url.protocol}//${url.hostname}`,
        port: Number(url.port || defaultPort),
    };
}

export function useTournamentContract(appId: bigint | null) {
    const { activeAccount, signTransactions } = useWallet();

    // Memoize the base AlgorandClient once
    const algorand = useMemo(() => {
        try {
            const algod = parseNodeUrl(ALGOD_SERVER, ALGOD_SERVER.startsWith("https") ? 443 : 80);
            const indexer = parseNodeUrl(INDEXER_SERVER, INDEXER_SERVER.startsWith("https") ? 443 : 80);

            return AlgorandClient.fromConfig({
                algodConfig: {
                    server: algod.server,
                    port: algod.port,
                    token: '',
                },
                indexerConfig: {
                    server: indexer.server,
                    port: indexer.port,
                    token: '',
                },
            });
        } catch (err) {
            console.error("[TournamentContract] failed to create algorand client:", err);
            return null;
        }
    }, []);

    const signer = useMemo<TransactionSigner | null>(() => {
        if (!activeAccount) {
            return null;
        }

        return async (txns: Transaction[], indexesToSign?: number[]) => {
            const encodedTxns = txns.map((txn) => txn.toByte());
            const result = await signTransactions(encodedTxns, indexesToSign);
            if (result.some((r: Uint8Array | null) => r === null)) {
                throw new Error("Failed to sign all transactions");
            }
            return result as Uint8Array[];
        };
    }, [activeAccount, signTransactions]);

    useEffect(() => {
        if (!algorand || !activeAccount || !signer) {
            return;
        }
        algorand.account.setSigner(activeAccount.address, signer);
    }, [activeAccount, algorand, signer]);

    const client = useMemo(() => {
        if (!appId || appId <= 0n || !algorand) return null;

        try {
            return new StupidRacingTournamentClient({
                appId,
                algorand,
                defaultSender: activeAccount?.address,
            });
        } catch (err) {
            console.error("[TournamentContract] failed to create tournament client:", err);
            return null;
        }
    }, [activeAccount?.address, algorand, appId]);

    return client;
}
