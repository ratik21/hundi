import { receiptUrl, whitechainSepolia } from "@hundi/wallet/chain-io";
import {
  formatUsdt,
  type SettleResult,
  type Wallet,
} from "@hundi/wallet/wallet";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Route } from "./app";
import {
  type Activity,
  type ActivityKind,
  activityOf,
  dollars,
  groupsTotal,
  type NoteGroup,
  noteGroups,
  receivedTotal,
  settleSummary,
  tweened,
  whenLabel,
} from "./ledger";
import { Verdict, Working } from "./moments";
import { reducedMotion } from "./motion";
import { TAGLINE } from "./pledges";
import {
  Button,
  Card,
  Glyph,
  Notice,
  Page,
  Plane,
  PledgeRows,
  RowIcon,
  Seal,
  Sheet,
  TokenIcon,
  useCopy,
} from "./ui";
import type { WalletView } from "./use-wallet";

const MINUTE = 60n;
const HOUR = 3600n;
const ADDRESS_EDGE = 6;
const NO_NETWORK = "Could not reach the network. Try again.";
const TWEEN_MS = 450;

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

const ACTIVITY: Record<
  ActivityKind,
  {
    detail?: string;
    glyph: "check" | "down" | "shield" | "up";
    sign: string;
    status?: "Confirmed" | "Pending";
    title: string;
    tone: string;
  }
> = {
  covered: {
    detail: "Someone spent this money twice. Their deposit paid you.",
    glyph: "shield",
    sign: "+",
    status: "Confirmed",
    title: "Covered by a deposit",
    tone: "text-good",
  },
  covered_in_part: {
    detail: "Someone spent this money twice. Their deposit paid part of it.",
    glyph: "shield",
    sign: "+",
    status: "Confirmed",
    title: "Covered in part",
    tone: "text-warn",
  },
  paid_out: {
    glyph: "check",
    sign: "+",
    status: "Confirmed",
    title: "Received",
    tone: "text-good",
  },
  received: {
    glyph: "down",
    sign: "+",
    status: "Pending",
    title: "Received",
    tone: "text-fg",
  },
  sent: {
    glyph: "up",
    sign: "−",
    title: "Sent",
    tone: "text-muted",
  },
};

const FAILURES: Record<string, string> = {
  BondEmpty: "The cheater's deposit has run out. You can try again later.",
  NoteExpired: "The time to claim this has passed.",
};

const settleLine = (result: SettleResult): string => {
  if (result.kind === "paid") {
    return `Paid ${formatUsdt(result.paid)} USDT`;
  }
  if (result.kind === "covered") {
    return `Covered ${formatUsdt(result.paid)} USDT`;
  }
  if (result.kind === "already") {
    return "Already claimed";
  }
  return FAILURES[result.reason] ?? "Could not claim this. Try again.";
};

const SETTLE_LINES = {
  "Already claimed": "You already have this money.",
  Claimed: "Paid out to you",
  Covered: "Someone spent this money twice. Their deposit paid you.",
  "Not claimed": "Your money is safe here. Nothing was lost.",
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
      tone={word === "Not claimed" ? "bad" : "ok"}
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
  <section className="animate-lift border-accent/40 bg-accent/10 flex items-center gap-3 rounded-2xl border px-4 py-3">
    <Plane className="text-accent size-6 shrink-0" />
    <div>
      <p className="font-semibold">Offline. Payments still work.</p>
      <p className="text-muted text-sm">
        Hundi checks every payment right here on this phone.
      </p>
    </div>
  </section>
);

const Welcome = ({ go }: { go: (route: Route) => void }) => (
  <>
    <div className="flex flex-col gap-5 lg:hidden">
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <Seal className="size-14" />
        <h1 className="text-3xl font-semibold text-balance">{TAGLINE}</h1>
      </div>
      <PledgeRows />
    </div>
    <div className="hidden flex-col items-center gap-2 py-10 text-center lg:flex">
      <Seal className="size-16" />
      <h1 className="mt-3 text-3xl font-semibold">Nothing here yet</h1>
      <p className="text-muted">
        Add money once while you have signal. After that, you can pay with none.
      </p>
    </div>
    <div className="mt-2 flex flex-col gap-3">
      <Button onClick={() => go("add")}>Add money</Button>
      <Button onClick={() => go("receive")} variant="plain">
        Receive
      </Button>
    </div>
  </>
);

const useTween = (target: bigint): bigint => {
  const [shown, setShown] = useState(target);
  const latest = useRef(target);

  useEffect(() => {
    const from = latest.current;
    const show = (amount: bigint) => {
      latest.current = amount;
      setShown(amount);
    };
    if (from === target) {
      return;
    }
    if (reducedMotion()) {
      show(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / TWEEN_MS);
      show(tweened(from, target, progress));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    let frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
};

const Balance = ({ online, total }: { online: boolean; total: bigint }) => {
  const shown = useTween(total);
  return (
    <section className="animate-lift relative isolate py-3 text-center">
      <div
        aria-hidden="true"
        className={online ? "glow" : "glow glow-offline"}
        data-glow
      />
      <p className="text-muted font-medium">You can spend</p>
      <p
        className="tabular mt-1 text-6xl font-semibold tracking-tight"
        data-balance
      >
        {dollars(shown)}
      </p>
      <p className="tabular text-muted mt-1">{formatUsdt(total)} USDT</p>
    </section>
  );
};

const Action = ({
  disabled = false,
  glyph,
  highlight = false,
  label,
  name,
  onClick,
}: {
  disabled?: boolean;
  glyph: "check" | "down" | "plus" | "up";
  highlight?: boolean;
  label?: string;
  name: string;
  onClick: () => void;
}) => (
  <button
    aria-label={label}
    className="flex flex-col items-center gap-1.5 text-sm font-medium disabled:opacity-40"
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    <span
      className={`grid size-14 place-items-center rounded-full ${
        highlight ? "bg-accent text-on-accent" : "bg-raised text-fg"
      }`}
    >
      <Glyph className="size-6" name={glyph} />
    </span>
    {name}
  </button>
);

const TokenRow = ({
  amount,
  detail,
  icon,
  title,
  tone = "",
}: {
  amount: string;
  detail: string;
  icon: ReactNode;
  title: string;
  tone?: string;
}) => (
  <li className="flex items-center gap-3 py-3">
    {icon}
    <div className="min-w-0 flex-1">
      <p className="font-semibold">{title}</p>
      <p className={`text-sm ${tone || "text-muted"}`}>{detail}</p>
    </div>
    <p className="tabular shrink-0 font-semibold">{amount}</p>
  </li>
);

const Tokens = ({
  deposit,
  groups,
  lost,
}: {
  deposit: bigint;
  groups: readonly NoteGroup[];
  lost: bigint;
}) => (
  <ul className="stagger">
    <TokenRow
      amount={`${formatUsdt(groupsTotal(groups))} USDT`}
      detail={groups.length > 0 ? "Available offline" : "Nothing to spend yet"}
      icon={<TokenIcon />}
      title="USDT"
    />
    {(deposit > 0n || lost > 0n) && (
      <TokenRow
        amount={`${formatUsdt(deposit)} USDT`}
        detail={
          lost > 0n
            ? `${formatUsdt(lost)} USDT taken. This phone spent the same money twice.`
            : "Still yours. It is why strangers trust your payments."
        }
        icon={
          <RowIcon tone="text-accent">
            <Glyph name="shield" />
          </RowIcon>
        }
        title="Safety deposit"
        tone={lost > 0n ? "text-bad" : ""}
      />
    )}
  </ul>
);

const ActivityRow = ({ line }: { line: Activity }) => {
  const { detail, glyph, sign, status, title, tone } = ACTIVITY[line.kind];
  const facts = [
    line.party,
    line.at === undefined ? undefined : whenLabel(line.at, Date.now()),
  ].filter(Boolean);
  return (
    <li className="flex items-center gap-3 py-3">
      <RowIcon tone={tone}>
        <Glyph name={glyph} />
      </RowIcon>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold">
          {title}
          {status && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                status === "Pending"
                  ? "bg-warn/15 text-warn"
                  : "bg-good/15 text-good"
              }`}
            >
              {status}
            </span>
          )}
        </p>
        {detail && <p className="text-muted text-sm">{detail}</p>}
        <p className="text-muted text-sm">
          {facts.join(" · ")}
          {line.receipt && (
            <a
              className="block underline"
              href={receiptUrl(line.receipt)}
              rel="noreferrer"
              target="_blank"
            >
              View on explorer
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

const shortAddress = (address: string): string =>
  `${address.slice(0, ADDRESS_EDGE)}…${address.slice(-ADDRESS_EDGE + 2)}`;

/** The crypto details live here, one tap away from a screen that needs none. */
const WalletSheet = ({
  address,
  go,
  onClose,
  online,
}: {
  address: string;
  go: (route: Route) => void;
  onClose: () => void;
  online: boolean;
}) => {
  const { copy, label } = useCopy(address);
  const explorer = whitechainSepolia.blockExplorers.default.url;
  return (
    <Sheet label="Wallet" onClose={onClose}>
      <div className="flex items-center gap-3">
        <Seal className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Wallet</p>
          <p className="text-muted tabular font-mono text-sm" data-address>
            {shortAddress(address)}
          </p>
        </div>
        <button
          className="bg-raised rounded-full px-4 py-2 text-sm font-semibold"
          onClick={copy}
          type="button"
        >
          {label}
        </button>
      </div>
      <div className="border-line flex items-center justify-between border-t pt-4 text-sm">
        <span className="text-muted">Network</span>
        <span className="flex items-center gap-1.5 font-medium">
          <span
            className={`size-2 rounded-full ${online ? "bg-good" : "bg-muted"}`}
          />
          {whitechainSepolia.name}
        </span>
      </div>
      <a
        className="text-sm font-semibold underline"
        href={`${explorer}/address/${address}`}
        rel="noreferrer"
        target="_blank"
      >
        View on explorer
      </a>
      <Button onClick={() => go("settings")} variant="plain">
        Settings
      </Button>
    </Sheet>
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
  const [tab, setTab] = useState<"activity" | "tokens">("tokens");
  const [account, setAccount] = useState(false);

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
        detail="Getting your money. This takes a few seconds."
        title="Claiming…"
      />
    );
  }
  if (results.length > 0) {
    return <SettleDone onDone={() => setResults([])} results={results} />;
  }

  return (
    <Page>
      <header className="flex items-center justify-between">
        <button
          aria-label="Wallet"
          className="bg-surface border-line flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 font-semibold"
          onClick={() => setAccount(true)}
          type="button"
        >
          <Seal className="size-7" />
          Wallet
          <svg
            aria-hidden="true"
            className="text-muted size-4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          {online && (
            <span
              className="text-good flex items-center gap-1.5 text-sm font-semibold"
              data-network="online"
            >
              <span className="bg-good size-2 rounded-full" />
              Online
            </span>
          )}
          <button
            aria-label="Settings"
            className="text-fg -mr-1 rounded-full p-1"
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
          <Balance online={online} total={groupsTotal(groups)} />
          <div className="grid grid-cols-4">
            <Action
              glyph="up"
              highlight={canSpend}
              name="Pay"
              onClick={() => go("pay")}
            />
            <Action glyph="down" name="Receive" onClick={() => go("receive")} />
            <Action
              glyph="plus"
              label="Add money"
              name="Add"
              onClick={() => go("add")}
            />
            <Action
              disabled={!(online && received > 0n)}
              glyph="check"
              highlight={online && received > 0n}
              name="Claim"
              onClick={settle}
            />
          </div>
        </>
      )}

      {!view.settings.guard && (
        <Notice tone="warn">Demo: double-spend guard is off</Notice>
      )}
      {problem && <Notice tone="bad">{problem}</Notice>}

      {received > 0n && (
        <Card>
          <p className="font-semibold">{formatUsdt(received)} USDT pending</p>
          <p className="text-muted mt-0.5 text-sm">
            {online
              ? "Claim it now, or spend it again."
              : "Claim it when you're online. It's safe on this phone."}
          </p>
        </Card>
      )}

      {!fresh && (
        <section>
          <div
            className="border-line relative grid grid-cols-2 border-b"
            role="tablist"
          >
            {(["tokens", "activity"] as const).map((name) => (
              <button
                aria-selected={tab === name}
                className={`pb-2 font-semibold capitalize transition-colors ${
                  tab === name ? "text-fg" : "text-muted"
                }`}
                key={name}
                onClick={() => setTab(name)}
                role="tab"
                type="button"
              >
                {name}
              </button>
            ))}
            <span
              aria-hidden="true"
              className={`bg-accent absolute -bottom-px left-0 h-0.5 w-1/2 transition-transform duration-200 ease-out ${
                tab === "activity" ? "translate-x-full" : ""
              }`}
              data-underline
            />
          </div>
          {tab === "tokens" ? (
            <Tokens
              deposit={view.deposit}
              groups={groups}
              lost={view.depositLost}
            />
          ) : (
            <ul className="stagger">
              {lines.map((line) => (
                <ActivityRow key={line.id} line={line} />
              ))}
              {lines.length === 0 && (
                <li className="text-muted py-6 text-center text-sm">
                  Nothing yet. Your payments show up here.
                </li>
              )}
            </ul>
          )}
        </section>
      )}

      <footer className="mt-auto">
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

      {account && (
        <WalletSheet
          address={wallet.address}
          go={go}
          onClose={() => setAccount(false)}
          online={online}
        />
      )}
    </Page>
  );
};
