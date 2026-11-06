import {
  decodePayment,
  decodeRequest,
  encodePayment,
  encodeRequest,
} from "@hundi/core/bytes";
import type { PayRequest, UsdtAtoms, Verdict } from "@hundi/core/types";
import { parseUnits } from "viem";
import { createReads, createWrites, relayerFrom } from "./chain-io";
import { settlementCsv } from "./csv";
import { fundLabWallet, LAB_URL } from "./lab";
import { REJECT_MESSAGES } from "./messages";
import { drawQr } from "./qr";
import { createDecoder, startScan } from "./scanner";
import { formatUsdt, openWallet, type Wallet } from "./wallet";

const RELAYER_FILE = "https://hundi-ten.vercel.app/relayer.txt";
const USDT_DECIMALS = 6;
const CONTROL_WAIT_MS = 3000;

const STYLE = `
:host { display: block; font: 16px/1.4 system-ui, sans-serif; color: #13261d; }
.box { display: flex; flex-direction: column; gap: 12px; }
.big { font-size: 2.2em; font-weight: 700; text-align: center; margin: 0; }
.note { color: #5f6f66; font-size: .9em; text-align: center; margin: 0; }
.bad { color: #b23c2a; font-size: .9em; margin: 0; }
.row { display: flex; gap: 8px; }
button { flex: 1; font: inherit; font-weight: 600; padding: 14px; border: 0;
  border-radius: 14px; background: #1c6b49; color: #fff; }
button.plain { background: #fffbf2; color: #13261d; border: 1px solid #e6dcc8; }
button:disabled { opacity: .4; }
canvas { display: block; margin: auto; background: #fff; border-radius: 14px; max-width: 100%; }
video { width: 100%; aspect-ratio: 1; object-fit: cover; background: #000; border-radius: 14px; }
.verdict { padding: 32px 16px; border-radius: 14px; color: #fff; text-align: center; }
.verdict.ok { background: #1c6b49; }
.verdict.no { background: #b23c2a; }
code { word-break: break-all; font-size: .8em; }
`;

export interface HundiOptions {
  /** Merchant only. Called once for every payment scanned. */
  onVerdict?: (verdict: Verdict) => void;
  /** Must equal a note's face value, because a payment carries one note. */
  price: string;
  role: "customer" | "merchant";
}

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = ""
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};

const button = (text: string, onClick: () => void, className = "") => {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
};

const download = (name: string, text: string) => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
};

const controlled = (): Promise<void> =>
  new Promise((resolve) => {
    if (navigator.serviceWorker.controller) {
      resolve();
      return;
    }
    navigator.serviceWorker.addEventListener("controllerchange", () =>
      resolve()
    );
    setTimeout(resolve, CONTROL_WAIT_MS);
  });

/** The decoder is its own file, so load it now, while there is signal. */
const warmDecoder = async () => {
  const decoder = createDecoder();
  const pixels = new Uint8ClampedArray(4);
  await decoder.decode({ height: 1, pixels, width: 1 }).catch(() => null);
  decoder.stop();
};

/** Makes the host page reopen in airplane mode. Serve `hundi-sw.js` from the root. */
export const registerHundiWorker = async (script = "/hundi-sw.js") => {
  await navigator.serviceWorker.register(script);
  const { active } = await navigator.serviceWorker.ready;
  await controlled();
  const assets = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(location.origin));
  active?.postMessage({
    type: "hundi-cache",
    urls: ["/", ...new Set(assets)],
  });
  await warmDecoder();
  await navigator.storage?.persist?.();
};

const mount = (wallet: Wallet, root: ShadowRoot, options: HundiOptions) => {
  const price = parseUnits(options.price, USDT_DECIMALS) as UsdtAtoms;
  const label = `${formatUsdt(price)} USDT`;
  const box = element("div", "box");
  root.append(box);
  let stopCamera: () => void = () => undefined;

  const show = (...nodes: Node[]) => {
    stopCamera();
    box.replaceChildren(...nodes);
  };

  const qr = (bytes: Uint8Array) => {
    const canvas = element("canvas", "");
    const ratio = devicePixelRatio;
    const width = drawQr(canvas, bytes, box.clientWidth * ratio);
    canvas.style.width = `${width / ratio}px`;
    return canvas;
  };

  const scan = (hint: string, onBytes: (bytes: Uint8Array) => void) => {
    const video = element("video", "");
    video.muted = true;
    video.playsInline = true;
    const problem = element("p", "bad");
    show(
      video,
      element("p", "note", hint),
      problem,
      button("Cancel", home, "plain")
    );
    stopCamera = startScan({
      onCamera: () => undefined,
      onError: (message) => {
        problem.textContent = message;
      },
      onScan: ({ bytes }) => onBytes(bytes),
      video,
    });
  };

  const showVerdict = (verdict: Verdict) => {
    const banner = element("div", `verdict ${verdict.ok ? "ok" : "no"}`);
    banner.dataset.verdict = verdict.ok ? "ok" : verdict.reason;
    banner.append(
      element("p", "big", verdict.ok ? "Paid" : "Refused"),
      element(
        "p",
        "",
        verdict.ok
          ? `${formatUsdt(verdict.amount)} USDT, checked with no network`
          : REJECT_MESSAGES[verdict.reason]
      )
    );
    show(banner, button("Next customer", home));
  };

  const takePayment = (request: PayRequest) =>
    scan("Point at the code on their phone.", async (bytes) => {
      try {
        const verdict = await wallet.receive(decodePayment(bytes), request);
        options.onVerdict?.(verdict);
        showVerdict(verdict);
      } catch {
        takePayment(request);
      }
    });

  const settle = async (status: HTMLElement) => {
    status.textContent = "Settling…";
    try {
      const results = await wallet.settle();
      const paid = results.filter(
        (r) => r.kind === "paid" || r.kind === "covered"
      );
      status.textContent = `${paid.length} of ${results.length} settled`;
    } catch {
      status.textContent = "Could not reach the network. Try again.";
    }
  };

  const exportCsv = async () => {
    download("hundi-settlements.csv", settlementCsv(await wallet.receipts()));
  };

  const merchantHome = () => {
    const request = wallet.request(price);
    const status = element("p", "note");
    const row = element("div", "row");
    row.append(
      button("Settle", () => settle(status), "plain"),
      button("Download CSV", exportCsv, "plain")
    );
    show(
      element("p", "big", label),
      qr(encodeRequest(request)),
      element("p", "note", "Customer scans this, then shows their code."),
      button("Scan their payment", () => takePayment(request)),
      row,
      status
    );
  };

  const payRequest = async (request: PayRequest, status: HTMLElement) => {
    try {
      const payment = await wallet.pay(request);
      show(
        element("p", "note", "Show this to the shop."),
        qr(encodePayment(payment)),
        element("p", "big", `${formatUsdt(payment.header.face)} USDT`),
        button("Done", home)
      );
    } catch (cause) {
      status.textContent = cause instanceof Error ? cause.message : "Not paid";
    }
  };

  const confirmPay = (request: PayRequest) => {
    const status = element("p", "bad");
    show(
      element("p", "note", "You are paying"),
      element("p", "big", `${formatUsdt(request.amount)} USDT`),
      status,
      button("Pay", () => payRequest(request, status)),
      button("Cancel", home, "plain")
    );
  };

  const scanShop = () =>
    scan("Point at the shop's code.", (bytes) => {
      try {
        confirmPay(decodeRequest(bytes));
      } catch {
        scanShop();
      }
    });

  const addNote = async (status: HTMLElement) => {
    status.textContent = "Adding…";
    try {
      await wallet.load({ bond: (2n * price) as UsdtAtoms, notes: [price] });
      home();
    } catch {
      status.textContent = `Top up first: ${wallet.address}`;
    }
  };

  const customerHome = async () => {
    const notes = await wallet.notes();
    const spendable = notes.filter(({ state }) => state.kind === "held").length;
    const status = element("code", "");
    show(
      element("p", "big", `${spendable} × ${label}`),
      element("p", "note", "Notes you can spend with no network"),
      button("Scan the shop's code", scanShop),
      button(`Add a ${label} note`, () => addNote(status), "plain"),
      status
    );
  };

  function home() {
    if (options.role === "merchant") {
      merchantHome();
    } else {
      customerHome();
    }
  }

  home();
};

/** Mounts a till or a customer wallet inside `host`. Needs no framework. */
export const mountHundi = async (
  host: Element | null,
  options: HundiOptions
): Promise<void> => {
  if (!host) {
    throw new Error("mountHundi needs an element");
  }
  const rpc = import.meta.env.VITE_RPC_URL as string | undefined;
  const wallet = await openWallet({
    reads: createReads(rpc),
    relayer: relayerFrom(
      (import.meta.env.VITE_RELAYER_FILE as string | undefined) ?? RELAYER_FILE
    ),
    writes: createWrites(rpc),
  });
  if (LAB_URL) {
    await fundLabWallet(wallet.address);
  }
  if (navigator.onLine) {
    await wallet.sync().catch(() => undefined);
  }
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  root.append(style);
  mount(wallet, root, options);
};
