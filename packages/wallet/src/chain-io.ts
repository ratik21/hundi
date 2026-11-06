import type { ChainEvent } from "@hundi/core/snapshot";
import type {
  Hex32,
  KeyId,
  NoteId,
  UnixSeconds,
  UsdtAtoms,
} from "@hundi/core/types";
import {
  type Account,
  type Address,
  BaseError,
  type ContractFunctionArgs,
  ContractFunctionRevertedError,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  type Hex,
  keccak256,
  type PublicClient,
  parseAbiParameters,
  parseEventLogs,
  type TransactionReceipt,
  type Transport,
} from "viem";
import deployment from "../../../deployments/1874.json";
import { vaultAbi } from "./abi.generated";

export type LoadCall = ContractFunctionArgs<
  typeof vaultAbi,
  "nonpayable",
  "load"
>[0];

export const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
export const VAULT = deployment.vault as Address;
export const DEPLOY_BLOCK = BigInt(deployment.deployBlock);
export const GRACE = BigInt(deployment.grace);
export const CHAIN_ID = BigInt(deployment.chainId);

/** The Whitechain RPC refuses `eth_getLogs` over 10,000 blocks. */
const LOG_CHUNK = 9000n;

export const whitechainSepolia = defineChain({
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://explorer.testnet.whitechain.io",
    },
  },
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { decimals: 18, name: "WBT", symbol: "WBT" },
  rpcUrls: { default: { http: ["https://rpc.testnet.whitechain.io/"] } },
});

/** Hardcoded because `eip712Domain()` reverts on the token. */
export const USDT_DOMAIN = {
  chainId: 1874,
  name: "Tether USD",
  verifyingContract: USDT,
  version: "1",
} as const;

export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const LOAD_ARGS = vaultAbi
  .find((item) => item.type === "function" && item.name === "load")
  ?.inputs.slice(0, 1);

/** The EIP-3009 nonce that pins every `load` argument, so a relayer cannot change them. */
export const loadNonce = (
  args: LoadCall,
  vault: Address,
  chainId: bigint
): Hex =>
  keccak256(
    encodeAbiParameters(
      parseAbiParameters("string, uint256, address, bytes32"),
      [
        "HUNDI_LOAD",
        chainId,
        vault,
        keccak256(encodeAbiParameters(LOAD_ARGS ?? [], [args])),
      ]
    )
  );

const toChainEvent = (
  log: ReturnType<typeof parseEventLogs<typeof vaultAbi>>[number]
): ChainEvent | undefined => {
  if (log.eventName === "NoteLoaded") {
    return {
      expiry: log.args.expiry as UnixSeconds,
      face: log.args.face as UsdtAtoms,
      kind: "NoteLoaded",
      noteId: log.args.noteId as Hex32 as NoteId,
    };
  }
  if (log.eventName === "BondChanged") {
    return {
      amount: log.args.amount as UsdtAtoms,
      keyId: log.args.keyId as Hex32 as KeyId,
      kind: "BondChanged",
      lockedUntil: log.args.lockedUntil as UnixSeconds,
    };
  }
  if (log.eventName === "Settled") {
    return { kind: "Settled", noteId: log.args.noteId as Hex32 as NoteId };
  }
};

const blockRanges = (from: bigint, to: bigint) => {
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let fromBlock = from; fromBlock <= to; fromBlock += LOG_CHUNK) {
    const end = fromBlock + LOG_CHUNK - 1n;
    ranges.push({ fromBlock, toBlock: end < to ? end : to });
  }
  return ranges;
};

/** Reads vault events oldest first, in chunks an RPC will accept. */
export const readEvents = async (
  reads: PublicClient,
  fromBlock: bigint,
  toBlock: bigint
): Promise<ChainEvent[]> => {
  const chunks = await Promise.all(
    blockRanges(fromBlock, toBlock).map((range) =>
      reads.getLogs({ address: VAULT, ...range })
    )
  );
  return parseEventLogs({ abi: vaultAbi, logs: chunks.flat() })
    .map(toChainEvent)
    .filter((event) => event !== undefined);
};

export interface SettledLog {
  liable: Hex;
  paid: bigint;
}

export const settledIn = (
  receipt: TransactionReceipt
): SettledLog | undefined => {
  const [log] = parseEventLogs({
    abi: vaultAbi,
    eventName: "Settled",
    logs: receipt.logs,
  });
  return log && { liable: log.args.liable, paid: log.args.paid };
};

/** Finds the transaction that settled a note to `payTo`, for a retry after a lost reply. */
export const findSettlement = async (
  reads: PublicClient,
  noteId: NoteId,
  payTo: Address,
  toBlock: bigint
): Promise<Hex | undefined> => {
  const chunks = await Promise.all(
    blockRanges(DEPLOY_BLOCK, toBlock).map((range) =>
      reads.getContractEvents({
        abi: vaultAbi,
        address: VAULT,
        args: { noteId },
        eventName: "Settled",
        ...range,
      })
    )
  );
  return chunks
    .flat()
    .find((log) => log.args.payTo?.toLowerCase() === payTo.toLowerCase())
    ?.transactionHash;
};

/** The vault's custom error name, or the message if it reverted some other way. */
export const revertReason = (error: unknown): string => {
  if (error instanceof BaseError) {
    const reverted = error.walk(
      (cause) => cause instanceof ContractFunctionRevertedError
    );
    if (reverted instanceof ContractFunctionRevertedError) {
      return reverted.data?.errorName ?? reverted.shortMessage;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "unknown";
};

/** Sends vault calldata and returns its transaction hash. */
export type Submit = (data: Hex) => Promise<Hex>;

export const directSubmit = (
  account: Account,
  transport: Transport
): Submit => {
  const client = createWalletClient({
    account,
    chain: whitechainSepolia,
    transport,
  });
  return (data) => client.sendTransaction({ data, to: VAULT });
};

export const relayerSubmit =
  (url: string): Submit =>
  async (data) => {
    const response = await fetch(`${url}/submit`, {
      body: JSON.stringify({ data }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = (await response.json()) as { error?: string; hash?: Hex };
    if (!(response.ok && body.hash)) {
      throw new Error(body.error ?? `Relayer returned ${response.status}`);
    }
    return body.hash;
  };
