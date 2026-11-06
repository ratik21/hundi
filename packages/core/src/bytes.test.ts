import { describe, expect, test } from "bun:test";
import { p256 } from "@noble/curves/nist.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import golden from "../../../vectors/golden.json";
import {
  decodePayment,
  decodeRequest,
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
} from "./bytes";
import type {
  Address,
  Bytes16,
  Domain,
  Header,
  Hex,
  Hex32,
  KeyId,
  Slot,
  UnixSeconds,
  UsdtAtoms,
} from "./types";

const hex = (bytes: Uint8Array): Hex => `0x${bytesToHex(bytes)}`;
const raw = (value: string): Uint8Array => hexToBytes(value.slice(2));

describe.each(golden.cases)("golden case %#", (c) => {
  const key = (x: string, y: string) => ({ x: x as Hex32, y: y as Hex32 });
  const alice = key(c.ownerX, c.ownerY);
  const bob = key(c.secondX, c.secondY);
  const carol = key(c.thirdX, c.thirdY);
  const header: Header = {
    expiry: BigInt(c.expiry) as UnixSeconds,
    face: BigInt(c.face) as UsdtAtoms,
    owner: alice,
    serial: c.serial as Bytes16,
  };
  const dom = c.domain as Domain;

  test("hashes match", () => {
    expect(domain(BigInt(c.chainId), c.vault as Address)).toBe(dom);
    expect(keyId(alice)).toBe(c.keyId as KeyId);
    expect(noteId(dom, header) as string).toBe(c.noteId);
  });

  test("messages match and have their fixed sizes", () => {
    const first = hopMessage(c.noteId as Slot, bob);
    const second = hopMessage(c.firstHopLink as Slot, carol);
    const settle = settleMessage(
      c.secondHopLink as Slot,
      c.payTo as Address,
      BigInt(c.fee) as UsdtAtoms
    );
    const withdraw = withdrawMessage(
      dom,
      c.keyId as KeyId,
      c.payTo as Address,
      BigInt(c.lockedUntil) as UnixSeconds
    );
    expect(hex(first)).toBe(c.firstHopMessage as Hex);
    expect(hex(second)).toBe(c.secondHopMessage as Hex);
    expect(hex(settle)).toBe(c.settleMessage as Hex);
    expect(hex(withdraw)).toBe(c.withdrawMessage as Hex);
    expect(first.length).toBe(97);
    expect(settle.length).toBe(61);
    expect(withdraw.length).toBe(93);
    expect(linkOf(first) as string).toBe(c.firstHopLink);
    expect(linkOf(second) as string).toBe(c.secondHopLink);
    expect(linkOf(settle) as string).toBe(c.settleLink);
    expect(linkOf(withdraw) as string).toBe(c.withdrawLink);
  });

  test("QR payloads round trip at the planned sizes", () => {
    const payment = decodePayment(raw(c.payment));
    expect(hex(encodePayment(payment))).toBe(c.payment as Hex);
    expect(raw(c.payment).length).toBe(362);
    expect(payment.header).toEqual(header);
    expect(payment.hops.length).toBe(2);

    const request = decodeRequest(raw(c.request));
    expect(hex(encodeRequest(request))).toBe(c.request as Hex);
    expect(raw(c.request).length).toBe(89);
    expect(request.domainTag).toBe(domainTag(dom));
    expect(request.amount).toBe(header.face);
    expect(request.payee).toEqual(carol);
  });

  test("WebCrypto verifies the signature over the raw message", async () => {
    const publicKey = await crypto.subtle.importKey(
      "raw",
      Uint8Array.of(4, ...raw(c.ownerX), ...raw(c.ownerY)) as BufferSource,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const params = { hash: "SHA-256", name: "ECDSA" };
    const verified = await crypto.subtle.verify(
      params,
      publicKey,
      raw(c.firstHopSig) as BufferSource,
      raw(c.firstHopMessage) as BufferSource
    );
    expect(verified).toBe(true);
    expect(
      p256.verify(
        raw(c.firstHopSig),
        raw(c.firstHopMessage),
        Uint8Array.of(4, ...raw(c.ownerX), ...raw(c.ownerY)),
        { lowS: false }
      )
    ).toBe(true);
  });
});

test("a four-hop payment is 618 bytes and more hops are refused", () => {
  const [c] = golden.cases;
  if (!c) {
    throw new Error("No golden case");
  }
  const two = decodePayment(raw(c.payment));
  const four = { ...two, hops: [...two.hops, ...two.hops] };
  expect(encodePayment(four).length).toBe(618);
  const five = { ...two, hops: [...four.hops, ...two.hops.slice(1)] };
  expect(() => decodePayment(encodePayment(five))).toThrow(RangeError);
});

test("truncated and foreign payloads are refused", () => {
  const [c] = golden.cases;
  if (!c) {
    throw new Error("No golden case");
  }
  expect(() => decodePayment(raw(c.payment).slice(0, -1))).toThrow(RangeError);
  expect(() => decodePayment(raw(c.request))).toThrow(RangeError);
  expect(() => decodeRequest(raw(c.payment))).toThrow(RangeError);
});
