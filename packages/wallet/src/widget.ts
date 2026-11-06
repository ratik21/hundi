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
const FOOTER = "Hundi. Works with no network.";

const STYLE = `
:host {
  --base: #0d1014; --surface: #171b22; --raised: #222833; --line: #2c3340;
  --fg: #f3f5f8; --muted: #9aa3b2; --accent: #f5b83d; --on-accent: #1a1405;
  --paper: #fcf8ee; --paper-ink: #1a2133; --paper-muted: #5c6270; --paper-rule: #e0d4bd;
  --stamp-ok: #17694a; --stamp-bad: #b4321d;
  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, "Noto Serif", Georgia, serif;
  display: block; padding: 16px; border-radius: 20px; background: var(--base); color: var(--fg);
  font: 16px/1.4 system-ui, sans-serif;
}
* { box-sizing: border-box; }
p { margin: 0; }
.box { display: flex; flex-direction: column; gap: 14px; }
.card { padding: 18px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.paper {
  position: relative; background: var(--paper); border-radius: 8px; color: var(--paper-ink);
  box-shadow: 0 14px 24px -18px rgb(0 0 0 / .6);
}
.paper::after {
  position: absolute; inset: 6px; pointer-events: none; content: "";
  border: 1px solid var(--paper-rule); border-radius: 4px;
}
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.kicker { color: var(--muted); font-weight: 500; }
.seal { width: 36px; height: 36px; flex: none; }
.amount {
  margin-top: 2px; font-size: 3em; font-weight: 600; line-height: 1.1; letter-spacing: -.02em;
  font-variant-numeric: lining-nums tabular-nums;
}
.unit { margin-left: 8px; color: var(--muted); font-size: .42em; letter-spacing: 0; }
.detail { padding-top: 12px; margin-top: 12px; border-top: 1px solid var(--line); font-weight: 500; }
.hint { color: var(--muted); text-align: center; }
.bad { color: #ff6b5e; font-size: .9em; }
.status { min-height: 1.4em; color: var(--muted); font-size: .9em; text-align: center; }
.offline {
  padding: 10px 14px; margin-bottom: 14px; border: 1px solid rgb(245 184 61 / .4); border-radius: 14px;
  background: rgb(245 184 61 / .1); font-weight: 600;
}
.offline[hidden] { display: none; }
.foot { margin-top: 14px; color: var(--muted); font-size: .8em; text-align: center; }
.row { display: flex; gap: 10px; }
button {
  flex: 1; padding: 14px; border: 0; border-radius: 16px; background: var(--accent);
  color: var(--on-accent); font: inherit; font-size: 1.05em; font-weight: 600; cursor: pointer;
  transition: transform .1s;
}
button:active { transform: scale(.98); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button.plain { border: 1px solid var(--line); background: var(--surface); color: var(--fg); }
button.light { background: #fff; color: #000; }
button:disabled { opacity: .4; }
.qr { display: flex; justify-content: center; overflow: hidden; border-radius: 16px; background: #fff; }
canvas { display: block; max-width: 100%; }
.camera { position: relative; overflow: hidden; aspect-ratio: 1; border-radius: 16px; background: #000; }
video { display: block; width: 100%; height: 100%; object-fit: cover; }
.corner { position: absolute; width: 48px; height: 48px; border: 0 solid #fff; }
.corner.a { top: 24px; left: 24px; border-width: 4px 0 0 4px; border-top-left-radius: 8px; }
.corner.b { top: 24px; right: 24px; border-width: 4px 4px 0 0; border-top-right-radius: 8px; }
.corner.c { bottom: 24px; left: 24px; border-width: 0 0 4px 4px; border-bottom-left-radius: 8px; }
.corner.d { right: 24px; bottom: 24px; border-width: 0 4px 4px 0; border-bottom-right-radius: 8px; }
.sweep {
  position: absolute; inset-inline: 40px; height: 2px; border-radius: 2px;
  background: rgb(255 255 255 / .7); animation: sweep 2.2s ease-in-out infinite alternate;
}
.verdict {
  display: flex; flex-direction: column; gap: 22px; padding: 24px 20px; border-radius: 14px;
  color: #fff; animation: flood 320ms ease-out both;
}
.verdict.ok { background: var(--stamp-ok); }
.verdict.no { background: var(--stamp-bad); }
.verdict .paper { padding: 28px 20px 124px; text-align: center; }
.verdict .kicker { color: var(--paper-muted); }
.verdict.ok .paper { animation: thud 240ms 420ms ease-out both; }
.verdict.no .paper { animation: shake 360ms 420ms ease-in-out both; }
.verdict .amount { margin-top: 4px; font-family: var(--serif); }
.verdict .unit { color: var(--paper-muted); }
.stamp-row { position: absolute; inset-inline: 0; bottom: 30px; display: flex; justify-content: center; }
.stamp {
  padding: 2px 20px; border: 6px double currentcolor; border-radius: 8px; font: 700 3.6em/1.15 var(--serif);
  mix-blend-mode: multiply; transform: rotate(-6deg); animation: stamp 300ms 260ms cubic-bezier(.3, .7, .3, 1.1) both;
}
.verdict.ok .stamp { color: var(--stamp-ok); }
.verdict.no .stamp { color: var(--stamp-bad); }
.line { font-size: 1.3em; font-weight: 600; text-align: center; animation: rise 300ms 620ms ease-out both; }
.verdict button { flex: none; animation: rise 300ms 620ms ease-out both; }
code { word-break: break-all; font-size: .8em; }
@keyframes flood { from { clip-path: circle(0% at 50% 42%); } to { clip-path: circle(150% at 50% 42%); } }
@keyframes stamp {
  0% { opacity: 0; transform: scale(2.6) rotate(-16deg); }
  70% { opacity: 1; transform: scale(.94) rotate(-6deg); }
  100% { opacity: 1; transform: scale(1) rotate(-6deg); }
}
@keyframes thud { 40% { transform: translateY(6px) scale(.985); } }
@keyframes shake { 20%, 60% { transform: translateX(-7px); } 40%, 80% { transform: translateX(7px); } }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
@keyframes sweep { from { top: 12%; } to { top: 88%; } }
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { transition: none !important; animation: none !important; }
}
`;

const SEAL = `<svg aria-hidden="true" class="seal" viewBox="0 0 40 40">
<circle cx="20" cy="20" fill="#f5b83d" r="20"/>
<text dominant-baseline="central" fill="#1a1405" font-size="19" font-weight="700" text-anchor="middle" x="20" y="20">हुं</text>
</svg>`;

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

const group = (className: string, ...nodes: Node[]) => {
  const node = element("div", className);
  node.append(...nodes);
  return node;
};

const seal = () => {
  const template = document.createElement("template");
  template.innerHTML = SEAL;
  return template.content;
};

const amountOf = (atoms: bigint) => {
  const node = element("p", "amount", formatUsdt(atoms));
  node.append(element("span", "unit", "USDT"));
  return node;
};

/** What this is, how much, then anything else that belongs with it. */
const summary = (kicker: string, atoms: bigint, ...rest: Node[]) =>
  group(
    "card",
    group("head", element("p", "kicker", kicker), seal()),
    amountOf(atoms),
    ...rest
  );

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
  const offline = element("p", "offline", "Offline. Payments still work.");
  const showNetwork = () => {
    offline.hidden = navigator.onLine;
  };
  addEventListener("online", showNetwork);
  addEventListener("offline", showNetwork);
  showNetwork();
  root.append(offline, box, element("p", "foot", FOOTER));
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
    return group("qr", canvas);
  };

  const scan = (hint: string, onBytes: (bytes: Uint8Array) => void) => {
    const video = element("video", "");
    video.muted = true;
    video.playsInline = true;
    const problem = element("p", "bad");
    show(
      group(
        "camera",
        video,
        ...["a", "b", "c", "d"].map((at) => element("span", `corner ${at}`)),
        element("span", "sweep")
      ),
      element("p", "hint", hint),
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
    const note = element("div", "paper");
    note.append(element("p", "kicker", "Hundi"));
    if (verdict.ok) {
      note.append(amountOf(verdict.amount));
    }
    note.append(
      group("stamp-row", element("p", "stamp", verdict.ok ? "Paid" : "Refused"))
    );
    const banner = group(
      `verdict ${verdict.ok ? "ok" : "no"}`,
      note,
      element(
        "p",
        "line",
        verdict.ok ? "Checked with no network" : REJECT_MESSAGES[verdict.reason]
      ),
      button("Next customer", home, "light")
    );
    banner.dataset.verdict = verdict.ok ? "ok" : verdict.reason;
    show(banner);
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
    status.textContent = "Claiming…";
    try {
      const results = await wallet.settle();
      const paid = results.filter(
        (r) => r.kind === "paid" || r.kind === "covered"
      );
      status.textContent =
        results.length > 0
          ? `${paid.length} of ${results.length} claimed`
          : "Nothing to claim yet.";
    } catch {
      status.textContent = "Could not reach the network. Try again.";
    }
  };

  const exportCsv = async () => {
    download("hundi-settlements.csv", settlementCsv(await wallet.receipts()));
  };

  const merchantHome = () => {
    const request = wallet.request(price);
    const status = element("p", "status");
    show(
      summary("To pay", price),
      qr(encodeRequest(request)),
      element("p", "hint", "Customer scans this, then shows their code."),
      button("Scan their payment", () => takePayment(request)),
      group(
        "row",
        button("Claim", () => settle(status), "plain"),
        button("Download CSV", exportCsv, "plain")
      ),
      status
    );
  };

  const payRequest = async (request: PayRequest, status: HTMLElement) => {
    try {
      const payment = await wallet.pay(request);
      show(
        qr(encodePayment(payment)),
        summary("Show this to the shop", payment.header.face),
        button("Done", home)
      );
    } catch (cause) {
      status.textContent = cause instanceof Error ? cause.message : "Not paid";
    }
  };

  const confirmPay = (request: PayRequest) => {
    const status = element("p", "bad");
    show(
      summary("You are paying", request.amount),
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
      summary(
        "You can spend",
        BigInt(spendable) * price,
        element("p", "detail", "Available offline")
      ),
      button("Scan the shop's code", scanShop),
      button(`Add ${label}`, () => addNote(status), "plain"),
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
