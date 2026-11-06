import { type QrImage, readQr } from "./qr";

addEventListener("message", (event: MessageEvent<QrImage>) => {
  postMessage(readQr(event.data));
});
