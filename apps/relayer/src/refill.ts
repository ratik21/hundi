import { USDT } from "@hundi/wallet/chain-io";
import {
  type Account,
  encodeFunctionData,
  erc20Abi,
  type Hash,
  type PublicClient,
  parseAbi,
  type WalletClient,
} from "viem";
import { leastWeiFor, REFILL_BELOW_WEI, refillAtoms } from "./policy";

/** Uniswap v3 SwapRouter02 on Whitechain. Its factory is a verified UniswapV3Factory. */
export const ROUTER = "0xe208cc685cd95d56e8ec6dec9816476567fc6962";
const WRAPPED_WBT = "0x4200000000000000000000000000000000000006";
const POOL_FEE = 3000;
const DEADLINE_SECONDS = 300n;
/** SwapRouter02 reads this recipient as itself, so it can unwrap in the same call. */
const ROUTER_ITSELF = "0x0000000000000000000000000000000000000002";

const routerAbi = parseAbi([
  "struct Params { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(Params params) payable returns (uint256 amountOut)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[])",
]);

export interface RefillDeps {
  account: Account;
  reads: PublicClient;
  wallet: WalletClient;
}

/** One call: swap USDT for wrapped WBT, then unwrap it to the relayer as gas. */
const swapCalls = (atoms: bigint, recipient: `0x${string}`) => {
  const least = leastWeiFor(atoms);
  return [
    encodeFunctionData({
      abi: routerAbi,
      args: [
        {
          amountIn: atoms,
          amountOutMinimum: least,
          fee: POOL_FEE,
          recipient: ROUTER_ITSELF,
          sqrtPriceLimitX96: 0n,
          tokenIn: USDT,
          tokenOut: WRAPPED_WBT,
        },
      ],
      functionName: "exactInputSingle",
    }),
    encodeFunctionData({
      abi: routerAbi,
      args: [least, recipient],
      functionName: "unwrapWETH9",
    }),
  ];
};

/**
 * Turns earned USDT fees into WBT through Uniswap once gas runs low. Every call
 * is simulated first, and sends nothing that would fail.
 */
export const refill = async (
  { account, reads, wallet }: RefillDeps,
  below = REFILL_BELOW_WEI
): Promise<Hash | undefined> => {
  const [wbt, usdt, allowance] = await Promise.all([
    reads.getBalance({ address: account.address }),
    reads.readContract({
      abi: erc20Abi,
      address: USDT,
      args: [account.address],
      functionName: "balanceOf",
    }),
    reads.readContract({
      abi: erc20Abi,
      address: USDT,
      args: [account.address, ROUTER],
      functionName: "allowance",
    }),
  ]);
  const atoms = refillAtoms({ usdt, wbt }, below);
  if (atoms === undefined) {
    return;
  }
  if (allowance < atoms) {
    const { request } = await reads.simulateContract({
      abi: erc20Abi,
      account,
      address: USDT,
      args: [ROUTER, atoms],
      functionName: "approve",
    });
    await reads.waitForTransactionReceipt({
      hash: await wallet.writeContract(request),
    });
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  const { request } = await reads.simulateContract({
    abi: routerAbi,
    account,
    address: ROUTER,
    args: [now + DEADLINE_SECONDS, swapCalls(atoms, account.address)],
    functionName: "multicall",
  });
  const hash = await wallet.writeContract(request);
  await reads.waitForTransactionReceipt({ hash });
  return hash;
};
