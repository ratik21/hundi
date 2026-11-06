/**
 * PLAN.md Appendix F on the Whitechain testnet with 1 USDT notes, through the
 * relayer. Proves re-spend and the double-spend claim on the real chain. Prints no keys.
 * Usage: bun scripts/story-check.ts <relayerUrl>
 */
import { keyId } from "@hundi/core/bytes";
import { vaultAbi } from "@hundi/wallet/abi.generated";
import {
  createReads,
  createWrites,
  USDT,
  VAULT,
  whitechainSepolia,
} from "@hundi/wallet/chain-io";
import { deviceKeyFrom, generateKeyPair } from "@hundi/wallet/keystore";
import { memoryStore } from "@hundi/wallet/store";
import {
  formatUsdt,
  openWallet,
  usdt,
  type Wallet,
} from "@hundi/wallet/wallet";
import { createWalletClient, erc20Abi, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const [relayerUrl] = process.argv.slice(2);
const key = process.env.RELAYER_PRIVATE_KEY;
if (!(relayerUrl && key)) {
  throw new Error("Usage: bun scripts/story-check.ts <relayerUrl>");
}
const reads = createReads();
if ((await reads.getChainId()) !== whitechainSepolia.id) {
  throw new Error("Testnet only");
}
const treasury = createWalletClient({
  account: privateKeyToAccount(key as Hex),
  chain: whitechainSepolia,
  transport: http(process.env.RPC_1874),
});

const newWallet = async () =>
  openWallet({
    device: await deviceKeyFrom(await generateKeyPair()),
    reads,
    relayer: relayerUrl,
    store: memoryStore(),
    writes: createWrites(),
  });

const seed = async (wallet: Wallet, amount: bigint) => {
  const hash = await treasury.writeContract({
    abi: erc20Abi,
    address: USDT,
    args: [wallet.address, amount],
    functionName: "transfer",
  });
  await reads.waitForTransactionReceipt({ hash });
};

const usdtOf = (owner: Hex) =>
  reads.readContract({
    abi: erc20Abi,
    address: USDT,
    args: [owner],
    functionName: "balanceOf",
  });

const bondOf = async (wallet: Wallet) => {
  const [amount] = await reads.readContract({
    abi: vaultAbi,
    address: VAULT,
    args: [keyId(wallet.key)],
    functionName: "bonds",
  });
  return amount;
};

const burned = () =>
  reads.readContract({ abi: vaultAbi, address: VAULT, functionName: "burned" });

const handOver = async (from: Wallet, to: Wallet) => {
  const target = to.request(usdt(1));
  const payment = await from.pay(target);
  const verdict = await to.receive(payment, target);
  if (!verdict.ok) {
    throw new Error(`Refused: ${verdict.reason}`);
  }
  return payment.hops.length;
};

const customer = await newWallet();
const stall = await newWallet();
const supplier = await newWallet();
await seed(customer, usdt(6.1));
await seed(stall, usdt(2.1));

console.log(
  `customer load ${await customer.load({ bond: usdt(4), notes: [usdt(1), usdt(1)] })}`
);
console.log(`stall load    ${await stall.load({ bond: usdt(2), notes: [] })}`);
await Promise.all([customer.sync(), stall.sync(), supplier.sync()]);
const burnedBefore = await burned();

console.log(`note 1 to stall, hops ${await handOver(customer, stall)}`);
console.log(
  `note 1 re-spent to supplier, hops ${await handOver(stall, supplier)}`
);
console.log(`note 2 to stall, hops ${await handOver(customer, stall)}`);
await customer.updateSettings({ guard: false });
console.log(
  `note 2 again to supplier, hops ${await handOver(customer, supplier)}`
);

const print = (_: string, value: unknown) =>
  typeof value === "bigint" ? formatUsdt(value) : value;
for (const report of await supplier.settle()) {
  console.log(`supplier ${JSON.stringify(report, print)}`);
}
for (const report of await stall.settle()) {
  console.log(`stall    ${JSON.stringify(report, print)}`);
}

console.log(`customer bond ${formatUsdt(await bondOf(customer))} (was 4)`);
console.log(`stall bond    ${formatUsdt(await bondOf(stall))} (was 2)`);
console.log(`burned        +${formatUsdt((await burned()) - burnedBefore)}`);
console.log(`supplier got  ${formatUsdt(await usdtOf(supplier.address))}`);
console.log(`stall got     ${formatUsdt(await usdtOf(stall.address))}`);
