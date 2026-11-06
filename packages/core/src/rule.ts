import { p256 } from "@noble/curves/nist.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { keyId } from "./bytes";
import { chainKeys, type Step, walk } from "./chain";
import {
  type Domain,
  type Hex,
  MARGIN,
  MAX_HOPS,
  type NoteId,
  type Payment,
  type PayRequest,
  type PublicKey,
  type RejectReason,
  type Snapshot,
  type UnixSeconds,
  type Verdict,
} from "./types";

const UNCOMPRESSED_POINT = 4;

const raw = (hex: Hex): Uint8Array => hexToBytes(hex.slice(2));

const point = (key: PublicKey): Uint8Array =>
  Uint8Array.of(UNCOMPRESSED_POINT, ...raw(key.x), ...raw(key.y));

/** WebCrypto signs with any `s`, so high-`s` signatures are valid here too. */
const verified = (step: Step): boolean => {
  try {
    return p256.verify(raw(step.sig), step.message, point(step.signer), {
      lowS: false,
    });
  } catch {
    return false;
  }
};

const sameKey = (a: PublicKey, b: PublicKey): boolean =>
  a.x === b.x && a.y === b.y;

export interface AcceptContext {
  domain: Domain;
  /** The vault's GRACE, in seconds. */
  grace: bigint;
  /** Every note this device has already held. */
  seen: ReadonlySet<NoteId>;
}

const refuse = (reason: RejectReason): Verdict => ({ ok: false, reason });

/**
 * The offline acceptance rule, in PLAN.md Appendix B order. Pure, and stops at
 * the first failure. A request amount of zero is a printed QR, which takes any
 * face value.
 */
export const accept = (
  payment: Payment,
  request: PayRequest,
  snapshot: Snapshot,
  now: UnixSeconds,
  context: AcceptContext
): Verdict => {
  const { header, hops } = payment;
  const note = { header, hops };

  if (
    payment.requestId !== request.requestId ||
    (request.amount !== 0n && header.face !== request.amount)
  ) {
    return refuse("wrong_amount");
  }
  if (hops.length > MAX_HOPS) {
    return refuse("too_long");
  }

  const walked = walk(context.domain, note);
  const facts = snapshot.notes.get(walked.id);
  if (!facts || facts.face !== header.face) {
    return refuse("unknown_note");
  }
  if (facts.settled) {
    return refuse("spent");
  }
  if (now + MARGIN >= header.expiry) {
    return refuse("expiring");
  }
  if (context.seen.has(walked.id)) {
    return refuse("seen_before");
  }
  if (
    hops.length === 0 ||
    !sameKey(walked.holder, request.payee) ||
    !walked.steps.every(verified)
  ) {
    return refuse("bad_signature");
  }
  const keys = chainKeys(note);
  if (new Set(keys).size !== keys.length) {
    return refuse("bad_chain");
  }

  const covered = walked.steps.every(({ signer }) => {
    const bond = snapshot.bonds.get(keyId(signer));
    return (
      bond !== undefined &&
      bond.amount >= 2n * header.face &&
      bond.lockedUntil >= header.expiry + context.grace
    );
  });
  return covered ? { amount: header.face, ok: true } : refuse("uncovered");
};
