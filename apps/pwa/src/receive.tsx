import { decodePayment, encodeRequest } from "@hundi/core/bytes";
import type {
  Verdict as Outcome,
  PayRequest,
  RejectReason,
  UsdtAtoms,
} from "@hundi/core/types";
import { REJECT_MESSAGES } from "@hundi/wallet/messages";
import { formatUsdt, usdt, type Wallet } from "@hundi/wallet/wallet";
import { useCallback, useMemo, useState } from "react";
import { Verdict } from "./moments";
import { Button, Camera, Notice, QrCode, Screen } from "./ui";

const NOTE_USDT = 5;
const ASK_ANOTHER = "Do not hand over the goods. Ask for another note.";

const NEXT_STEPS: Record<RejectReason, string> = {
  bad_chain: ASK_ANOTHER,
  bad_signature: ASK_ANOTHER,
  expiring: ASK_ANOTHER,
  seen_before: "Do not hand over the goods. This one is not new money.",
  spent: ASK_ANOTHER,
  too_long: ASK_ANOTHER,
  uncovered: ASK_ANOTHER,
  unknown_note: "Get signal, tap Refresh on the home screen, and scan again.",
  wrong_amount: "Start again so you both see the same amount.",
};

export const Receive = ({
  onDone,
  wallet,
}: {
  onDone: () => void;
  wallet: Wallet;
}) => {
  const [request] = useState<PayRequest>(() =>
    wallet.request(usdt(NOTE_USDT) as UsdtAtoms)
  );
  const [scanning, setScanning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);

  const code = useMemo(() => encodeRequest(request), [request]);
  const amount = `${formatUsdt(request.amount)} USDT`;

  const scanned = useCallback(
    async (bytes: Uint8Array) => {
      try {
        setProblem("");
        setOutcome(await wallet.receive(decodePayment(bytes), request));
      } catch {
        setProblem("That is not a payment. Scan their Pay screen.");
        setAttempt((current) => current + 1);
      }
    },
    [request, wallet]
  );

  if (outcome?.ok) {
    return (
      <Verdict
        amount={`${formatUsdt(outcome.amount)} USDT`}
        line="Checked with no network"
        onDone={onDone}
        tone="ok"
        verdict="ok"
        word="Paid"
      />
    );
  }

  if (outcome) {
    return (
      <Verdict
        amount={amount}
        line={REJECT_MESSAGES[outcome.reason]}
        next={NEXT_STEPS[outcome.reason]}
        onDone={onDone}
        tone="bad"
        verdict={outcome.reason}
        word="Refused"
      />
    );
  }

  if (scanning) {
    return (
      <Screen onBack={() => setScanning(false)} title="Scan their payment">
        <Camera key={attempt} onBytes={scanned} onError={setProblem} />
        {problem && <Notice tone="bad">{problem}</Notice>}
        <p className="text-center text-lg">
          Point at the code on their phone. It checks with no signal.
        </p>
      </Screen>
    );
  }

  return (
    <Screen onBack={onDone} title="Ask them to scan">
      <QrCode bytes={code} />
      <p className="tabular text-center text-4xl font-semibold">{amount}</p>
      <p className="text-muted text-center">
        One payment is one note. Once they have paid, scan the code on their
        phone.
      </p>
      <div className="mt-auto">
        <Button onClick={() => setScanning(true)}>Scan their payment</Button>
      </div>
    </Screen>
  );
};
