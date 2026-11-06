import { receiptUrl } from "./chain-io";
import type { Receipt } from "./store";

const USDT_ATOMS = 1_000_000;
const HEADER = "settled_at,amount_usdt,kind,note_id,transaction,receipt";

const row = (receipt: Receipt): string =>
  [
    new Date(Number(receipt.at) * 1000).toISOString(),
    (Number(receipt.paid) / USDT_ATOMS).toFixed(6),
    receipt.kind,
    receipt.noteId,
    receipt.txHash,
    receiptUrl(receipt.txHash),
  ].join(",");

/** A settlement file for the accountant, one row per payment. */
export const settlementCsv = (receipts: readonly Receipt[]): string =>
  `${[HEADER, ...receipts.map(row)].join("\n")}\n`;
