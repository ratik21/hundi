import { whitechainSepolia } from "@hundi/wallet/chain-io";
import { createPublicClient, fallback, http, type PublicClient } from "viem";

const PRIMARY = import.meta.env.VITE_RPC_URL as string | undefined;
const DEFAULT_RPC = "https://rpc.testnet.whitechain.io/";
const BACKUP_RPC = "https://rpc.ankr.com/whitechain_testnet";

export const RELAYER_URL = import.meta.env.VITE_RELAYER_URL as
  | string
  | undefined;

export const writes = PRIMARY ? http(PRIMARY) : http(DEFAULT_RPC);

export const createReads = (): PublicClient =>
  createPublicClient({
    chain: whitechainSepolia,
    pollingInterval: 1000,
    transport: PRIMARY
      ? http(PRIMARY)
      : fallback([http(DEFAULT_RPC), http(BACKUP_RPC)]),
  }) as PublicClient;

export const receiptUrl = (txHash: string): string =>
  `${whitechainSepolia.blockExplorers.default.url}/tx/${txHash}`;
