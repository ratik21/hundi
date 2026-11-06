import { formatUsdt, usdt, type Wallet } from "@hundi/wallet/wallet";
import { useCallback, useEffect, useState } from "react";
import { Working } from "./moments";
import { Button, Card, Notice, Screen, Stepper } from "./ui";
import type { WalletView } from "./use-wallet";

const NOTE_USDT = 5;
const DEPOSIT_STEP = 5;
const SPEND_NOTES = 2;
const SPEND_DEPOSIT = 20;
const STALL_DEPOSIT = 10;
const FAILED = "Could not add money. Check your signal and try again.";

interface Amounts {
  count: number;
  deposit: number;
}

const Choice = ({
  detail,
  onPick,
  picked,
  title,
  total,
  why,
}: {
  detail: string;
  onPick: () => void;
  picked: boolean;
  title: string;
  total: number;
  why: string;
}) => (
  <button
    aria-pressed={picked}
    className={`bg-card flex w-full items-start justify-between gap-3 rounded-xl p-4 text-left transition ${
      picked ? "ring-indigo ring-2" : "ring-sand ring-1"
    }`}
    onClick={onPick}
    type="button"
  >
    <span className="min-w-0">
      <span className="block font-serif text-xl font-semibold">{title}</span>
      <span className="text-muted mt-0.5 block text-sm">{why}</span>
      <span className="mt-2 block text-sm font-medium">{detail}</span>
    </span>
    <span className="tabular shrink-0 font-semibold">{total} USDT</span>
  </button>
);

export const AddMoney = ({
  onDone,
  online,
  view,
  wallet,
}: {
  onDone: () => void;
  online: boolean;
  view: WalletView;
  wallet: Wallet;
}) => {
  const held = Number(view.deposit / usdt(1));
  // A deposit already posted still counts, so a second load needs less.
  const spending: Amounts = {
    count: SPEND_NOTES,
    deposit: Math.max(0, SPEND_DEPOSIT - held),
  };
  const stall: Amounts = { count: 0, deposit: STALL_DEPOSIT };

  const [{ count, deposit }, setAmounts] = useState(spending);
  const [adjusting, setAdjusting] = useState(false);
  const [funds, setFunds] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState(false);

  const checkFunds = useCallback(() => {
    wallet.funds().then(setFunds, () => setFunds(null));
  }, [wallet]);

  useEffect(() => {
    if (online) {
      checkFunds();
    }
  }, [checkFunds, online]);

  const total = count * NOTE_USDT + deposit;
  const needed = 2n * usdt(count * NOTE_USDT);
  const covered = view.deposit + usdt(deposit) >= needed;
  const short = funds !== null && funds < usdt(total);
  const is = (amounts: Amounts) =>
    amounts.count === count && amounts.deposit === deposit;

  const add = useCallback(async () => {
    setBusy(true);
    setProblem("");
    try {
      await wallet.load({
        bond: usdt(deposit),
        notes: Array.from({ length: count }, () => usdt(NOTE_USDT)),
      });
      onDone();
    } catch {
      setProblem(FAILED);
      setBusy(false);
    }
  }, [count, deposit, onDone, wallet]);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
  }, [wallet]);

  if (busy) {
    return (
      <Working
        detail="Putting your deposit in place and printing your notes. This takes a few seconds."
        title="Adding your money…"
      />
    );
  }

  return (
    <Screen onBack={onDone} title="Add money">
      {!online && (
        <Notice>
          You need signal to add money. Everything else works without it.
        </Notice>
      )}
      <div className="flex flex-col gap-3">
        <Choice
          detail={`${SPEND_NOTES} notes of ${NOTE_USDT} USDT, ${
            spending.deposit > 0
              ? `plus ${spending.deposit} USDT deposit`
              : "covered by your deposit"
          }`}
          onPick={() => setAmounts(spending)}
          picked={is(spending)}
          title="To spend"
          total={spending.count * NOTE_USDT + spending.deposit}
          why="Pay at shops, even with no signal."
        />
        <Choice
          detail={`${STALL_DEPOSIT} USDT deposit, no notes`}
          onPick={() => setAmounts(stall)}
          picked={is(stall)}
          title="For my stall"
          total={STALL_DEPOSIT}
          why="Take payments and pass them on."
        />
      </div>
      <p className="text-muted text-sm">
        The safety deposit stays yours. It lets strangers trust you with no
        signal, and you only lose it if you spend a note twice.
      </p>
      <button
        aria-expanded={adjusting}
        className="self-start text-sm font-semibold underline"
        onClick={() => setAdjusting(!adjusting)}
        type="button"
      >
        Change amounts
      </button>
      {adjusting && (
        <Card>
          <div className="flex flex-col gap-4">
            <Stepper
              label="Notes"
              onChange={(next) => setAmounts({ count: next, deposit })}
              step={1}
              suffix={`× ${NOTE_USDT} USDT`}
              value={count}
            />
            <Stepper
              label="Safety deposit"
              onChange={(next) => setAmounts({ count, deposit: next })}
              step={DEPOSIT_STEP}
              suffix="USDT"
              value={deposit}
            />
          </div>
        </Card>
      )}
      {!covered && (
        <Notice tone="warn">
          Your deposit must be at least twice your notes. Raise it to{" "}
          {formatUsdt(needed - view.deposit)} USDT.
        </Notice>
      )}
      {short && (
        <Card>
          <p className="font-semibold">Top up first</p>
          <p className="text-muted mt-0.5 text-sm">
            Send at least {total} USDT to this address, then check again.
          </p>
          <p className="mt-2 font-mono text-sm break-all" data-address>
            {wallet.address}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button onClick={copy} variant="plain">
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={checkFunds} variant="plain">
              Check again
            </Button>
          </div>
        </Card>
      )}
      {problem && <Notice tone="bad">{problem}</Notice>}
      <div className="mt-auto flex flex-col gap-2">
        {funds !== null && (
          <p className="text-muted text-center text-sm">
            Available to add: {formatUsdt(funds)} USDT
          </p>
        )}
        <Button
          disabled={!(online && covered) || short || total === 0}
          onClick={add}
        >
          Add {total} USDT
        </Button>
      </div>
    </Screen>
  );
};
