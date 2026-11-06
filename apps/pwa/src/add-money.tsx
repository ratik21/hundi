import { formatUsdt, usdt, type Wallet } from "@hundi/wallet/wallet";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Notice, Screen, Stepper } from "./ui";
import type { WalletView } from "./use-wallet";

const NOTE_USDT = 5;
const DEPOSIT_STEP = 5;
const FAILED = "Could not add money. Check your signal and try again.";

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
  const [count, setCount] = useState(2);
  const [deposit, setDeposit] = useState(20);
  const [funds, setFunds] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (online) {
      wallet.funds().then(setFunds, () => setFunds(null));
    }
  }, [online, wallet]);

  const total = count * NOTE_USDT + deposit;
  const needed = 2n * usdt(count * NOTE_USDT);
  const covered = view.deposit + usdt(deposit) >= needed;
  const short = funds !== null && funds < usdt(total);

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

  return (
    <Screen onBack={onDone} title="Add money">
      {!online && <Notice>You need signal to add money.</Notice>}
      <Card>
        <div className="flex flex-col gap-4">
          <Stepper
            label="Notes"
            onChange={setCount}
            step={1}
            suffix={`× ${NOTE_USDT} USDT`}
            value={count}
          />
          <Stepper
            label="Safety deposit"
            onChange={setDeposit}
            step={DEPOSIT_STEP}
            suffix="USDT"
            value={deposit}
          />
        </div>
      </Card>
      <p className="text-muted text-sm">
        The deposit lets strangers trust your notes offline. You get it back
        unless you spend a note twice. It must be at least twice your notes.
      </p>
      <div className="flex justify-between text-lg">
        <span>Total</span>
        <span className="tabular font-semibold">{total} USDT</span>
      </div>
      {funds !== null && (
        <p className="text-muted text-sm">
          Available to add: {formatUsdt(funds)} USDT
        </p>
      )}
      {!covered && (
        <Notice tone="warn">
          Raise the deposit to at least {formatUsdt(needed)} USDT.
        </Notice>
      )}
      {short && (
        <Card>
          <p className="text-sm">Top up this wallet first:</p>
          <p className="mt-1 font-mono text-sm break-all" data-address>
            {wallet.address}
          </p>
        </Card>
      )}
      {problem && <Notice tone="bad">{problem}</Notice>}
      <div className="mt-auto">
        <Button
          disabled={busy || !online || !covered || short || total === 0}
          onClick={add}
        >
          {busy ? "Adding…" : `Add ${total} USDT`}
        </Button>
      </div>
    </Screen>
  );
};
