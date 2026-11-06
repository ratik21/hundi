import { drawQr } from "@hundi/wallet/qr";
import { startScan } from "@hundi/wallet/scanner";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { useOnline } from "./use-wallet";

const PAGE =
  "mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]";

export const Page = ({ children }: { children: ReactNode }) => (
  <main className={PAGE}>{children}</main>
);

export const Seal = ({ className = "size-9" }: { className?: string }) => (
  <svg aria-hidden="true" className={className} viewBox="0 0 40 40">
    <circle
      className="stroke-clay"
      cx="20"
      cy="20"
      fill="none"
      r="18.5"
      strokeWidth="2"
    />
    <circle
      className="stroke-clay"
      cx="20"
      cy="20"
      fill="none"
      r="15.5"
      strokeWidth="0.75"
    />
    <text
      className="fill-clay"
      dominantBaseline="central"
      fontSize="17"
      fontWeight="700"
      textAnchor="middle"
      x="20"
      y="20"
    >
      हुं
    </text>
  </svg>
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
        <h1 className="min-w-0 flex-1 font-serif text-[1.4rem] font-semibold">
          {title}
        </h1>
        {!online && (
          <span className="bg-indigo text-paper flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold">
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
  light: "bg-card text-ink",
  plain: "border border-ink/20 bg-card text-ink",
  primary: "bg-indigo text-card",
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
    className={`w-full rounded-xl px-4 py-4 text-lg font-semibold transition active:scale-[0.98] disabled:opacity-40 ${BUTTON[variant]}`}
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

export const Card = ({ children }: { children: ReactNode }) => (
  <section className="border-sand bg-card rounded-xl border p-4">
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
    bad: "bg-clay/10 text-clay",
    plain: "bg-sand/60 text-ink",
    warn: "bg-gold/15 text-gold",
  };
  return (
    <p className={`rounded-lg px-3 py-2 text-sm ${tones[tone]}`}>{children}</p>
  );
};

/** A paper note, with one sheet showing beneath it per extra note. */
export const Note = ({
  blank = false,
  children,
  sheets = 0,
}: {
  blank?: boolean;
  children: ReactNode;
  sheets?: number;
}) => (
  <div className="relative" style={{ marginBottom: Math.min(sheets, 2) * 8 }}>
    {sheets > 1 && (
      <div
        aria-hidden="true"
        className="note-sheet"
        style={{ transform: "translateY(16px) scale(0.93)" }}
      />
    )}
    {sheets > 0 && (
      <div
        aria-hidden="true"
        className="note-sheet"
        style={{ transform: "translateY(8px) scale(0.965)" }}
      />
    )}
    <div className={`note p-5 ${blank ? "note-blank" : ""}`}>{children}</div>
  </div>
);

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
          className="border-sand size-11 rounded-full border text-xl"
          onClick={() => change(-step)}
          type="button"
        >
          −
        </button>
        <button
          aria-label={`More ${label}`}
          className="border-sand size-11 rounded-full border text-xl"
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
      className="flex justify-center rounded-xl bg-white shadow-[0_0_0_1px_rgb(26_33_51/0.1)]"
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
    <div className="bg-ink relative aspect-square w-full overflow-hidden rounded-xl">
      <video className="size-full object-cover" muted playsInline ref={video} />
      <div aria-hidden="true" className="absolute inset-0">
        {CORNERS.map((corner) => (
          <span
            className={`border-card absolute size-12 ${corner}`}
            key={corner}
          />
        ))}
        <span className="animate-sweep bg-card/70 absolute inset-x-10 h-0.5 rounded-full" />
      </div>
    </div>
  );
};
