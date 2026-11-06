import {
  type Address,
  type ContractFunctionArgs,
  defineChain,
  encodeAbiParameters,
  type Hex,
  keccak256,
  parseAbiParameters,
} from "viem";
import { vaultAbi } from "./abi.generated";

export type LoadCall = ContractFunctionArgs<
  typeof vaultAbi,
  "nonpayable",
  "load"
>[0];

export const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";

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
