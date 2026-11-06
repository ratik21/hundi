/** Stands in for cameras and the faucet in `bun run lab`. */
import { USDT, whitechainSepolia } from "@hundi/wallet/chain-io";
import { file, serve, write } from "bun";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  type Hex,
  http,
  parseEther,
  parseUnits,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const FORK = "http://127.0.0.1:8599";
const WBT = "0xDE0B6B3A7640000";
const LAB_USDT = 100_000_000n;
const USDT_DECIMALS = 6;
const CORS = { "access-control-allow-origin": "*" };

interface ShownCode {
  from: string;
  hex: string;
}

let shown: ShownCode | undefined;
const funded = new Set<string>();

const fork = (method: string, params: unknown[]) =>
  fetch(FORK, {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

const forkFund = async (address: string) => {
  await fork("anvil_setBalance", [address, WBT]);
  await fork("anvil_dealERC20", [address, USDT, toHex(LAB_USDT)]);
};

/** Real testnet funds for each role, so a video's explorer links are real. */
const TESTNET_ROLES: Record<string, { gas: string; usdt: string }> = {
  "5191": { gas: "0", usdt: process.env.LAB_CUSTOMER_USDT ?? "30.2" },
  "5192": { gas: "0.01", usdt: process.env.LAB_STALL_USDT ?? "10.2" },
};

const testnetFund = async (address: Address, from: string) => {
  const role = TESTNET_ROLES[new URL(from).port];
  if (!role) {
    return;
  }
  const transport = http(process.env.RPC_1874);
  const reads = createPublicClient({ chain: whitechainSepolia, transport });
  const wallet = createWalletClient({
    account: privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex),
    chain: whitechainSepolia,
    transport,
  });
  if (role.gas !== "0") {
    await reads.waitForTransactionReceipt({
      hash: await wallet.sendTransaction({
        to: address,
        value: parseEther(role.gas),
      }),
    });
  }
  await reads.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      abi: erc20Abi,
      address: USDT,
      args: [address, parseUnits(role.usdt, USDT_DECIMALS)],
      functionName: "transfer",
    }),
  });
};

const FUNDED_FILE = ".lab/funded.txt";
const fundedBefore = async () => {
  const funds = file(FUNDED_FILE);
  return (await funds.exists()) ? (await funds.text()).split("\n") : [];
};

const fund = async (address: Address, from: string, installed: boolean) => {
  if (process.env.LAB_TESTNET) {
    // Real funds go only to the home-screen wallet, the one the video films.
    if (!installed) {
      return;
    }
    const seen = await fundedBefore();
    if (!seen.includes(address)) {
      await write(FUNDED_FILE, [...seen, address].join("\n"));
      await testnetFund(address, from);
    }
    return;
  }
  if (!funded.has(address)) {
    funded.add(address);
    await forkFund(address);
  }
};

serve({
  fetch: async (request) => {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS, status: 204 });
    }
    if (url.pathname === "/fund") {
      const { address, from, installed } = (await request.json()) as {
        address: Address;
        from: string;
        installed: boolean;
      };
      await fund(address, from, installed);
      return Response.json({}, { headers: CORS });
    }
    if (request.method === "POST") {
      shown = (await request.json()) as ShownCode;
      return Response.json({}, { headers: CORS });
    }
    const code =
      shown && shown.from !== url.searchParams.get("for") ? shown : undefined;
    if (code) {
      shown = undefined;
    }
    return Response.json({ hex: code?.hex }, { headers: CORS });
  },
  port: 5190,
});
