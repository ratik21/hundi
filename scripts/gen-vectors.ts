/**
 * Writes vectors/golden.json from a fixed P-256 key, so forge and bun test the
 * same bytes. Usage: bun scripts/gen-vectors.ts
 */
import { writeFile } from "node:fs/promises";
import {
  decodePayment,
  domain,
  domainTag,
  encodePayment,
  encodeRequest,
  hopMessage,
  keyId,
  linkOf,
  noteId,
  settleMessage,
  withdrawMessage,
} from "@hundi/core/bytes";
import type {
  Address,
  Bytes8,
  Bytes16,
  Bytes64,
  Hex,
  Hex32,
  Hop,
  PublicKey,
  Slot,
  UnixSeconds,
  UsdtAtoms,
} from "@hundi/core/types";
import { p256 } from "@noble/curves/nist.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

const hex = (bytes: Uint8Array): Hex => `0x${bytesToHex(bytes)}`;

const wallet = (secret: string) => {
  const secretKey = hexToBytes(secret);
  const raw = p256.getPublicKey(secretKey, false);
  const key: PublicKey = {
    x: hex(raw.slice(1, 33)) as Hex32,
    y: hex(raw.slice(33, 65)) as Hex32,
  };
  const sign = (message: Uint8Array) =>
    hex(p256.sign(message, secretKey, { lowS: false })) as Bytes64;
  return { key, sign };
};

const alice = wallet("11".repeat(32));
const bob = wallet("22".repeat(32));
const carol = wallet("33".repeat(32));

const cases = [
  {
    chainId: 1874n,
    expiry: 1_795_000_000n,
    face: 5_000_000n,
    fee: 20_000n,
    lockedUntil: 1_795_700_000n,
    payTo: "0x7580eD603Ca084d4990650cdEd1990bE8bbd2694",
    serial: "0x000102030405060708090a0b0c0d0e0f",
    vault: "0x1111111111111111111111111111111111111111",
  },
  {
    chainId: 18_446_744_073_709_551_615n,
    expiry: 18_446_744_073_709_551_615n,
    face: 18_446_744_073_709_551_615n,
    fee: 18_446_744_073_709_551_615n,
    lockedUntil: 18_446_744_073_709_551_615n,
    payTo: "0xffffffffffffffffffffffffffffffffffffffff",
    serial: "0xffffffffffffffffffffffffffffffff",
    vault: "0xfedcba9876543210fedcba9876543210fedcba98",
  },
];

const vector = (input: (typeof cases)[number]) => {
  const dom = domain(input.chainId, input.vault as Address);
  const header = {
    expiry: input.expiry as UnixSeconds,
    face: input.face as UsdtAtoms,
    owner: alice.key,
    serial: input.serial as Bytes16,
  };
  const id = noteId(dom, header);

  const firstMessage = hopMessage(id as unknown as Slot, bob.key);
  const firstLink = linkOf(firstMessage);
  const secondMessage = hopMessage(firstLink as unknown as Slot, carol.key);
  const secondLink = linkOf(secondMessage);
  const settle = settleMessage(
    secondLink as unknown as Slot,
    input.payTo as Address,
    input.fee as UsdtAtoms
  );
  const hops: Hop[] = [
    { sig: alice.sign(firstMessage), to: bob.key },
    { sig: bob.sign(secondMessage), to: carol.key },
  ];
  const requestId = "0x0102030405060708" as Bytes8;
  const payment = encodePayment({ header, hops, requestId });
  if (hex(encodePayment(decodePayment(payment))) !== hex(payment)) {
    throw new Error("Payment does not round trip");
  }
  const withdraw = withdrawMessage(
    dom,
    keyId(alice.key),
    input.payTo as Address,
    input.lockedUntil as UnixSeconds
  );

  return {
    chainId: input.chainId.toString(),
    domain: dom,
    expiry: input.expiry.toString(),
    face: input.face.toString(),
    fee: input.fee.toString(),
    firstHopLink: firstLink,
    firstHopMessage: hex(firstMessage),
    firstHopSig: hops[0]?.sig,
    keyId: keyId(alice.key),
    lockedUntil: input.lockedUntil.toString(),
    noteId: id,
    ownerX: alice.key.x,
    ownerY: alice.key.y,
    payment: hex(payment),
    payTo: input.payTo,
    request: hex(
      encodeRequest({
        amount: input.face as UsdtAtoms,
        domainTag: domainTag(dom),
        payee: carol.key,
        requestId,
      })
    ),
    secondHopLink: secondLink,
    secondHopMessage: hex(secondMessage),
    secondHopSig: hops[1]?.sig,
    secondX: bob.key.x,
    secondY: bob.key.y,
    serial: input.serial,
    settleLink: linkOf(settle),
    settleMessage: hex(settle),
    settleSig: carol.sign(settle),
    thirdX: carol.key.x,
    thirdY: carol.key.y,
    vault: input.vault,
    withdrawLink: linkOf(withdraw),
    withdrawMessage: hex(withdraw),
  };
};

await writeFile(
  "vectors/golden.json",
  `${JSON.stringify({ cases: cases.map(vector) }, null, 2)}\n`
);
