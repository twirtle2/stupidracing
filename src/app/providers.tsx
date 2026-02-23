"use client";

import React, { useMemo } from "react";
import {
  NetworkConfigBuilder,
  NetworkId,
  WalletId,
  WalletManager,
  type SupportedWallet,
} from "@txnlab/use-wallet";
import { WalletProvider } from "@txnlab/use-wallet-react";
import { env } from "@/lib/config";

function buildWallets(): SupportedWallet[] {
  const wallets: SupportedWallet[] = [
    WalletId.PERA,
    WalletId.DEFLY_WEB,
    WalletId.KIBISIS,
    WalletId.LUTE,
    WalletId.EXODUS,
    WalletId.W3_WALLET,
  ];

  if (env.magicApiKey) {
    wallets.push({ id: WalletId.MAGIC, options: { apiKey: env.magicApiKey } });
  }

  if (env.web3AuthClientId) {
    wallets.push({
      id: WalletId.WEB3AUTH,
      options: {
        clientId: env.web3AuthClientId,
        web3AuthNetwork: "sapphire_mainnet",
      },
    });
  }

  if (process.env.NEXT_PUBLIC_ENABLE_DEV_WALLETS === "true") {
    wallets.push(WalletId.MNEMONIC);
    wallets.push(WalletId.KMD);
    wallets.push(WalletId.CUSTOM);
  }

  return wallets;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const manager = useMemo(() => {
    let builder = new NetworkConfigBuilder();

    if (env.network === "testnet") {
      builder = builder.testnet({
        algod: {
          baseServer: env.algodUrl,
          token: env.algodToken,
        },
        isTestnet: true,
      });
    } else if (env.network === "localnet") {
      builder = builder.localnet({
        algod: {
          baseServer: env.algodUrl,
          token: env.algodToken,
        },
        isTestnet: true,
      });
    } else {
      builder = builder.mainnet({
        algod: {
          baseServer: env.algodUrl,
          token: env.algodToken,
        },
        isTestnet: false,
      });
    }

    const networks = builder.build();

    return new WalletManager({
      wallets: buildWallets(),
      networks,
      defaultNetwork:
        env.network === "testnet"
          ? NetworkId.TESTNET
          : env.network === "localnet"
            ? NetworkId.LOCALNET
            : NetworkId.MAINNET,
    });
  }, []);

  return <WalletProvider manager={manager}>{children}</WalletProvider>;
}
