/**
 * Sends test USDT and a little test gas to a phone's top-up address. Testnet only.
 * Usage: bun scripts/fund-device.ts <address> [usdt] [wbt]
 */
import { USDT, whitechainSepolia } from "@hundi/wallet/chain-io";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  getAddress,
  type Hex,
  http,
  parseEther,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const USDT_DECIMALS = 6;

const [target, amountUsdt = "40", amountWbt = "0.01"] = process.argv.slice(2);
if (!target) {
  throw new Error("Usage: bun scripts/fund-device.ts <address> [usdt] [wbt]");
}
const key = process.env.RELAYER_PRIVATE_KEY;
if (!key) {
  throw new Error("Missing RELAYER_PRIVATE_KEY");
}
const to = getAddress(target);
const transport = http(process.env.RPC_1874);
const chain = createPublicClient({ chain: whitechainSepolia, transport });
if ((await chain.getChainId()) !== whitechainSepolia.id) {
  throw new Error("Testnet only");
}
const wallet = createWalletClient({
  account: privateKeyToAccount(key as Hex),
  chain: whitechainSepolia,
  transport,
});

const gas = await wallet.sendTransaction({ to, value: parseEther(amountWbt) });
await chain.waitForTransactionReceipt({ hash: gas });
const hash = await wallet.writeContract({
  abi: erc20Abi,
  address: USDT,
  args: [to, parseUnits(amountUsdt, USDT_DECIMALS)],
  functionName: "transfer",
});
const receipt = await chain.waitForTransactionReceipt({ hash });
console.log(
  `${receipt.status} ${amountUsdt} USDT and ${amountWbt} WBT to ${to}`
);
