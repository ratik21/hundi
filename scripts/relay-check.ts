/**
 * PLAN.md U6 on the Whitechain testnet. A device with no gas settles through the
 * relayer, then the relayer stops and the device settles directly. Prints no keys.
 * Usage: bun scripts/relay-check.ts <relayerUrl> <relayerPid>
 */
import { USDT, whitechainSepolia } from "@hundi/wallet/chain-io";
import { deviceKeyFrom, generateKeyPair } from "@hundi/wallet/keystore";
import { memoryStore } from "@hundi/wallet/store";
import { formatUsdt, openWallet, usdt } from "@hundi/wallet/wallet";
import { sleep } from "bun";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  type Hex,
  http,
  type PublicClient,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const [relayerUrl, relayerPid] = process.argv.slice(2);
if (!(relayerUrl && relayerPid)) {
  throw new Error(
    "Usage: bun scripts/relay-check.ts <relayerUrl> <relayerPid>"
  );
}
const key = process.env.RELAYER_PRIVATE_KEY;
if (!key) {
  throw new Error("Missing RELAYER_PRIVATE_KEY");
}

const transport = http(process.env.RPC_1874);
const reads = createPublicClient({
  chain: whitechainSepolia,
  pollingInterval: 1000,
  transport,
}) as PublicClient;
if ((await reads.getChainId()) !== whitechainSepolia.id) {
  throw new Error("Testnet only");
}
const treasury = createWalletClient({
  account: privateKeyToAccount(key as Hex),
  chain: whitechainSepolia,
  transport,
});

const newWallet = async () =>
  openWallet({
    device: await deviceKeyFrom(await generateKeyPair()),
    reads,
    relayer: relayerUrl,
    store: memoryStore(),
    writes: transport,
  });

const customer = await newWallet();
const stall = await newWallet();

const seed = await treasury.writeContract({
  abi: erc20Abi,
  address: USDT,
  args: [customer.address, usdt(6.1)],
  functionName: "transfer",
});
await reads.waitForTransactionReceipt({ hash: seed });

const gasOf = (address: Hex) => reads.getBalance({ address });
console.log(`customer gas ${await gasOf(customer.address)}`);
console.log(`stall gas    ${await gasOf(stall.address)}`);

const loaded = await customer.load({
  bond: usdt(4),
  notes: [usdt(1), usdt(1)],
});
console.log(`load through relayer ${loaded}`);
await stall.sync();

const receiveOne = async () => {
  const target = stall.request(usdt(1));
  const verdict = await stall.receive(await customer.pay(target), target);
  if (!verdict.ok) {
    throw new Error(`Refused: ${verdict.reason}`);
  }
};

await receiveOne();
const [relayed] = await stall.settle();
console.log(
  `relayed ${JSON.stringify(relayed, (_, v) => (typeof v === "bigint" ? formatUsdt(v) : v))}`
);
console.log(`stall gas after relay ${await gasOf(stall.address)}`);

process.kill(Number(relayerPid));
await sleep(1000);
const down = await fetch(`${relayerUrl}/submit`, {
  body: "{}",
  method: "POST",
}).then(
  (response) => `status ${response.status}`,
  (error: Error) => `failed: ${error.message}`
);
console.log(`relayer after stop: ${down}`);

const gas = await treasury.sendTransaction({
  to: stall.address,
  value: parseEther("0.002"),
});
await reads.waitForTransactionReceipt({ hash: gas });
await stall.updateSettings({ submitDirectly: true });
await receiveOne();
const [direct] = await stall.settle();
console.log(
  `direct ${JSON.stringify(direct, (_, v) => (typeof v === "bigint" ? formatUsdt(v) : v))}`
);
