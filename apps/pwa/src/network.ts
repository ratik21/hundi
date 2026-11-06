import {
  createWrites,
  createReads as readsFor,
  relayerFrom,
} from "@hundi/wallet/chain-io";

import { LAB_URL } from "@hundi/wallet/lab";

const RPC = import.meta.env.VITE_RPC_URL as string | undefined;

export const createReads = () => readsFor(RPC);
export const relayerUrl = LAB_URL
  ? () => Promise.resolve(undefined)
  : relayerFrom("/relayer.txt");
export const writes = createWrites(RPC);
