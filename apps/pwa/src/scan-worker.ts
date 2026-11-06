import { type QrImage, readQr } from "@hundi/wallet/qr";

addEventListener("message", (event: MessageEvent<QrImage>) => {
  postMessage(readQr(event.data));
});
