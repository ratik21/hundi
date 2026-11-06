import type { NoteRecord } from "@hundi/wallet/store";
import {
  formatUsdt,
  type SettleResult,
  type Wallet,
} from "@hundi/wallet/wallet";
import { useCallback, useState } from "react";
import type { Route } from "./app";
import { receiptUrl } from "./network";
import { Button, Card, Notice } from "./ui";
import type { WalletView } from "./use-wallet";

const MINUTE = 60n;
const HOUR = 3600n;

const held = (record: NoteRecord): bigint =>
  record.state.kind === "held" ? record.state.note.header.face : 0n;

const syncedLabel = (syncedAt: bigint): string => {
  if (syncedAt === 0n) {
    return "Never checked. Go online once before the outage.";
  }
  const age = BigInt(Math.floor(Date.now() / 1000)) - syncedAt;
  if (age < MINUTE) {
    return "Checked just now";
  }
  return age < HOUR
    ? `Checked ${age / MINUTE} min ago`
    : `Checked ${age / HOUR} h ago`;
};

const noteLine = (record: NoteRecord) => {
  const { state } = record;
  if (state.kind === "held") {
    const received = state.note.hops.length > 0;
    return {
      detail: received ? "Received. Spend it or settle it" : "Ready to spend",
      title: `${formatUsdt(state.note.header.face)} USDT`,
    };
  }
  if (state.kind === "offered") {
    return {
      detail: "Paid out",
      title: `${formatUsdt(state.note.header.face)} USDT`,
    };
  }
  return {
    detail: state.kind === "settled" ? "Paid" : "Paid in part",
    receipt: state.txHash,
    title: state.kind === "settled" ? "Settled" : "Covered in part",
  };
};

const FAILURES: Record<string, string> = {
  BondEmpty: "The cheater's deposit has run out. You can try again later.",
  NoteExpired: "This note's time to settle has passed.",
};

const settleLine = (result: SettleResult): string => {
  if (result.kind === "paid") {
    return `Paid ${formatUsdt(result.paid)} USDT`;
  }
  if (result.kind === "covered") {
    return `Covered ${formatUsdt(result.paid)} USDT. The double-spender paid for this`;
  }
  if (result.kind === "already") {
    return "Already paid";
  }
  return FAILURES[result.reason] ?? "Could not settle. Try again.";
};

const SettleReport = ({ results }: { results: readonly SettleResult[] }) => (
  <Card>
    <ul className="flex flex-col gap-2">
      {results.map((result) => (
        <li
          className="flex items-center justify-between gap-3"
          key={result.noteId}
        >
          <span
            className={result.kind === "failed" ? "text-clay" : "text-leaf"}
          >
            {settleLine(result)}
          </span>
          {"txHash" in result && result.txHash && (
            <a
              className="text-muted shrink-0 text-sm underline"
              href={receiptUrl(result.txHash)}
              rel="noreferrer"
              target="_blank"
            >
              Receipt
            </a>
          )}
        </li>
      ))}
    </ul>
  </Card>
);

export const Home = ({
  go,
  online,
  refresh,
  sync,
  view,
  wallet,
}: {
  go: (route: Route) => void;
  online: boolean;
  refresh: () => Promise<void>;
  sync: () => Promise<void>;
  view: WalletView;
  wallet: Wallet;
}) => {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [results, setResults] = useState<readonly SettleResult[]>([]);

  const balance = view.notes.reduce((sum, record) => sum + held(record), 0n);
  const toSettle = view.notes.some(
    ({ state }) => state.kind === "held" && state.note.hops.length > 0
  );

  const settle = useCallback(async () => {
    setBusy(true);
    setProblem("");
    try {
      setResults(await wallet.settle());
      await refresh();
    } catch {
      setProblem("Could not reach the network. Try again.");
    } finally {
      setBusy(false);
    }
  }, [refresh, wallet]);

  const check = useCallback(async () => {
    setBusy(true);
    setProblem("");
    try {
      await sync();
    } catch {
      setProblem("Could not reach the network. Try again.");
    } finally {
      setBusy(false);
    }
  }, [sync]);

  const notes = [...view.notes].sort((a, b) => b.order - a.order);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <span className="text-xl font-bold tracking-tight">Hundi</span>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              online ? "bg-leaf/15 text-leaf" : "bg-ink text-paper"
            }`}
            data-network={online ? "online" : "offline"}
          >
            {online ? "Online" : "Offline"}
          </span>
          <button
            aria-label="Settings"
            className="text-ink rounded-full p-1"
            onClick={() => go("settings")}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="8" cy="17" r="2" />
            </svg>
          </button>
        </div>
      </header>

      <section className="py-4 text-center">
        <p className="text-muted">You can spend</p>
        <p className="tabular text-6xl font-bold tracking-tight">
          {formatUsdt(balance)}
          <span className="text-muted ml-2 text-2xl font-semibold">USDT</span>
        </p>
        <p className="text-muted mt-2 text-sm">{syncedLabel(view.syncedAt)}</p>
        {view.deposit > 0n && (
          <p className="text-muted text-sm">
            Safety deposit {formatUsdt(view.deposit)} USDT
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => go("pay")}>Pay</Button>
        <Button onClick={() => go("receive")}>Receive</Button>
      </div>

      {!view.settings.guard && (
        <Notice tone="warn">Demo: double-spend guard is off</Notice>
      )}
      {problem && <Notice tone="bad">{problem}</Notice>}
      {results.length > 0 && <SettleReport results={results} />}

      {toSettle && (
        <Button disabled={busy || !online} onClick={settle}>
          {busy ? "Settling…" : "Settle"}
        </Button>
      )}
      {toSettle && !online && (
        <Notice>Settle when you have signal. Your notes are safe here.</Notice>
      )}

      {notes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted text-sm font-semibold">Notes</h2>
          {notes.map((record) => {
            const line = noteLine(record);
            return (
              <div
                className="border-sand bg-card flex items-center justify-between rounded-xl border px-4 py-3"
                key={record.id}
              >
                <div>
                  <p className="tabular font-semibold">{line.title}</p>
                  <p className="text-muted text-sm">{line.detail}</p>
                </div>
                {line.receipt && (
                  <a
                    className="text-muted text-sm underline"
                    href={receiptUrl(line.receipt)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Receipt
                  </a>
                )}
              </div>
            );
          })}
        </section>
      )}

      <div className="mt-auto grid grid-cols-2 gap-3">
        <Button onClick={() => go("add")} variant="plain">
          Add money
        </Button>
        <Button disabled={busy || !online} onClick={check} variant="plain">
          Check now
        </Button>
      </div>
    </main>
  );
};
