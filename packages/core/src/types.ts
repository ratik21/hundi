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

export const MAX_HOPS = 4;
