/**
 * Swaps WBT for USDT through SwapRouter02. Prints no keys.
 * Usage: bun scripts/swap-usdt.ts [amountWbt]
 */
import { USDT, whitechainSepolia } from "@hundi/wallet/chain-io";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  type Hex,
  http,
  parseAbi,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROUTER = "0xe208cc685cd95d56e8ec6dec9816476567fc6962";
const WRAPPED_WBT = "0x4200000000000000000000000000000000000006";
const POOL_FEE = 3000;
const SLIPPAGE_DIVISOR = 50n;

const routerAbi = parseAbi([
  "struct Params { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(Params params) payable returns (uint256 amountOut)",
]);

const key = process.env.RELAYER_PRIVATE_KEY;
if (!key) {
  throw new Error("Missing RELAYER_PRIVATE_KEY");
}
const account = privateKeyToAccount(key as Hex);
const transport = http(process.env.RPC_1874);
const chain = createPublicClient({ chain: whitechainSepolia, transport });
const wallet = createWalletClient({
  account,
  chain: whitechainSepolia,
  transport,
});

const amountIn = parseEther(process.argv[2] ?? "1");
const params = {
  amountIn,
  amountOutMinimum: 0n,
  fee: POOL_FEE,
  recipient: account.address,
  sqrtPriceLimitX96: 0n,
  tokenIn: WRAPPED_WBT,
  tokenOut: USDT,
} as const;

const quote = await chain.simulateContract({
  abi: routerAbi,
  account,
  address: ROUTER,
  args: [params],
  functionName: "exactInputSingle",
  value: amountIn,
});
const amountOutMinimum = quote.result - quote.result / SLIPPAGE_DIVISOR;
const { request } = await chain.simulateContract({
  abi: routerAbi,
  account,
  address: ROUTER,
  args: [{ ...params, amountOutMinimum }],
  functionName: "exactInputSingle",
  value: amountIn,
});
const hash = await wallet.writeContract(request);
const receipt = await chain.waitForTransactionReceipt({ hash });
const balance = await chain.readContract({
  abi: erc20Abi,
  address: USDT,
  args: [account.address],
  functionName: "balanceOf",
});

console.log(`status   ${receipt.status}`);
console.log(`quote    ${quote.result} atoms`);
console.log(`balance  ${balance} atoms`);
console.log(`explorer https://explorer.testnet.whitechain.io/tx/${hash}`);
