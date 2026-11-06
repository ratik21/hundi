import { receiptUrl } from "@hundi/wallet/chain-io";
import {
  formatUsdt,
  type SettleResult,
  type Wallet,
} from "@hundi/wallet/wallet";
import { useCallback, useState } from "react";
import type { Route } from "./app";
import {
  type Activity,
  type ActivityKind,
  activityOf,
  groupsTotal,
  type NoteGroup,
  noteGroups,
  receivedTotal,
  settleSummary,
} from "./ledger";
import { Verdict, Working } from "./moments";
import { Button, Card, Note, Notice, Page, Plane, Seal } from "./ui";
import type { WalletView } from "./use-wallet";

const MINUTE = 60n;
const HOUR = 3600n;
const MAX_CHIPS = 6;
const NO_NETWORK = "Could not reach the network. Try again.";

const syncedLabel = (syncedAt: bigint): string => {
  if (syncedAt === 0n) {
    return "Not updated yet. Get signal once before you go offline.";
  }
  const age = BigInt(Math.floor(Date.now() / 1000)) - syncedAt;
  if (age < MINUTE) {
    return "Updated just now";
  }
  return age < HOUR
    ? `Updated ${age / MINUTE} min ago`
    : `Updated ${age / HOUR} h ago`;
};

const groupLabel = ({ count, face }: NoteGroup): string =>
  `${count} ${count === 1 ? "note" : "notes"} of ${formatUsdt(face)} USDT`;

const ACTIVITY: Record<
  ActivityKind,
  { detail: string; sign: string; title: string; tone: string }
> = {
  covered: {
    detail: "Someone spent this note twice. Their deposit paid you.",
    sign: "+",
    title: "Covered by a deposit",
    tone: "text-leaf",
  },
  covered_in_part: {
    detail: "Someone spent this note twice. Their deposit paid part of it.",
    sign: "+",
    title: "Covered in part",
    tone: "text-gold",
  },
  paid_out: {
    detail: "This money is yours to keep.",
    sign: "+",
    title: "Paid out to you",
    tone: "text-leaf",
  },
  received: {
    detail: "Spend it on, or settle it for cash.",
    sign: "+",
    title: "Received",
    tone: "text-ink",
  },
  sent: {
    detail: "You paid with this note.",
    sign: "−",
    title: "Sent",
    tone: "text-muted",
  },
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
    return `Covered ${formatUsdt(result.paid)} USDT`;
  }
  if (result.kind === "already") {
    return "Already paid";
  }
  return FAILURES[result.reason] ?? "Could not settle. Try again.";
};

const SETTLE_LINES = {
  "Already paid": "These notes were paid out before.",
  Covered: "Someone spent a note twice. Their deposit paid you.",
  "Not settled": "Your notes are safe here. Nothing was lost.",
  Settled: "Paid out to you",
};

const SettleDone = ({
  onDone,
  results,
}: {
  onDone: () => void;
  results: readonly SettleResult[];
}) => {
  const { amount, word } = settleSummary(results);
  return (
    <Verdict
      amount={amount > 0n ? `${formatUsdt(amount)} USDT` : undefined}
      line={SETTLE_LINES[word]}
      onDone={onDone}
      tone={word === "Not settled" ? "bad" : "ok"}
      verdict={word}
      word={word}
    >
      <ul className="mt-5 flex flex-col gap-1 text-left">
        {results.map((result) => (
          <li
            className="flex items-center justify-between gap-3 border-t border-white/25 py-2"
            key={result.noteId}
          >
            <span className="tabular">{settleLine(result)}</span>
            {"txHash" in result && result.txHash && (
              <a
                className="shrink-0 text-sm underline"
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
    </Verdict>
  );
};

const OfflineBand = () => (
  <section className="bg-indigo text-card animate-lift flex items-center gap-3 rounded-xl px-4 py-3">
    <Plane className="size-6 shrink-0" />
    <div>
      <p className="font-semibold">Offline. Payments still work.</p>
      <p className="text-card/80 text-sm">
        Hundi checks every note right here on this phone.
      </p>
    </div>
  </section>
);

const Welcome = ({ go }: { go: (route: Route) => void }) => (
  <>
    <Note blank>
      <div className="flex flex-col items-center gap-2 py-5 text-center">
        <Seal className="size-14 opacity-90" />
        <h1 className="mt-2 font-serif text-3xl font-semibold">
          Nothing here yet
        </h1>
        <p className="text-muted">
          Add money once while you have signal. After that, you can pay with
          none.
        </p>
      </div>
    </Note>
    <Button onClick={() => go("add")}>Add money</Button>
    <Button onClick={() => go("receive")} variant="plain">
      Receive
    </Button>
    <p className="text-muted text-center text-sm">
      Only getting paid? Receive works right away.
    </p>
  </>
);

const NoteChips = ({ groups }: { groups: readonly NoteGroup[] }) => (
  <span aria-hidden="true" className="flex gap-1">
    {groups
      .flatMap(({ count, face }) => Array.from({ length: count }, () => face))
      .slice(0, MAX_CHIPS)
      .map((face, index) => (
        <span
          className="border-ink/25 bg-paper tabular grid h-6 w-9 place-items-center rounded-sm border font-serif text-sm font-semibold"
          // biome-ignore lint/suspicious/noArrayIndexKey: identical chips with no identity of their own.
          key={index}
        >
          {formatUsdt(face)}
        </span>
      ))}
  </span>
);

const Balance = ({ groups }: { groups: readonly NoteGroup[] }) => {
  const count = groups.reduce((sum, group) => sum + group.count, 0);
  return (
    <section className="animate-lift" key={count}>
      <Note sheets={count - 1}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-muted font-medium">You can spend</p>
          <Seal />
        </div>
        <p className="tabular -mt-2 font-serif text-6xl font-semibold tracking-tight">
          {formatUsdt(groupsTotal(groups))}
          <span className="text-muted ml-2 font-sans text-2xl font-semibold">
            USDT
          </span>
        </p>
        <div className="border-sand mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3">
          {count > 0 && <NoteChips groups={groups} />}
          <p className="font-medium">
            {count > 0
              ? groups.map(groupLabel).join(", ")
              : "No notes right now. Receive a payment, or add money."}
          </p>
        </div>
      </Note>
      {count > 0 && (
        <p className="text-muted mt-3 px-1 text-sm">
          Notes work like cash. A payment spends one whole note, with no change.
        </p>
      )}
    </section>
  );
};

const Deposit = ({ amount }: { amount: bigint }) => (
  <Card>
    <p className="tabular font-semibold">
      Safety deposit {formatUsdt(amount)} USDT
    </p>
    <p className="text-muted mt-0.5 text-sm">
      Still your money. It is why strangers trust your notes with no signal.
    </p>
  </Card>
);

const ActivityRow = ({ line }: { line: Activity }) => {
  const { detail, sign, title, tone } = ACTIVITY[line.kind];
  return (
    <li className="border-sand flex items-start justify-between gap-3 border-t py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-muted text-sm">
          {detail}{" "}
          {line.receipt && (
            <a
              className="underline"
              href={receiptUrl(line.receipt)}
              rel="noreferrer"
              target="_blank"
            >
              Receipt
            </a>
          )}
        </p>
      </div>
      {line.amount !== undefined && (
        <p className={`tabular shrink-0 font-semibold ${tone}`}>
          {sign}
          {formatUsdt(line.amount)} USDT
        </p>
      )}
    </li>
  );
};

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
  const [busy, setBusy] = useState<"settling" | "syncing" | null>(null);
  const [problem, setProblem] = useState("");
  const [results, setResults] = useState<readonly SettleResult[]>([]);

  const groups = noteGroups(view.notes);
  const received = receivedTotal(view.notes);
  const lines = activityOf(view.notes, view.receipts);
  const fresh = view.notes.length === 0 && view.deposit === 0n;
  const canSpend = groups.length > 0;

  const settle = useCallback(async () => {
    setBusy("settling");
    setProblem("");
    try {
      setResults(await wallet.settle());
      await refresh();
    } catch {
      setProblem(NO_NETWORK);
    } finally {
      setBusy(null);
    }
  }, [refresh, wallet]);

  const update = useCallback(async () => {
    setBusy("syncing");
    setProblem("");
    try {
      await sync();
    } catch {
      setProblem(NO_NETWORK);
    } finally {
      setBusy(null);
    }
  }, [sync]);

  if (busy === "settling") {
    return (
      <Working
        detail="Cashing out your notes. This takes a few seconds."
        title="Settling…"
      />
    );
  }
  if (results.length > 0) {
    return <SettleDone onDone={() => setResults([])} results={results} />;
  }

  return (
    <Page>
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-serif text-2xl font-semibold">
          Hundi
        </span>
        <div className="flex items-center gap-3">
          {online && (
            <span
              className="text-leaf flex items-center gap-1.5 text-sm font-semibold"
              data-network="online"
            >
              <span className="bg-leaf size-2 rounded-full" />
              Online
            </span>
          )}
          <button
            aria-label="Settings"
            className="text-ink -mr-1 rounded-full p-1"
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

      {!online && <OfflineBand />}

      {fresh ? (
        <Welcome go={go} />
      ) : (
        <>
          <Balance groups={groups} />
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => go("pay")}
              variant={canSpend ? "primary" : "plain"}
            >
              Pay
            </Button>
            <Button onClick={() => go("receive")}>Receive</Button>
          </div>
        </>
      )}

      {!view.settings.guard && (
        <Notice tone="warn">Demo: double-spend guard is off</Notice>
      )}
      {problem && <Notice tone="bad">{problem}</Notice>}

      {received > 0n && (
        <Card>
          <p className="font-semibold">
            You received {formatUsdt(received)} USDT
          </p>
          <p className="text-muted mt-0.5 mb-3 text-sm">
            {online
              ? "Settle to cash it out, or spend it on."
              : "Settle when you have signal. Your notes are safe here."}
          </p>
          <Button disabled={!online} onClick={settle}>
            Settle
          </Button>
        </Card>
      )}

      {view.deposit > 0n && <Deposit amount={view.deposit} />}

      {lines.length > 0 && (
        <section>
          <h2 className="font-serif text-xl font-semibold">Activity</h2>
          <ul className="mt-1">
            {lines.map((line) => (
              <ActivityRow key={line.id} line={line} />
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-auto flex flex-col gap-3">
        {!fresh && (
          <Button onClick={() => go("add")} variant="plain">
            Add money
          </Button>
        )}
        <p className="text-muted text-center text-sm">
          {syncedLabel(view.syncedAt)}
          {online && (
            <>
              {" · "}
              <button
                className="font-semibold underline"
                disabled={busy !== null}
                onClick={update}
                type="button"
              >
                {busy === "syncing" ? "Refreshing…" : "Refresh"}
              </button>
            </>
          )}
        </p>
      </footer>
    </Page>
  );
};
