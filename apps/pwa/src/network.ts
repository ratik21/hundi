import {
  createWrites,
  createReads as readsFor,
  relayerFrom,
} from "@hundi/wallet/chain-io";

const RPC = import.meta.env.VITE_RPC_URL as string | undefined;

export const createReads = () => readsFor(RPC);
export const relayerUrl = relayerFrom("/relayer.txt");
export const writes = createWrites(RPC);
