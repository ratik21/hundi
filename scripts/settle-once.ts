/**
 * One full note on the Whitechain testnet, using WebCrypto P-256 keys as a phone does.
 * The demo client funds it, the relayer pays gas. Prints no keys.
 * Usage: bun scripts/settle-once.ts
 */
import { readFile } from "node:fs/promises";
import {
  domain,
  hopMessage,
  linkOf,
  noteId,
  settleMessage,
} from "@hundi/core/bytes";
import type {
  Bytes16,
  Hex32,
  Address as HundiAddress,
  PublicKey,
  Slot,
  UnixSeconds,
  UsdtAtoms,
} from "@hundi/core/types";
import { vaultAbi } from "@hundi/wallet/abi.generated";
import {
  loadNonce,
  RECEIVE_WITH_AUTHORIZATION_TYPES,
  USDT,
  USDT_DOMAIN,
  whitechainSepolia,
} from "@hundi/wallet/chain-io";
import {
  type Address,
  bytesToHex,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  type Hex,
  http,
  parseEventLogs,
  parseSignature,
  slice,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const TESTNET_CHAIN_ID = 1874;
const FACE = 5_000_000n;
const BOND = 10_000_000n;
const LIFETIME_SECONDS = 1800n;
const GRACE_SECONDS = 3600n;

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

const newKey = async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"]
  );
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey)
  );
  const key: PublicKey = {
    x: bytesToHex(raw.slice(1, 33)) as Hex32,
    y: bytesToHex(raw.slice(33, 65)) as Hex32,
  };
  const sign = async (message: Uint8Array) => {
    const sig = bytesToHex(
      new Uint8Array(
        await crypto.subtle.sign(
          { hash: "SHA-256", name: "ECDSA" },
          pair.privateKey,
          message as BufferSource
        )
      )
    );
    return { r: slice(sig, 0, 32), s: slice(sig, 32, 64) };
  };
  return { key, sign };
};

const deployment = JSON.parse(await readFile("deployments/1874.json", "utf8"));
const vault = deployment.vault as Address;

const transport = http(required("RPC_1874"));
const chain = createPublicClient({ chain: whitechainSepolia, transport });
if ((await chain.getChainId()) !== TESTNET_CHAIN_ID) {
  throw new Error("Testnet only");
}
const relayer = privateKeyToAccount(required("RELAYER_PRIVATE_KEY") as Hex);
const client = privateKeyToAccount(required("CLIENT_DEMO_PRIVATE_KEY") as Hex);
const wallet = createWalletClient({
  account: relayer,
  chain: whitechainSepolia,
  transport,
});
const payTo = relayer.address;

const usdtOf = (owner: Address) =>
  chain.readContract({
    abi: erc20Abi,
    address: USDT,
    args: [owner],
    functionName: "balanceOf",
  });

const send = async (label: string, hash: Hex) => {
  const receipt = await chain.waitForTransactionReceipt({ hash });
  console.log(`${label} ${receipt.status} gas ${receipt.gasUsed}`);
  console.log(`  https://explorer.testnet.whitechain.io/tx/${hash}`);
  if (receipt.status !== "success") {
    throw new Error(`${label} reverted`);
  }
  return receipt;
};

const value = FACE + BOND;
if ((await usdtOf(client.address)) < value) {
  await send(
    "fund  ",
    await wallet.writeContract({
      abi: erc20Abi,
      address: USDT,
      args: [client.address, value],
      functionName: "transfer",
    })
  );
}

const customer = await newKey();
const stall = await newKey();
const serial = toHex(crypto.getRandomValues(new Uint8Array(16))) as Bytes16;
const now = BigInt(Math.floor(Date.now() / 1000));
const expiry = (now + LIFETIME_SECONDS) as UnixSeconds;

const loadArgs = {
  bond: BOND,
  fee: 0n,
  lockedUntil: expiry + GRACE_SECONDS,
  notes: [{ expiry, face: FACE, serial }],
  x: customer.key.x,
  y: customer.key.y,
};
const validBefore = now + LIFETIME_SECONDS;
const nonce = loadNonce(loadArgs, vault, BigInt(TESTNET_CHAIN_ID));
const signature = await client.signTypedData({
  domain: USDT_DOMAIN,
  message: {
    from: client.address,
    nonce,
    to: vault,
    validAfter: 0n,
    validBefore,
    value,
  },
  primaryType: "ReceiveWithAuthorization",
  types: RECEIVE_WITH_AUTHORIZATION_TYPES,
});
const { r, s, v, yParity } = parseSignature(signature);
const permit = {
  from: client.address,
  r,
  s,
  v: Number(v ?? BigInt(yParity + 27)),
  validAfter: 0n,
  validBefore,
};
const loadRequest = await chain.simulateContract({
  abi: vaultAbi,
  account: relayer,
  address: vault,
  args: [loadArgs, permit],
  functionName: "load",
});
await send("load  ", await wallet.writeContract(loadRequest.request));

const dom = domain(BigInt(TESTNET_CHAIN_ID), vault as HundiAddress);
const id = noteId(dom, {
  expiry,
  face: FACE as UsdtAtoms,
  owner: customer.key,
  serial,
});

// Offline in the product: the customer signs one hop, the stall signs one settle.
const hop = hopMessage(id as unknown as Slot, stall.key);
const hopSig = await customer.sign(hop);
const tail = settleMessage(
  linkOf(hop) as unknown as Slot,
  payTo as HundiAddress,
  0n as UsdtAtoms
);
const tailSig = await stall.sign(tail);

const before = await usdtOf(payTo);
const settleRequest = await chain.simulateContract({
  abi: vaultAbi,
  account: relayer,
  address: vault,
  args: [
    { expiry, face: FACE, serial, x: customer.key.x, y: customer.key.y },
    [{ ...hopSig, x: stall.key.x, y: stall.key.y }],
    { fee: 0n, payTo, ...tailSig },
  ],
  functionName: "settle",
});
const receipt = await send(
  "settle",
  await wallet.writeContract(settleRequest.request)
);

const moved = parseEventLogs({
  abi: erc20Abi,
  eventName: "Transfer",
  logs: receipt.logs,
}).filter((log) => log.address.toLowerCase() === USDT.toLowerCase());
for (const log of moved) {
  console.log(
    `transfer ${log.args.from} -> ${log.args.to} ${log.args.value} atoms`
  );
}
console.log(`noteId  ${id}`);
console.log(`payTo gained ${(await usdtOf(payTo)) - before} atoms`);
