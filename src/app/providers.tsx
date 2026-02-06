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
    const networks = new NetworkConfigBuilder()
      .mainnet({
        algod: {
          baseServer: env.algodUrl,
          token: "",
        },
        isTestnet: false,
      })
      .build();

    return new WalletManager({
      wallets: buildWallets(),
      networks,
      defaultNetwork: NetworkId.MAINNET,
    });
  }, []);

  return <WalletProvider manager={manager}>{children}</WalletProvider>;
}
