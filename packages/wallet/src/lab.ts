import { bytesToHex, type Hex, hexToBytes } from "viem";
import type { Bytes } from "./keystore";

/**
 * Set only by `bun run lab`. A simulator has no camera, so lab builds pass QR
 * codes through a local relay. Production builds drop this path.
 */
export const LAB_URL = import.meta.env.VITE_LAB_URL as string | undefined;

const post = (path: string, body: object) =>
  fetch(`${LAB_URL}${path}`, {
    body: JSON.stringify(body),
    method: "POST",
  });

let lastShown = "";

export const showLabQr = (bytes: Uint8Array) => {
  const hex = bytesToHex(bytes);
  if (hex !== lastShown) {
    lastShown = hex;
    post("/qr", { from: location.origin, hex });
  }
};

export const takeLabQr = async (): Promise<Bytes | null> => {
  const response = await fetch(
    `${LAB_URL}/qr?for=${encodeURIComponent(location.origin)}`
  );
  const { hex } = (await response.json()) as { hex?: Hex };
  return hex ? (hexToBytes(hex) as Bytes) : null;
};

/** A home-screen app has its own storage, so it is a different wallet from the Safari tab. */
const installed = () =>
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

export const fundLabWallet = async (address: string) => {
  await post("/fund", {
    address,
    from: location.origin,
    installed: installed(),
  });
};
