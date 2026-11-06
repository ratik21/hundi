import { expect, test } from "bun:test";
import { type QrImage, readQr, renderQr } from "./qr";

const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;
const GREY = 128;
const RGBA = 4;

const inCameraFrame = (code: QrImage): QrImage => {
  const pixels = new Uint8ClampedArray(FRAME_WIDTH * FRAME_HEIGHT * RGBA).fill(
    GREY
  );
  const left = Math.floor((FRAME_WIDTH - code.width) / 2);
  const top = Math.floor((FRAME_HEIGHT - code.height) / 2);
  for (let y = 0; y < code.height; y += 1) {
    const row = code.pixels.subarray(
      y * code.width * RGBA,
      (y + 1) * code.width * RGBA
    );
    pixels.set(row, ((top + y) * FRAME_WIDTH + left) * RGBA);
  }
  return { height: FRAME_HEIGHT, pixels, width: FRAME_WIDTH };
};

for (const size of [618, 362, 234]) {
  test(`${size} random bytes survive drawing and reading`, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(size));
    expect(readQr(renderQr(bytes, 4))).toEqual(bytes);
  });
}

test("every byte value survives", () => {
  const bytes = Uint8Array.from({ length: 618 }, (_, index) => index % 256);
  expect(readQr(renderQr(bytes, 4))).toEqual(bytes);
});

test("618 bytes read from inside a camera-sized frame", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(618));
  expect(readQr(inCameraFrame(renderQr(bytes, 6)))).toEqual(bytes);
});

test("a frame with no code reads as null", () => {
  const pixels = new Uint8ClampedArray(64 * 64 * RGBA).fill(255);
  expect(readQr({ height: 64, pixels, width: 64 })).toBeNull();
});
