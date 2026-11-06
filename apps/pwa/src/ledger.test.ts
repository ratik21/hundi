import { describe, expect, test } from "bun:test";
import type { Note, NoteId } from "@hundi/core/types";
import type { NoteRecord, Receipt } from "@hundi/wallet/store";
import type { SettleResult } from "@hundi/wallet/wallet";
import type { Hex } from "viem";
import {
  activityOf,
  groupsTotal,
  noteGroups,
  receivedTotal,
  settleSummary,
} from "./ledger";

const FIVE = 5_000_000n;
const TX = `0x${"ab".repeat(32)}` as const;
const NO_TX = `0x${"00".repeat(32)}` as const;
const id = (name: string) => name as NoteId;

const note = (face: bigint, hops = 0) =>
  ({ header: { face }, hops: Array.from({ length: hops }) }) as unknown as Note;

const record = (name: string, order: number, state: unknown) =>
  ({ id: id(name), order, state }) as NoteRecord;

const held = (name: string, order: number, hops = 0, face = FIVE) =>
  record(name, order, { kind: "held", note: note(face, hops) });

const receipt = (name: string, kind: Receipt["kind"], paid: bigint) =>
  ({ at: 0n, kind, noteId: id(name), paid, txHash: TX as Hex }) as Receipt;

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
        record("sent", 3, { kind: "offered", note: note(FIVE, 1) }),
      ],
      []
    );
    expect(lines).toEqual([
      { amount: FIVE, id: "sent", kind: "sent" },
      { amount: FIVE, id: "received", kind: "received" },
    ]);
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
      word: "Settled",
    });
  });

  test("nothing paid is either a failure or old news", () => {
    expect(settleSummary([failed]).word).toBe("Not settled");
    expect(settleSummary([already]).word).toBe("Already paid");
  });
});
