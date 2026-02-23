import { useEffect, useMemo } from "react";
import { useWallet } from '@txnlab/use-wallet-react';
import { TransactionSigner, Transaction } from 'algosdk';
import { StupidRacingTournamentClient } from '@/lib/contracts/StupidRacingTournamentClient';
import { createAlgorandClient } from "@/lib/algorand-client";
import { env } from "@/lib/config";

export function useTournamentContract(appId: bigint | null) {
    const { activeAccount, signTransactions } = useWallet();

    // Memoize the base AlgorandClient once
    const algorand = useMemo(() => {
        try {
            return createAlgorandClient();
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
                defaultSender: activeAccount?.address ?? env.readOnlySender,
            });
        } catch (err) {
            console.error("[TournamentContract] failed to create tournament client:", err);
            return null;
        }
    }, [activeAccount?.address, algorand, appId]);

    return client;
}
