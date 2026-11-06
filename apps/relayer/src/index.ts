/** Carries load and settle calls for devices with no gas. Testnet only. */
import { whitechainSepolia } from "@hundi/wallet/chain-io";
import { serve } from "bun";
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
import { createHandler } from "./handler";
import { fixedWindowLimiter } from "./policy";

const REQUESTS_PER_WINDOW = 20;
const WINDOW_MS = 60_000;

const Env = z.object({
  PORT: z.coerce.number().default(8787),
  RELAYER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/u),
  RPC_1874: z.url(),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  // Names and rule messages only, never values.
  for (const issue of parsed.error.issues) {
    console.error(`${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}
const env = parsed.data;
const logger = pino();
const transport = http(env.RPC_1874);
const account = privateKeyToAccount(env.RELAYER_PRIVATE_KEY as Hex);
const reads = createPublicClient({
  chain: whitechainSepolia,
  transport,
}) as PublicClient;

if ((await reads.getChainId()) !== whitechainSepolia.id) {
  logger.fatal("Testnet only");
  process.exit(1);
}

const handle = createHandler({
  account,
  limiter: fixedWindowLimiter(REQUESTS_PER_WINDOW, WINDOW_MS),
  log: (fields, message) => logger.info(fields, message),
  reads,
  wallet: createWalletClient({
    account,
    chain: whitechainSepolia,
    transport,
  }),
});

const server = serve({
  fetch: (request, self) =>
    handle(
      request,
      request.headers.get("cf-connecting-ip") ??
        self.requestIP(request)?.address ??
        "unknown"
    ),
  port: env.PORT,
});
logger.info({ address: account.address, port: server.port }, "relayer up");
