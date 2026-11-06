import { expect, test } from "bun:test";
import type { NoteId } from "@hundi/core/types";
import { settlementCsv } from "./csv";

test("one row per payment, with an amount an accountant can read", () => {
  const csv = settlementCsv([
    {
      at: 1_800_000_000n,
      kind: "covered",
      noteId: "0xabc" as unknown as NoteId,
      paid: 4_900_000n,
      txHash: "0xdef",
    },
  ]);
  expect(csv.trim().split("\n")).toEqual([
    "settled_at,amount_usdt,kind,note_id,transaction,receipt",
    "2027-01-15T08:00:00.000Z,4.900000,covered,0xabc,0xdef,https://explorer.testnet.whitechain.io/tx/0xdef",
  ]);
});

test("no payments still gives a valid file", () => {
  expect(settlementCsv([]).trim().split("\n").length).toBe(1);
});
