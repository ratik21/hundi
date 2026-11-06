import { whitechainSepolia } from "@hundi/wallet/chain-io";
import pino from "pino";
import {
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { createHandler, type RelayerDeps } from "./handler";
import { fixedWindowLimiter } from "./policy";

const REQUESTS_PER_WINDOW = 20;
const WINDOW_MS = 60_000;

const Env = z.object({
  RELAYER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/u),
  RPC_1874: z.url(),
});

/** Builds the relayer from environment variables. Testnet only. */
export const relayerFromEnv = async (after: RelayerDeps["after"]) => {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    // Names and rule messages only, never values.
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    );
    throw new Error(problems.join("; "));
  }
  const logger = pino();
  const transport = http(parsed.data.RPC_1874);
  const account = privateKeyToAccount(parsed.data.RELAYER_PRIVATE_KEY as Hex);
  const reads = createPublicClient({
    chain: whitechainSepolia,
    transport,
  }) as PublicClient;
  if ((await reads.getChainId()) !== whitechainSepolia.id) {
    throw new Error("Testnet only");
  }
  logger.info({ address: account.address }, "relayer up");
  return createHandler({
    account,
    after,
    limiter: fixedWindowLimiter(REQUESTS_PER_WINDOW, WINDOW_MS),
    log: (fields, message) => logger.info(fields, message),
    reads,
    wallet: createWalletClient({
      account,
      chain: whitechainSepolia,
      transport,
    }),
  });
};
