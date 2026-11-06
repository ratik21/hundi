import { decodePayment, encodeRequest } from "@hundi/core/bytes";
import type { PayRequest, UsdtAtoms, Verdict } from "@hundi/core/types";
import { REJECT_MESSAGES } from "@hundi/wallet/messages";
import { formatUsdt, usdt, type Wallet } from "@hundi/wallet/wallet";
import { useCallback, useMemo, useState } from "react";
import { Button, Camera, Notice, QrCode, Screen, Stepper } from "./ui";

const DEFAULT_USDT = 5;

const VerdictScreen = ({
  onDone,
  verdict,
}: {
  onDone: () => void;
  verdict: Verdict;
}) => (
  <main
    className={`flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center text-white ${
      verdict.ok ? "bg-leaf" : "bg-clay"
    }`}
    data-verdict={verdict.ok ? "ok" : verdict.reason}
  >
    <p className="text-8xl">{verdict.ok ? "✓" : "✕"}</p>
    <p className="text-5xl font-bold">{verdict.ok ? "Paid" : "Refused"}</p>
    <p className="tabular text-2xl">
      {verdict.ok
        ? `${formatUsdt(verdict.amount)} USDT`
        : REJECT_MESSAGES[verdict.reason]}
    </p>
    {verdict.ok && <p className="opacity-80">Checked with no network</p>}
    <div className="mt-8 w-full max-w-xs">
      <Button onClick={onDone} variant="plain">
        Done
      </Button>
    </div>
  </main>
);

export const Receive = ({
  onDone,
  wallet,
}: {
  onDone: () => void;
  wallet: Wallet;
}) => {
  const [amount, setAmount] = useState(DEFAULT_USDT);
  const [request, setRequest] = useState<PayRequest | null>(null);
  const [scanning, setScanning] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);

  const code = useMemo(() => request && encodeRequest(request), [request]);

  const ask = useCallback(() => {
    setRequest(wallet.request(usdt(amount) as UsdtAtoms));
  }, [amount, wallet]);

  const scanned = useCallback(
    async (bytes: Uint8Array) => {
      if (!request) {
        return;
      }
      try {
        setProblem("");
        setVerdict(await wallet.receive(decodePayment(bytes), request));
      } catch {
        setProblem("That is not a payment. Scan their Pay screen.");
        setAttempt((current) => current + 1);
      }
    },
    [request, wallet]
  );

  if (verdict) {
    return <VerdictScreen onDone={onDone} verdict={verdict} />;
  }

  if (scanning) {
    return (
      <Screen onBack={() => setScanning(false)} title="Scan their payment">
        <Camera key={attempt} onBytes={scanned} onError={setProblem} />
        {problem && <Notice tone="bad">{problem}</Notice>}
      </Screen>
    );
  }

  if (code && request) {
    return (
      <Screen onBack={onDone} title="Ask them to scan this">
        <QrCode bytes={code} />
        <p className="tabular text-center text-4xl font-bold">
          {formatUsdt(request.amount)} USDT
        </p>
        <div className="mt-auto">
          <Button onClick={() => setScanning(true)}>Scan their payment</Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen onBack={onDone} title="Receive">
      <section className="py-8">
        <Stepper
          label="Amount"
          onChange={setAmount}
          step={DEFAULT_USDT}
          suffix="USDT"
          value={amount}
        />
      </section>
      <div className="mt-auto">
        <Button disabled={amount === 0} onClick={ask}>
          Ask for {amount} USDT
        </Button>
      </div>
    </Screen>
  );
};
