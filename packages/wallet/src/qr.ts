import jsQR from "jsqr";
import QRCode from "qrcode";
import { LAB_URL, showLabQr } from "./lab";

export interface QrImage {
  height: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
  width: number;
}

/** The QR spec requires four empty modules on every side. */
const QUIET_ZONE = 4;
const RGBA = 4;
const ALPHA = 3;
const OPAQUE = 255;

const symbol = (bytes: Uint8Array) =>
  QRCode.create([{ data: bytes, mode: "byte" }], {
    errorCorrectionLevel: "L",
  }).modules;

/** Modules across, including the quiet zone. */
export const qrWidth = (bytes: Uint8Array): number =>
  symbol(bytes).size + 2 * QUIET_ZONE;

/** Black modules on white, `scale` pixels per module. */
export const renderQr = (bytes: Uint8Array, scale: number): QrImage => {
  const { data: modules, size } = symbol(bytes);
  const width = (size + 2 * QUIET_ZONE) * scale;
  const pixels = new Uint8ClampedArray(width * width * RGBA).fill(OPAQUE);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!modules[row * size + column]) {
        continue;
      }
      const left = (column + QUIET_ZONE) * scale;
      const top = (row + QUIET_ZONE) * scale;
      for (let y = top; y < top + scale; y += 1) {
        for (let x = left; x < left + scale; x += 1) {
          const pixel = (y * width + x) * RGBA;
          pixels.fill(0, pixel, pixel + ALPHA);
        }
      }
    }
  }
  return { height: width, pixels, width };
};

/** Whole pixels per module keep the edges sharp. Returns the drawn width in device pixels. */
export const drawQr = (
  canvas: HTMLCanvasElement,
  bytes: Uint8Array,
  maxDevicePixels: number
): number => {
  if (LAB_URL) {
    showLabQr(bytes);
  }
  const scale = Math.max(1, Math.floor(maxDevicePixels / qrWidth(bytes)));
  const { height, pixels, width } = renderQr(bytes, scale);
  canvas.width = width;
  canvas.height = height;
  canvas
    .getContext("2d")
    ?.putImageData(new ImageData(pixels, width, height), 0, 0);
  return width;
};

export const readQr = ({
  height,
  pixels,
  width,
}: QrImage): Uint8Array<ArrayBuffer> | null => {
  const code = jsQR(pixels, width, height, { inversionAttempts: "dontInvert" });
  return code ? new Uint8Array(code.binaryData) : null;
};
