/**
 * Runs the relayer's gas refill once on the testnet, whatever its balance.
 * Usage: bun scripts/refill-once.ts. Prints no keys.
 */

import { whitechainSepolia } from "@hundi/wallet/chain-io";
import {
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  type PublicClient,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { refill } from "../apps/relayer/src/refill";

const ANY_BALANCE = parseEther("1000");

const key = process.env.RELAYER_PRIVATE_KEY;
if (!key) {
  throw new Error("Missing RELAYER_PRIVATE_KEY");
}
const account = privateKeyToAccount(key as Hex);
const transport = http(process.env.RPC_1874);
const reads = createPublicClient({
  chain: whitechainSepolia,
  transport,
}) as PublicClient;
const wallet = createWalletClient({
  account,
  chain: whitechainSepolia,
  transport,
});

const before = await reads.getBalance({ address: account.address });
const hash = await refill({ account, reads, wallet }, ANY_BALANCE);
const after = await reads.getBalance({ address: account.address });

console.log(`gained   ${after - before} wei, after gas`);
console.log(`explorer https://explorer.testnet.whitechain.io/tx/${hash}`);
