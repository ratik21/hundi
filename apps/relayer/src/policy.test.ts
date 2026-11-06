import { describe, expect, test } from "bun:test";
import { vaultAbi } from "@hundi/wallet/abi.generated";
import { encodeFunctionData, type Hex, zeroAddress } from "viem";
import {
  earnedFee,
  fixedWindowLimiter,
  gasCostInAtoms,
  leastWeiFor,
  offeredFee,
  REFILL_ATOMS,
  REFILL_BELOW_WEI,
  refillAtoms,
} from "./policy";

const ZERO = `0x${"00".repeat(32)}` as Hex;
const header = {
  expiry: 1n,
  face: 5_000_000n,
  serial: `0x${"00".repeat(16)}` as Hex,
  x: ZERO,
  y: ZERO,
};
const settle = (fee: bigint) =>
  encodeFunctionData({
    abi: vaultAbi,
    args: [header, [], { fee, payTo: zeroAddress, r: ZERO, s: ZERO }],
    functionName: "settle",
  });

describe("offeredFee", () => {
  test("reads the fee from a settle", () => {
    expect(offeredFee(settle(100_000n))).toBe(100_000n);
  });

  test("refuses every other vault function and foreign calldata", () => {
    const reclaim = encodeFunctionData({
      abi: vaultAbi,
      args: [ZERO],
      functionName: "reclaim",
    });
    expect(offeredFee(reclaim)).toBeUndefined();
    expect(offeredFee("0xa9059cbb")).toBeUndefined();
  });
});

test("a settle earns the fee, capped by a payout the logs do not show", () => {
  expect(earnedFee(settle(100_000n), [])).toBe(0n);
});

test("gas cost at the measured settle price is about 0.044 USDT", () => {
  expect(gasCostInAtoms(117_629n, 5_001_000_000n)).toBe(44_119n);
});

describe("fixedWindowLimiter", () => {
  test("stops an IP at the limit, resets later, and leaves others alone", () => {
    const limiter = fixedWindowLimiter(2, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(true);
    expect(limiter.allow("a", 2)).toBe(false);
    expect(limiter.allow("b", 2)).toBe(true);
    expect(limiter.allow("a", 1000)).toBe(true);
  });
});

describe("refillAtoms", () => {
  const low = REFILL_BELOW_WEI - 1n;

  test("buys gas once WBT runs low", () => {
    expect(refillAtoms({ usdt: 10_000_000n, wbt: low })).toBe(REFILL_ATOMS);
  });

  test("does nothing with enough WBT", () => {
    expect(
      refillAtoms({ usdt: 10_000_000n, wbt: REFILL_BELOW_WEI })
    ).toBeUndefined();
  });

  test("keeps a reserve of USDT", () => {
    expect(
      refillAtoms({ usdt: 2n * REFILL_ATOMS - 1n, wbt: low })
    ).toBeUndefined();
  });
});

describe("leastWeiFor", () => {
  test("accepts 90 percent of the fixed rate", () => {
    expect(leastWeiFor(75_000_000n)).toBe(9n * 10n ** 17n);
  });
});
