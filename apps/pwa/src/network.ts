import {
  createWrites,
  createReads as readsFor,
  relayerFrom,
} from "@hundi/wallet/chain-io";

import { LAB_URL } from "@hundi/wallet/lab";

const RPC = import.meta.env.VITE_RPC_URL as string | undefined;

export const createReads = () => readsFor(RPC);
const LAB_RELAYER = import.meta.env.VITE_RELAYER_URL as string | undefined;

export const relayerUrl = LAB_URL
  ? () => Promise.resolve(LAB_RELAYER)
  : relayerFrom("/relayer.txt");
export const writes = createWrites(RPC);
