import { type Bytes, type DeviceKey, verifyP256 } from "@hundi/wallet/keystore";

/** Payment sizes from PLAN.md: four hops, and the two-hop fallback. */
export const FOUR_HOP_BYTES = 618;
export const TWO_HOP_BYTES = 362;

const PUBLIC_KEY_BYTES = 64;
const SIGNATURE_BYTES = 64;
const HEADER_BYTES = PUBLIC_KEY_BYTES + SIGNATURE_BYTES;

/** publicKey 64 || signature 64 || random bytes, signed over the random bytes. */
export const buildPayload = async (
  key: DeviceKey,
  size: number
): Promise<Bytes> => {
  const message = crypto.getRandomValues(new Uint8Array(size - HEADER_BYTES));
  const signature = await key.sign(message);
  const payload = new Uint8Array(size);
  payload.set(key.publicKey);
  payload.set(signature, PUBLIC_KEY_BYTES);
  payload.set(message, HEADER_BYTES);
  return payload;
};

export const payloadVerifies = (payload: Bytes): Promise<boolean> =>
  verifyP256(
    payload.slice(0, PUBLIC_KEY_BYTES),
    payload.slice(PUBLIC_KEY_BYTES, HEADER_BYTES),
    payload.slice(HEADER_BYTES)
  );

export const payloadSigner = (payload: Bytes): Bytes =>
  payload.slice(0, PUBLIC_KEY_BYTES);
