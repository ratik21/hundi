import { expect, test } from "bun:test";
import {
  deviceKeyFrom,
  generateKeyPair,
  keyFingerprint,
  verifyP256,
} from "./keystore";

const FINGERPRINT = /^[0-9a-f]{8}$/u;
const message = crypto.getRandomValues(new Uint8Array(490));

test("the private key cannot be exported", async () => {
  const pair = await generateKeyPair();
  expect(pair.privateKey.extractable).toBe(false);
  await expect(
    crypto.subtle.exportKey("pkcs8", pair.privateKey)
  ).rejects.toThrow();
});

test("a signature verifies against the raw 64-byte public key", async () => {
  const key = await deviceKeyFrom(await generateKeyPair());
  const signature = await key.sign(message);
  expect(key.publicKey.length).toBe(64);
  expect(signature.length).toBe(64);
  expect(await verifyP256(key.publicKey, signature, message)).toBe(true);
});

test("a changed message fails", async () => {
  const key = await deviceKeyFrom(await generateKeyPair());
  const signature = await key.sign(message);
  const changed = message.slice();
  changed[0] = (changed[0] ?? 0) === 0 ? 1 : 0;
  expect(await verifyP256(key.publicKey, signature, changed)).toBe(false);
});

test("another key fails", async () => {
  const signer = await deviceKeyFrom(await generateKeyPair());
  const other = await deviceKeyFrom(await generateKeyPair());
  const signature = await signer.sign(message);
  expect(await verifyP256(other.publicKey, signature, message)).toBe(false);
});

test("a malformed public key is false, not an error", async () => {
  const signature = new Uint8Array(64);
  expect(await verifyP256(new Uint8Array(64), signature, message)).toBe(false);
  expect(await verifyP256(new Uint8Array(3), signature, message)).toBe(false);
});

test("the fingerprint is stable", async () => {
  const key = await deviceKeyFrom(await generateKeyPair());
  const first = await keyFingerprint(key.publicKey);
  expect(first).toMatch(FINGERPRINT);
  expect(await keyFingerprint(key.publicKey)).toBe(first);
});
