/** Brands stack, so `Brand<Hex32, "KeyId">` stays assignable to `Hex32`. */
export type Brand<T, B extends string> = T & {
  readonly __brand: { readonly [K in B]: true };
};

export type Hex = `0x${string}`;
export type Hex32 = Brand<Hex, "Hex32">;
export type Bytes8 = Brand<Hex, "Bytes8">;
export type Bytes16 = Brand<Hex, "Bytes16">;
export type Bytes64 = Brand<Hex, "Bytes64">;
export type Address = Brand<Hex, "Address">;
export type UnixSeconds = Brand<bigint, "UnixSeconds">;

/** sha256(x || y) */
export type KeyId = Brand<Hex32, "KeyId">;
export type NoteId = Brand<Hex32, "NoteId">;
/** The prev hash a holder signs at. */
export type Slot = Brand<Hex32, "Slot">;
/** sha256 of a signed message. */
export type Link = Brand<Hex32, "Link">;
/** USDT has 6 decimals. Always a bigint, never a float. */
export type UsdtAtoms = Brand<bigint, "UsdtAtoms">;
export type Domain = Brand<Hex32, "Domain">;

export interface PublicKey {
  x: Hex32;
  y: Hex32;
}
export interface Header {
  expiry: UnixSeconds;
  face: UsdtAtoms;
  owner: PublicKey;
  serial: Bytes16;
}
/** Signed by the previous holder. */
export interface Hop {
  sig: Bytes64;
  to: PublicKey;
}
export interface Note {
  header: Header;
  hops: readonly Hop[];
}

export interface PayRequest {
  amount: UsdtAtoms;
  domainTag: Bytes8;
  payee: PublicKey;
  requestId: Bytes8;
}
export interface Payment {
  header: Header;
  hops: readonly Hop[];
  requestId: Bytes8;
}

export interface Bond {
  amount: UsdtAtoms;
  lockedUntil: UnixSeconds;
}

export interface NoteFacts {
  expiry: UnixSeconds;
  face: UsdtAtoms;
  settled: boolean;
}

export interface Snapshot {
  bonds: ReadonlyMap<KeyId, Bond>;
  notes: ReadonlyMap<NoteId, NoteFacts>;
  syncedAt: UnixSeconds;
}

export type NoteState =
  | { kind: "held"; note: Note }
  | { kind: "offered"; hop: Hop; note: Note; requestId: Bytes8 }
  | { kind: "settled"; txHash: Hex32 }
  | { kind: "lost"; txHash: Hex32 };

export type RejectReason =
  | "wrong_amount"
  | "too_long"
  | "unknown_note"
  | "spent"
  | "expiring"
  | "seen_before"
  | "bad_signature"
  | "bad_chain"
  | "uncovered";

export type Verdict =
  | { ok: true; amount: UsdtAtoms }
  | { ok: false; reason: RejectReason };

export const MAX_HOPS = 4;
/** Seconds of clock drift a receiver allows for. */
export const MARGIN = 300n;
