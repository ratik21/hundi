import { expect, test } from "bun:test";
import { deviceKeyFrom, generateKeyPair } from "@hundi/wallet/keystore";
import { readQr, renderQr } from "@hundi/wallet/qr";
import {
  buildPayload,
  FOUR_HOP_BYTES,
  payloadVerifies,
  TWO_HOP_BYTES,
} from "./payload";

for (const size of [FOUR_HOP_BYTES, TWO_HOP_BYTES]) {
  test(`a ${size}-byte payload verifies after a trip through a QR`, async () => {
    const key = await deviceKeyFrom(await generateKeyPair());
    const payload = await buildPayload(key, size);
    expect(payload.length).toBe(size);
    const scanned = readQr(renderQr(payload, 4));
    expect(scanned).not.toBeNull();
    expect(scanned && (await payloadVerifies(scanned))).toBe(true);
  });
}

test("a changed byte fails verification", async () => {
  const key = await deviceKeyFrom(await generateKeyPair());
  const payload = await buildPayload(key, FOUR_HOP_BYTES);
  const last = payload.length - 1;
  payload[last] = (payload[last] ?? 0) === 0 ? 1 : 0;
  expect(await payloadVerifies(payload)).toBe(false);
});
