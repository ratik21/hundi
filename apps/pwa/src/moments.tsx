import { type ReactNode, useEffect } from "react";
import { Button, Page, Seal } from "./ui";

const LONG_WORD = 8;
/** The pause opens each buzz pattern, so the phone kicks as the stamp hits the paper. */
const STAMP_LANDS_MS = 470;

const TONES = {
  bad: {
    buzz: [STAMP_LANDS_MS, 60, 50, 60],
    page: "bg-stamp-bad",
    stamp: "text-stamp-bad",
    thud: "animate-shake",
  },
  ok: {
    buzz: [STAMP_LANDS_MS, 30],
    page: "bg-stamp-ok",
    stamp: "text-stamp-ok",
    thud: "animate-thud",
  },
} as const;

/** The stamp comes down on a paper note. The moment a demo is filmed for. */
export const Verdict = ({
  amount,
  children,
  line,
  next,
  onDone,
  tone,
  verdict,
  word,
}: {
  amount?: string | undefined;
  children?: ReactNode;
  line: string;
  next?: string;
  onDone: () => void;
  tone: keyof typeof TONES;
  verdict: string;
  word: string;
}) => {
  const { buzz, page, stamp, thud } = TONES[tone];

  useEffect(() => {
    if ("vibrate" in navigator) {
      navigator.vibrate([...buzz]);
    }
  }, [buzz]);

  return (
    <main
      className={`animate-flood flex min-h-(--app-height) flex-col overflow-hidden px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white ${page}`}
      data-verdict={verdict}
    >
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7">
        <div
          className={`note text-note-ink px-6 pt-8 pb-36 text-center ${thud}`}
        >
          <p className="text-note-muted text-sm">Hundi</p>
          {amount && (
            <p className="tabular mt-1 font-serif text-5xl font-semibold">
              {amount}
            </p>
          )}
          <div className="absolute inset-x-0 bottom-9 flex justify-center">
            <h1
              className={`stamp animate-stamp px-5 py-1 font-serif font-bold whitespace-nowrap ${stamp} ${
                word.length > LONG_WORD ? "text-5xl" : "text-6xl"
              }`}
            >
              {word}
            </h1>
          </div>
        </div>
        <div className="animate-rise text-center">
          <p className="text-2xl font-semibold">{line}</p>
          {next && <p className="mt-2 text-lg opacity-90">{next}</p>}
          {children}
        </div>
      </div>
      <div className="animate-rise mx-auto w-full max-w-sm">
        <Button onClick={onDone} variant="light">
          Done
        </Button>
      </div>
    </main>
  );
};

/** Covers the screen for steps that wait on the network, so a wait reads as work. */
export const Working = ({
  detail,
  title,
}: {
  detail: string;
  title: string;
}) => (
  <main
    aria-live="polite"
    className="flex min-h-(--app-height) flex-col items-center justify-center gap-5 px-8 text-center"
    role="status"
  >
    <div className="animate-breathe">
      <Seal className="size-24" />
    </div>
    <div>
      <p className="text-2xl font-semibold">{title}</p>
      <p className="text-muted mt-2">{detail}</p>
    </div>
  </main>
);

/** What went wrong, then what to do about it. */
export const Failure = ({
  action,
  next,
  onDone,
  title,
  what,
}: {
  action?: { label: string; onClick: () => void } | undefined;
  next: string;
  onDone?: () => void;
  title: string;
  what: string;
}) => (
  <Page>
    <div className="animate-lift flex flex-1 flex-col justify-center gap-5">
      <div className="border-line bg-surface rounded-2xl border px-6 py-8">
        <h1 className="text-bad text-3xl font-semibold">{title}</h1>
        <p className="mt-3 text-lg font-medium">{what}</p>
      </div>
      <div className="px-1">
        <p className="text-muted text-sm font-semibold">What to do next</p>
        <p className="mt-1 text-lg">{next}</p>
      </div>
    </div>
    <div className="flex flex-col gap-3">
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
      {onDone && (
        <Button onClick={onDone} variant={action ? "plain" : "primary"}>
          Done
        </Button>
      )}
    </div>
  </Page>
);
