import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { env } from "@/lib/config";

type ParsedNodeUrl = {
  server: string;
  port: number;
};

export function parseNodeUrl(urlInput: string): ParsedNodeUrl {
  const url = new URL(urlInput);
  const isHttps = url.protocol === "https:";

  return {
    server: `${url.protocol}//${url.hostname}`,
    port: Number(url.port || (isHttps ? 443 : 80)),
  };
}

export function createAlgorandClient() {
  const algod = parseNodeUrl(env.algodUrl);
  const indexer = parseNodeUrl(env.indexerUrl);

  return AlgorandClient.fromConfig({
    algodConfig: {
      server: algod.server,
      port: algod.port,
      token: process.env.ALGOD_TOKEN || env.algodToken,
    },
    indexerConfig: {
      server: indexer.server,
      port: indexer.port,
      token: process.env.INDEXER_TOKEN || env.indexerToken,
    },
  });
}
