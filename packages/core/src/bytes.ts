import { sha256 } from "@noble/hashes/sha2.js";
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  utf8ToBytes,
} from "@noble/hashes/utils.js";
import type {
  Address,
  Bytes8,
  Bytes16,
  Bytes64,
  Domain,
  Header,
  Hex,
  Hex32,
  Hop,
  KeyId,
  Link,
  NoteId,
  Payment,
  PayRequest,
  PublicKey,
  Slot,
  UnixSeconds,
  UsdtAtoms,
} from "./types";
import { MAX_HOPS } from "./types";

const TAG_NOTE = 0x01;
const TAG_HOP = 0x02;
const TAG_SETTLE = 0x03;
const TAG_WITHDRAW = 0x04;
const TAG_REQUEST = 0x10;
const TAG_PAYMENT = 0x11;

const REQUEST_BYTES = 89;
const PAYMENT_BASE_BYTES = 106;
const HOP_BYTES = 128;
const U64_MAX = 2n ** 64n - 1n;

const toHex = <T extends Hex>(bytes: Uint8Array): T =>
  `0x${bytesToHex(bytes)}` as T;

/** Parses a hex string of exactly `length` bytes. */
export const fixed = (hex: Hex, length: number): Uint8Array => {
  const bytes = hexToBytes(hex.slice(2));
  if (bytes.length !== length) {
    throw new RangeError(`Expected ${length} bytes, got ${bytes.length}`);
  }
  return bytes;
};

export const u64 = (value: bigint): Uint8Array => {
  if (value < 0n || value > U64_MAX) {
    throw new RangeError("Value does not fit in u64");
  }
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value);
  return bytes;
};

const point = (key: PublicKey): Uint8Array =>
  concatBytes(fixed(key.x, 32), fixed(key.y, 32));

const hash = <T extends Hex32>(...parts: Uint8Array[]): T =>
  toHex<T>(sha256(concatBytes(...parts)));

export const domain = (chainId: bigint, vault: Address): Domain =>
  hash<Domain>(utf8ToBytes("HUNDI/1"), u64(chainId), fixed(vault, 20));

export const keyId = (key: PublicKey): KeyId => hash<KeyId>(point(key));

export const noteId = (dom: Domain, header: Header): NoteId =>
  hash<NoteId>(
    Uint8Array.of(TAG_NOTE),
    fixed(dom, 32),
    fixed(header.serial, 16),
    u64(header.face),
    u64(header.expiry),
    point(header.owner)
  );

export const hopMessage = (slot: Slot, to: PublicKey): Uint8Array =>
  concatBytes(Uint8Array.of(TAG_HOP), fixed(slot, 32), point(to));

export const settleMessage = (
  slot: Slot,
  payTo: Address,
  fee: UsdtAtoms
): Uint8Array =>
  concatBytes(
    Uint8Array.of(TAG_SETTLE),
    fixed(slot, 32),
    fixed(payTo, 20),
    u64(fee)
  );

export const withdrawMessage = (
  dom: Domain,
  key: KeyId,
  payTo: Address,
  lockedUntil: UnixSeconds
): Uint8Array =>
  concatBytes(
    Uint8Array.of(TAG_WITHDRAW),
    fixed(dom, 32),
    fixed(key, 32),
    fixed(payTo, 20),
    u64(lockedUntil)
  );

/** The identity of a signed message, and the digest the precompile checks. */
export const linkOf = (message: Uint8Array): Link => hash<Link>(message);

/** A note id or a link, used as the place the next message is signed. */
export const slotOf = (value: Hex32): Slot => value as Hex as Slot;

export const domainTag = (dom: Domain): Bytes8 =>
  toHex<Bytes8>(fixed(dom, 32).slice(0, 8));

export const encodeRequest = (request: PayRequest): Uint8Array =>
  concatBytes(
    Uint8Array.of(TAG_REQUEST),
    fixed(request.domainTag, 8),
    point(request.payee),
    u64(request.amount),
    fixed(request.requestId, 8)
  );

class Reader {
  readonly #bytes: Uint8Array;
  #at = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  take(length: number): Uint8Array {
    const part = this.#bytes.slice(this.#at, this.#at + length);
    this.#at += length;
    return part;
  }

  hex<T extends Hex>(length: number): T {
    return toHex<T>(this.take(length));
  }

  u64(): bigint {
    return new DataView(this.take(8).buffer).getBigUint64(0);
  }

  key(): PublicKey {
    const x = this.hex<Hex32>(32);
    const y = this.hex<Hex32>(32);
    return { x, y };
  }
}

// Decoders read into locals, in wire order. An object literal here would break
// when the formatter sorts its keys, because each read advances the cursor.
export const decodeRequest = (bytes: Uint8Array): PayRequest => {
  if (bytes.length !== REQUEST_BYTES || bytes[0] !== TAG_REQUEST) {
    throw new RangeError("Not a Hundi request");
  }
  const reader = new Reader(bytes.subarray(1));
  const tag = reader.hex<Bytes8>(8);
  const payee = reader.key();
  const amount = reader.u64() as UsdtAtoms;
  const requestId = reader.hex<Bytes8>(8);
  return { amount, domainTag: tag, payee, requestId };
};

export const encodePayment = (payment: Payment): Uint8Array => {
  const { header, hops, requestId } = payment;
  return concatBytes(
    Uint8Array.of(TAG_PAYMENT),
    fixed(requestId, 8),
    fixed(header.serial, 16),
    u64(header.face),
    u64(header.expiry),
    point(header.owner),
    Uint8Array.of(hops.length),
    ...hops.flatMap((hop) => [point(hop.to), fixed(hop.sig, 64)])
  );
};

export const decodePayment = (bytes: Uint8Array): Payment => {
  const count = bytes[PAYMENT_BASE_BYTES - 1] ?? 0;
  if (
    bytes[0] !== TAG_PAYMENT ||
    count > MAX_HOPS ||
    bytes.length !== PAYMENT_BASE_BYTES + HOP_BYTES * count
  ) {
    throw new RangeError("Not a Hundi payment");
  }
  const reader = new Reader(bytes.subarray(1));
  const requestId = reader.hex<Bytes8>(8);
  const serial = reader.hex<Bytes16>(16);
  const face = reader.u64() as UsdtAtoms;
  const expiry = reader.u64() as UnixSeconds;
  const owner = reader.key();
  reader.take(1);
  const hops: Hop[] = Array.from({ length: count }, () => {
    const to = reader.key();
    const sig = reader.hex<Bytes64>(64);
    return { sig, to };
  });
  return { header: { expiry, face, owner, serial }, hops, requestId };
};
