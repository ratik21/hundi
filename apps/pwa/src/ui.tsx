import { drawQr } from "@hundi/wallet/qr";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { startScan } from "./scanner";

export const Screen = ({
  children,
  onBack,
  title,
}: {
  children: ReactNode;
  onBack?: () => void;
  title: string;
}) => (
  <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
    <header className="flex items-center gap-3">
      {onBack && (
        <button
          aria-label="Back"
          className="-ml-2 rounded-full px-2 py-1 text-2xl leading-none"
          onClick={onBack}
          type="button"
        >
          ←
        </button>
      )}
      <h1 className="text-xl font-semibold">{title}</h1>
    </header>
    {children}
  </main>
);

const BUTTON = {
  danger: "bg-clay text-white",
  plain: "border border-sand bg-card text-ink",
  primary: "bg-leaf text-white",
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
  <section className="border-sand bg-card rounded-2xl border p-4">
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
      className="flex justify-center rounded-2xl bg-white"
      data-qr
      ref={frame}
    >
      <canvas ref={canvas} />
    </div>
  );
};

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
    <video
      className="aspect-square w-full rounded-2xl bg-black object-cover"
      muted
      playsInline
      ref={video}
    />
  );
};
