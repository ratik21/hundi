import { vaultAbi } from "@hundi/wallet/abi.generated";
import {
  decodeFunctionData,
  type Hex,
  type Log,
  parseEventLogs,
  type RpcLog,
} from "viem";

/** The Whitechain pool sat near 73 USDT per WBT, so gas costs err in the relayer's favour. */
export const USDT_PER_WBT = 75n;
/** wei per WBT divided by atoms per USDT. */
const WEI_PER_ATOM = 10n ** 12n;

const decode = (data: Hex) => {
  try {
    return decodeFunctionData({ abi: vaultAbi, data });
  } catch {
    return null;
  }
};

/** The fee the call offers, before any cap from a short payout. */
export const offeredFee = (data: Hex): bigint | undefined => {
  const call = decode(data);
  if (call?.functionName === "load") {
    return call.args[0].fee;
  }
  if (call?.functionName === "settle") {
    return call.args[2].fee;
  }
};

/** What the relayer really earns, reading the payout from the simulated logs. */
export const earnedFee = (
  data: Hex,
  logs: readonly (Log | RpcLog)[]
): bigint => {
  const offered = offeredFee(data) ?? 0n;
  if (decode(data)?.functionName !== "settle") {
    return offered;
  }
  const [settled] = parseEventLogs({
    abi: vaultAbi,
    eventName: "Settled",
    logs: logs as Log[],
  });
  const paid = settled?.args.paid ?? 0n;
  if (paid < offered) {
    return paid;
  }
  return offered;
};

export const gasCostInAtoms = (gas: bigint, gasPrice: bigint): bigint =>
  (gas * gasPrice * USDT_PER_WBT) / WEI_PER_ATOM;

/** Below this the relayer buys gas with the USDT fees it has earned. */
export const REFILL_BELOW_WEI = 10n ** 17n;
/** About 40 settles of gas. Small, so one bad price can only cost a little. */
export const REFILL_ATOMS = 2_000_000n;
const REFILL_RESERVE = 2n;
const FLOOR_PERCENT = 90n;
const PERCENT = 100n;

export interface Balances {
  usdt: bigint;
  wbt: bigint;
}

/** How much USDT to swap for gas, if any. */
export const refillAtoms = (
  { usdt, wbt }: Balances,
  below = REFILL_BELOW_WEI
): bigint | undefined =>
  wbt < below && usdt >= REFILL_RESERVE * REFILL_ATOMS
    ? REFILL_ATOMS
    : undefined;

/** A fixed floor, so a moved pool cannot take more than a small part of one swap. */
export const leastWeiFor = (atoms: bigint): bigint =>
  (atoms * WEI_PER_ATOM * FLOOR_PERCENT) / (USDT_PER_WBT * PERCENT);

export interface RateLimiter {
  allow: (ip: string, now: number) => boolean;
}

export const fixedWindowLimiter = (
  limit: number,
  windowMs: number
): RateLimiter => {
  const windows = new Map<string, { count: number; resetsAt: number }>();
  return {
    allow: (ip, now) => {
      const current = windows.get(ip);
      if (!current || now >= current.resetsAt) {
        windows.set(ip, { count: 1, resetsAt: now + windowMs });
        return true;
      }
      current.count += 1;
      return current.count <= limit;
    },
  };
};
