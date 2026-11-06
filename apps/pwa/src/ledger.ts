import { keyId } from "@hundi/core/bytes";
import type { Note, PublicKey } from "@hundi/core/types";
import type { NoteRecord, Receipt } from "@hundi/wallet/store";
import type { SettleResult } from "@hundi/wallet/wallet";
import type { Hex } from "viem";

export interface NoteGroup {
  count: number;
  face: bigint;
}

export type ActivityKind =
  | "covered"
  | "covered_in_part"
  | "paid_out"
  | "received"
  | "sent";

export interface Activity {
  /** Unknown when another device settled the note first. */
  amount?: bigint;
  /** Milliseconds. Absent on payments made before the app stored it. */
  at?: number;
  id: string;
  kind: ActivityKind;
  /** Who it was with, once this phone knows. "From 4f3a…9c21". */
  party?: string;
  receipt?: Hex;
}

export type SettleWord =
  | "Already claimed"
  | "Claimed"
  | "Covered"
  | "Not claimed";

export interface SettleSummary {
  amount: bigint;
  failed: number;
  word: SettleWord;
}

const ATOMS_PER_USDT = 1_000_000n;
const ATOMS_PER_CENT = 10_000n;
const CENTS_DIGITS = 2;
const TWEEN_STEPS = 1000;
const TWEEN_EASE_POWER = 3;

/** One USDT shown as one dollar, the way a wallet shows a stablecoin. */
export const dollars = (atoms: bigint): string => {
  const cents = (atoms % ATOMS_PER_USDT) / ATOMS_PER_CENT;
  return `$${atoms / ATOMS_PER_USDT}.${String(cents).padStart(CENTS_DIGITS, "0")}`;
};

/** The amount `progress` (0 to 1) of the way between two, easing out. */
export const tweened = (from: bigint, to: bigint, progress: number): bigint => {
  const eased = 1 - (1 - Math.max(0, progress)) ** TWEEN_EASE_POWER;
  const step = BigInt(Math.round(eased * TWEEN_STEPS));
  return from + ((to - from) * step) / BigInt(TWEEN_STEPS);
};

const KEY_EDGE = 4;

/** A key is long and means nothing to a person, so show its ends. */
export const shortKey = (key: PublicKey): string => {
  const hex = keyId(key).slice(2);
  return `${hex.slice(0, KEY_EDGE)}…${hex.slice(-KEY_EDGE)}`;
};

/** The holder before this phone: the last hop names us. */
const senderOf = ({ header, hops }: Note): PublicKey =>
  hops.at(-2)?.to ?? header.owner;

/** "12:12" for today, "6 Nov" before that. */
export const whenLabel = (at: number, now: number): string => {
  const date = new Date(at);
  return date.toDateString() === new Date(now).toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" });
};

export const noteGroups = (records: readonly NoteRecord[]): NoteGroup[] => {
  const counts = new Map<bigint, number>();
  for (const { state } of records) {
    if (state.kind === "held") {
      const { face } = state.note.header;
      counts.set(face, (counts.get(face) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([face, count]) => ({ count, face }))
    .sort((a, b) => Number(b.face - a.face));
};

export const groupsTotal = (groups: readonly NoteGroup[]): bigint =>
  groups.reduce((sum, { count, face }) => sum + BigInt(count) * face, 0n);

/** Notes that came from someone else. Only these can be settled. */
export const receivedTotal = (records: readonly NoteRecord[]): bigint =>
  records.reduce(
    (sum, { state }) =>
      state.kind === "held" && state.note.hops.length > 0
        ? sum + state.note.header.face
        : sum,
    0n
  );

const closed = (
  id: string,
  state: { kind: "lost" | "settled"; txHash: Hex },
  receipt: Receipt | undefined
): Activity => {
  const link = BigInt(state.txHash) === 0n ? {} : { receipt: state.txHash };
  if (!receipt) {
    return { id, kind: "paid_out", ...link };
  }
  const covered = state.kind === "lost" ? "covered_in_part" : "covered";
  return {
    amount: receipt.paid,
    id,
    kind: receipt.kind === "covered" ? covered : "paid_out",
    ...link,
  };
};

/**
 * Newest first. A note this phone minted and still holds is money on hand, not
 * something that happened, so it stays out of the list.
 */
export const activityOf = (
  records: readonly NoteRecord[],
  receipts: readonly Receipt[]
): Activity[] => {
  const byNote = new Map(receipts.map((receipt) => [receipt.noteId, receipt]));
  const lines: Activity[] = [];
  for (const { at, id, state } of [...records].sort(
    (a, b) => b.order - a.order
  )) {
    const when = at === undefined ? {} : { at };
    if (state.kind === "offered") {
      lines.push({
        amount: state.note.header.face,
        id,
        kind: "sent",
        party: `To ${shortKey(state.hop.to)}`,
        ...when,
      });
    } else if (state.kind === "held") {
      if (state.note.hops.length > 0) {
        lines.push({
          amount: state.note.header.face,
          id,
          kind: "received",
          party: `From ${shortKey(senderOf(state.note))}`,
          ...when,
        });
      }
    } else {
      lines.push({ ...closed(id, state, byNote.get(id)), ...when });
    }
  }
  return lines;
};

export const settleSummary = (
  results: readonly SettleResult[]
): SettleSummary => {
  let amount = 0n;
  let covered = false;
  let failed = 0;
  for (const result of results) {
    if (result.kind === "failed") {
      failed += 1;
    } else if (result.kind !== "already") {
      amount += result.paid;
      covered ||= result.kind === "covered";
    }
  }
  if (covered) {
    return { amount, failed, word: "Covered" };
  }
  if (amount > 0n) {
    return { amount, failed, word: "Claimed" };
  }
  return {
    amount,
    failed,
    word: failed > 0 ? "Not claimed" : "Already claimed",
  };
};
