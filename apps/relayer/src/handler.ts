import { VAULT } from "@hundi/wallet/chain-io";
import type { Account, Hex, PublicClient, WalletClient } from "viem";
import { z } from "zod";
import {
  earnedFee,
  gasCostInAtoms,
  offeredFee,
  type RateLimiter,
} from "./policy";

const MAX_CALLDATA_CHARS = 8192;

const Body = z.object({
  data: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/u)
    .max(MAX_CALLDATA_CHARS),
});

const CORS = {
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
};

const json = (status: number, body: object): Response =>
  Response.json(body, { headers: CORS, status });

const refuse = (status: number, error: string): Response =>
  json(status, { error });

export interface RelayerDeps {
  account: Account;
  limiter: RateLimiter;
  log: (fields: object, message: string) => void;
  reads: PublicClient;
  wallet: WalletClient;
}

/** One relayer account has one nonce, so sends run in turn. */
const serial = () => {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
};

export const createHandler = (deps: RelayerDeps) => {
  const { account, limiter, log, reads, wallet } = deps;
  const inTurn = serial();

  const submit = async (data: Hex): Promise<Response> => {
    if (offeredFee(data) === undefined) {
      return refuse(403, "only_load_or_settle");
    }
    const [simulated, gasPrice] = await Promise.all([
      reads.simulateCalls({
        account: account.address,
        calls: [{ data, to: VAULT }],
      }),
      reads.getGasPrice(),
    ]);
    const [result] = simulated.results;
    if (result?.status !== "success") {
      log({ reason: result?.error?.message }, "refused a failing call");
      return refuse(422, "would_fail");
    }
    const earned = earnedFee(data, result.logs ?? []);
    const cost = gasCostInAtoms(result.gasUsed, gasPrice);
    if (earned < cost) {
      log({ cost, earned }, "refused a call that would lose money");
      return refuse(402, "fee_too_low");
    }
    const hash = await inTurn(() =>
      wallet.sendTransaction({
        account,
        chain: wallet.chain,
        data,
        to: VAULT,
      })
    );
    log({ earned, hash }, "sent");
    return json(200, { hash });
  };

  return async (request: Request, ip: string): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS, status: 204 });
    }
    if (request.method !== "POST" || !pathname.endsWith("/submit")) {
      return refuse(404, "not_found");
    }
    if (!limiter.allow(ip, Date.now())) {
      return refuse(429, "slow_down");
    }
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return refuse(400, "bad_request");
    }
    try {
      return await submit(body.data.data as Hex);
    } catch (cause) {
      log(
        { reason: cause instanceof Error ? cause.message : "unknown" },
        "failed"
      );
      return refuse(502, "try_again");
    }
  };
};
