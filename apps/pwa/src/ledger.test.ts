import { describe, expect, test } from "bun:test";
import type { Note, NoteId, PublicKey } from "@hundi/core/types";
import type { NoteRecord, Receipt } from "@hundi/wallet/store";
import { formatUsdt, type SettleResult } from "@hundi/wallet/wallet";
import type { Hex } from "viem";
import {
  activityOf,
  dollars,
  groupsTotal,
  noteGroups,
  receivedTotal,
  settleSummary,
  shortKey,
  tweened,
  whenLabel,
} from "./ledger";

const FIVE = 5_000_000n;
const SHORT_KEY = /^[0-9a-f]{4}…[0-9a-f]{4}$/u;
const TX = `0x${"ab".repeat(32)}` as const;
const NO_TX = `0x${"00".repeat(32)}` as const;
const id = (name: string) => name as NoteId;

const key = (byte: string) =>
  ({
    x: `0x${byte.repeat(32)}`,
    y: `0x${byte.repeat(32)}`,
  }) as unknown as PublicKey;
const OWNER = key("11");
const MIDDLE = key("22");
const ME = key("33");

const note = (face: bigint, hops = 0) =>
  ({
    header: { face, owner: OWNER },
    hops: hops === 0 ? [] : [MIDDLE, ME].slice(-hops).map((to) => ({ to })),
  }) as unknown as Note;

const record = (name: string, order: number, state: unknown) =>
  ({ id: id(name), order, state }) as NoteRecord;

const held = (name: string, order: number, hops = 0, face = FIVE) =>
  record(name, order, { kind: "held", note: note(face, hops) });

const receipt = (name: string, kind: Receipt["kind"], paid: bigint) =>
  ({ at: 0n, kind, noteId: id(name), paid, txHash: TX as Hex }) as Receipt;

describe("tweened", () => {
  test("holds at the start when a frame's clock runs early", () => {
    expect(tweened(0n, FIVE, -0.02)).toBe(0n);
    expect(tweened(FIVE, 0n, -0.02)).toBe(FIVE);
  });

  test("lands exactly on both ends, in either direction", () => {
    expect(tweened(FIVE, 0n, 0)).toBe(FIVE);
    expect(tweened(FIVE, 0n, 1)).toBe(0n);
    expect(tweened(0n, FIVE, 1)).toBe(FIVE);
  });

  test("moves fast first, so a change reads at once", () => {
    expect(tweened(0n, FIVE, 0.5)).toBeGreaterThan(FIVE / 2n);
    expect(tweened(FIVE, 0n, 0.5)).toBeLessThan(FIVE / 2n);
  });

  test("never runs past the target", () => {
    const steps = Array.from({ length: 21 }, (_, i) =>
      tweened(0n, FIVE, i / 20)
    );
    expect(steps).toEqual(steps.toSorted((a, b) => Number(a - b)));
    expect(steps.at(-1)).toBe(FIVE);
  });
});

describe("noteGroups", () => {
  test("counts held notes by face, largest first", () => {
    const groups = noteGroups([
      held("a", 1),
      held("b", 2, 1),
      held("c", 3, 0, 10_000_000n),
      record("d", 4, { kind: "offered", note: note(FIVE) }),
    ]);
    expect(groups).toEqual([
      { count: 1, face: 10_000_000n },
      { count: 2, face: FIVE },
    ]);
    expect(groupsTotal(groups)).toBe(20_000_000n);
  });
});

test("only notes from someone else can be settled", () => {
  expect(receivedTotal([held("a", 1), held("b", 2, 1)])).toBe(FIVE);
});

describe("activityOf", () => {
  test("lists newest first and leaves out notes this phone minted", () => {
    const lines = activityOf(
      [
        held("minted", 1),
        held("received", 2, 1),
        record("sent", 3, {
          hop: { to: MIDDLE },
          kind: "offered",
          note: note(FIVE, 1),
        }),
      ],
      []
    );
    expect(lines).toEqual([
      {
        amount: FIVE,
        id: "sent",
        kind: "sent",
        party: `To ${shortKey(MIDDLE)}`,
      },
      {
        amount: FIVE,
        id: "received",
        kind: "received",
        party: `From ${shortKey(OWNER)}`,
      },
    ]);
  });

  test("names the holder before this phone, not the first owner", () => {
    const [line] = activityOf([held("onward", 1, 2)], []);
    expect(line?.party).toBe(`From ${shortKey(MIDDLE)}`);
  });

  test("carries the time a state was written, when it has one", () => {
    const stamped = { ...held("received", 1, 1), at: 1000 };
    expect(activityOf([stamped], [])[0]?.at).toBe(1000);
  });

  test("uses the receipt for what actually arrived", () => {
    const lines = activityOf(
      [
        record("paid", 1, { kind: "settled", txHash: TX }),
        record("covered", 2, { kind: "settled", txHash: TX }),
        record("short", 3, { kind: "lost", txHash: TX }),
      ],
      [
        receipt("paid", "paid", 4_900_000n),
        receipt("covered", "covered", FIVE),
        receipt("short", "covered", 1_000_000n),
      ]
    );
    expect(lines).toEqual([
      { amount: 1_000_000n, id: "short", kind: "covered_in_part", receipt: TX },
      { amount: FIVE, id: "covered", kind: "covered", receipt: TX },
      { amount: 4_900_000n, id: "paid", kind: "paid_out", receipt: TX },
    ]);
  });

  test("a note settled elsewhere has no amount and no empty receipt", () => {
    const lines = activityOf(
      [record("gone", 1, { kind: "settled", txHash: NO_TX })],
      []
    );
    expect(lines).toEqual([{ id: "gone", kind: "paid_out" }]);
  });
});

describe("settleSummary", () => {
  const paid = (paidAmount: bigint) =>
    ({ kind: "paid", paid: paidAmount }) as SettleResult;
  const covered = { kind: "covered", paid: FIVE } as SettleResult;
  const failed = { kind: "failed", reason: "BondEmpty" } as SettleResult;
  const already = { kind: "already" } as SettleResult;

  test("a covered note leads, because that is the news", () => {
    expect(settleSummary([paid(FIVE), covered])).toEqual({
      amount: 2n * FIVE,
      failed: 0,
      word: "Covered",
    });
  });

  test("keeps counting failures beside a success", () => {
    expect(settleSummary([paid(FIVE), failed])).toEqual({
      amount: FIVE,
      failed: 1,
      word: "Claimed",
    });
  });

  test("nothing paid is either a failure or old news", () => {
    expect(settleSummary([failed]).word).toBe("Not claimed");
    expect(settleSummary([already]).word).toBe("Already claimed");
  });
});

describe("dollars", () => {
  test("shows whole and part dollars to the cent", () => {
    expect(dollars(0n)).toBe("$0.00");
    expect(dollars(10_000_000n)).toBe("$10.00");
    expect(dollars(4_900_000n)).toBe("$4.90");
    expect(dollars(50_000n)).toBe("$0.05");
  });
});

describe("formatUsdt", () => {
  test("shows part amounts to at least the cent, and whole amounts bare", () => {
    expect(formatUsdt(4_900_000n)).toBe("4.90");
    expect(formatUsdt(100_000n)).toBe("0.10");
    expect(formatUsdt(5_000_000n)).toBe("5");
    expect(formatUsdt(1_234_567n)).toBe("1.234567");
  });
});

describe("whenLabel", () => {
  const noon = new Date(2026, 10, 7, 12, 12).getTime();

  test("gives a time for today", () => {
    expect(whenLabel(noon, noon + 1000)).toStartWith("Today ");
  });

  test("gives a date before today", () => {
    const earlier = new Date(2026, 10, 6, 12, 12).getTime();
    expect(whenLabel(earlier, noon)).not.toStartWith("Today");
    expect(whenLabel(earlier, noon)).toContain("6");
  });
});

describe("shortKey", () => {
  test("keeps the two ends of the key's hash", () => {
    expect(shortKey(OWNER)).toMatch(SHORT_KEY);
    expect(shortKey(OWNER)).not.toBe(shortKey(MIDDLE));
  });
});
