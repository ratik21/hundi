import { drawQr } from "@hundi/wallet/qr";
import { startScan } from "@hundi/wallet/scanner";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { reducedMotion } from "./motion";
import { PLEDGES } from "./pledges";
import { useOnline } from "./use-wallet";

const SHEET_CLOSE_MS = 200;
const DRAG_TAP_PX = 4;
const DRAG_CLOSE_PX = 80;
const TOAST_MS = 1400;

const PAGE =
  "mx-auto flex min-h-(--app-height) max-w-md flex-col gap-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]";

export const Page = ({ children }: { children: ReactNode }) => (
  <main className={PAGE}>{children}</main>
);

export const Seal = ({ className = "size-9" }: { className?: string }) => (
  <svg aria-hidden="true" className={className} viewBox="0 0 40 40">
    <circle className="fill-accent" cx="20" cy="20" r="20" />
    <text
      className="fill-on-accent"
      dominantBaseline="central"
      fontSize="19"
      fontWeight="700"
      textAnchor="middle"
      x="20"
      y="20"
    >
      हुं
    </text>
  </svg>
);

export const TokenIcon = ({
  className = "size-10",
}: {
  className?: string;
}) => (
  <svg aria-hidden="true" className={className} viewBox="0 0 40 40">
    <circle className="fill-tether" cx="20" cy="20" r="20" />
    <path
      d="M12 11h16M20 11v18M13 18c4 1.6 10 1.6 14 0"
      fill="none"
      stroke="white"
      strokeLinecap="round"
      strokeWidth="3"
    />
  </svg>
);

/** A round glyph at the start of a list row. */
export const RowIcon = ({
  children,
  tone = "text-fg",
}: {
  children: ReactNode;
  tone?: string;
}) => (
  <span
    className={`bg-raised grid size-10 shrink-0 place-items-center rounded-full ${tone}`}
  >
    {children}
  </span>
);

const SHIELD = "M12 3l7 3v5.5c0 4.4-3 7.7-7 9.5-4-1.8-7-5.1-7-9.5V6z";

const GLYPHS = {
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  coins:
    "M15 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0zM21 12a6 6 0 0 1-9 5.2M12 6.8A6 6 0 0 1 21 12",
  down: "M12 5v14M6 13l6 6 6-6",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  plus: "M12 5v14M5 12h14",
  shield: SHIELD,
  up: "M12 19V5M6 11l6-6 6 6",
  verified: `${SHIELD}M8.8 12l2.3 2.3 4.2-4.3`,
};

export type GlyphName = keyof typeof GLYPHS;

export const Glyph = ({
  className = "size-5",
  name,
}: {
  className?: string;
  name: GlyphName;
}) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.2"
    viewBox="0 0 24 24"
  >
    <path d={GLYPHS[name]} />
  </svg>
);

export const PledgeRows = () => (
  <ul className="stagger flex flex-col gap-4">
    {PLEDGES.map(({ glyph, line, title }) => (
      <li className="flex items-center gap-3" key={title}>
        <RowIcon tone="text-accent">
          <Glyph name={glyph} />
        </RowIcon>
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="text-muted text-sm text-pretty">{line}</p>
        </div>
      </li>
    ))}
  </ul>
);

export const Plane = ({ className = "size-5" }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
  </svg>
);

export const Screen = ({
  children,
  onBack,
  title,
}: {
  children: ReactNode;
  onBack?: () => void;
  title: string;
}) => {
  const online = useOnline();
  return (
    <Page>
      <header className="flex items-center gap-2">
        {onBack && (
          <button
            aria-label="Back"
            className="-ml-2 rounded-full p-2"
            onClick={onBack}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <h1 className="min-w-0 flex-1 text-[1.4rem] font-semibold">{title}</h1>
        {!online && (
          <span className="bg-accent text-on-accent flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold">
            <Plane className="size-4" />
            Offline
          </span>
        )}
      </header>
      {children}
    </Page>
  );
};

const BUTTON = {
  light: "bg-white text-black",
  plain: "border border-line bg-surface text-fg",
  primary: "bg-accent text-on-accent",
} as const;

export const Button = ({
  children,
  disabled = false,
  onClick,
  variant = "primary",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: keyof typeof BUTTON;
}) => (
  <button
    className={`w-full rounded-2xl px-4 py-4 text-lg font-semibold disabled:opacity-40 ${BUTTON[variant]}`}
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

export const Card = ({ children }: { children: ReactNode }) => (
  <section className="border-line bg-surface rounded-2xl border p-4">
    {children}
  </section>
);

export const Notice = ({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "bad" | "plain" | "warn";
}) => {
  const tones = {
    bad: "bg-bad/15 text-bad",
    plain: "bg-raised text-fg",
    warn: "bg-warn/15 text-warn",
  };
  return (
    <p className={`rounded-xl px-3 py-2 text-sm ${tones[tone]}`}>{children}</p>
  );
};

/** Slides up over the page. Drag the handle down, tap outside, or press Escape to close. */
export const Sheet = ({
  children,
  label,
  onClose,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
}) => {
  const [closing, setClosing] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);
  const grabbedAt = useRef<number | null>(null);
  const travelled = useRef(0);

  const close = useCallback(() => {
    if (reducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
    setTimeout(onClose, SHEET_CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    const onKey = ({ key }: KeyboardEvent) => {
      if (key === "Escape") {
        close();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [close]);

  const release = () => {
    const distance = dragged ?? 0;
    grabbedAt.current = null;
    travelled.current = distance;
    setDragged(null);
    if (distance >= DRAG_CLOSE_PX) {
      close();
    }
  };

  return (
    <div className="fixed inset-0 z-10 flex flex-col justify-end">
      <button
        aria-label="Close"
        className={`animate-fade absolute inset-0 bg-black/60 transition-opacity duration-200 focus-visible:outline-none active:scale-100 ${
          closing ? "opacity-0" : ""
        }`}
        onClick={close}
        type="button"
      />
      <section
        aria-label={label}
        aria-modal="true"
        className={`animate-sheet bg-surface relative mx-auto flex w-full max-w-md flex-col gap-4 rounded-t-3xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] ${
          dragged === null ? "transition-[translate] duration-200 ease-out" : ""
        }`}
        role="dialog"
        style={{ translate: closing ? "0 100%" : `0 ${dragged ?? 0}px` }}
      >
        <button
          aria-label="Drag down to close"
          className="-mb-2 flex h-7 w-full shrink-0 touch-none items-center justify-center active:scale-100"
          data-handle
          onClick={() => {
            if (travelled.current < DRAG_TAP_PX) {
              close();
            }
            travelled.current = 0;
          }}
          onPointerCancel={release}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            grabbedAt.current = event.clientY;
          }}
          onPointerMove={(event) => {
            if (grabbedAt.current !== null) {
              setDragged(Math.max(0, event.clientY - grabbedAt.current));
            }
          }}
          onPointerUp={release}
          type="button"
        >
          <span className="bg-line h-1 w-10 rounded-full" />
        </button>
        {children}
      </section>
    </div>
  );
};

/** `toast` must render outside any sheet, whose slide would pin it to the sheet. */
export const useCopy = (text: string) => {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = setTimeout(() => setMessage(""), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied");
    } catch {
      setMessage("Could not copy");
    }
  }, [text]);

  const toast = message && (
    <p
      className="animate-toast pointer-events-none fixed inset-x-0 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] z-20 flex justify-center"
      role="status"
    >
      <span className="bg-raised ring-line rounded-full px-4 py-2 text-sm font-semibold shadow-lg ring-1">
        {message}
      </span>
    </p>
  );

  return { copy, toast };
};

export const Stepper = ({
  label,
  onChange,
  step,
  suffix,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  step: number;
  suffix: string;
  value: number;
}) => {
  const change = (delta: number) => onChange(Math.max(0, value + delta));
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="font-medium">{label}</p>
        <p className="tabular text-muted text-sm">
          {value} {suffix}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          aria-label={`Less ${label}`}
          className="border-line size-11 rounded-full border text-xl"
          onClick={() => change(-step)}
          type="button"
        >
          −
        </button>
        <button
          aria-label={`More ${label}`}
          className="border-line size-11 rounded-full border text-xl"
          onClick={() => change(step)}
          type="button"
        >
          +
        </button>
      </div>
    </div>
  );
};

/** White card with a quiet zone, so a camera finds the code on a cream page. */
export const QrCode = ({ bytes }: { bytes: Uint8Array }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const draw = () => {
      if (!(canvas.current && frame.current)) {
        return;
      }
      const ratio = devicePixelRatio;
      const width = drawQr(
        canvas.current,
        bytes,
        frame.current.clientWidth * ratio
      );
      canvas.current.style.width = `${width / ratio}px`;
    };
    draw();
    addEventListener("resize", draw);
    return () => removeEventListener("resize", draw);
  }, [bytes]);

  return (
    <div
      className="flex justify-center overflow-hidden rounded-2xl bg-white"
      data-qr
      ref={frame}
    >
      <canvas ref={canvas} />
    </div>
  );
};

const CORNERS = [
  "left-6 top-6 border-l-4 border-t-4 rounded-tl-lg",
  "right-6 top-6 border-r-4 border-t-4 rounded-tr-lg",
  "bottom-6 left-6 border-b-4 border-l-4 rounded-bl-lg",
  "bottom-6 right-6 border-b-4 border-r-4 rounded-br-lg",
];

/** Calls `onBytes` once with the first QR it reads, then stops the camera. */
export const Camera = ({
  onBytes,
  onError,
}: {
  onBytes: (bytes: Uint8Array) => void;
  onError: (message: string) => void;
}) => {
  const video = useRef<HTMLVideoElement>(null);
  const handlers = useRef({ onBytes, onError });
  handlers.current = { onBytes, onError };

  useEffect(() => {
    if (!video.current) {
      return;
    }
    return startScan({
      onCamera: () => undefined,
      onError: (message) => handlers.current.onError(message),
      onScan: ({ bytes }) => handlers.current.onBytes(bytes),
      video: video.current,
    });
  }, []);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
      <video className="size-full object-cover" muted playsInline ref={video} />
      <div aria-hidden="true" className="absolute inset-0">
        {CORNERS.map((corner) => (
          <span
            className={`absolute size-12 border-white ${corner}`}
            key={corner}
          />
        ))}
        <span className="animate-sweep absolute inset-x-10 h-0.5 rounded-full bg-white/70" />
      </div>
    </div>
  );
};
