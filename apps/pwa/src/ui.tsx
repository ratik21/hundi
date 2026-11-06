import { drawQr } from "@hundi/wallet/qr";
import { startScan } from "@hundi/wallet/scanner";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { PLEDGES } from "./pledges";
import { useOnline } from "./use-wallet";

const PAGE =
  "mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]";

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
  <ul className="flex flex-col gap-4">
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
    className={`w-full rounded-2xl px-4 py-4 text-lg font-semibold transition active:scale-[0.98] disabled:opacity-40 ${BUTTON[variant]}`}
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
