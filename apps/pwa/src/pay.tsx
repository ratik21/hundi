import { decodeRequest, encodePayment } from "@hundi/core/bytes";
import type { PayRequest } from "@hundi/core/types";
import { formatUsdt, type Wallet } from "@hundi/wallet/wallet";
import { useCallback, useState } from "react";
import { Button, Camera, Notice, QrCode, Screen } from "./ui";

type Step =
  | { kind: "scan" }
  | { kind: "confirm"; request: PayRequest }
  | { kind: "failed"; message: string }
  | { amount: bigint; bytes: Uint8Array; kind: "show" };

export const Pay = ({
  guard,
  onDone,
  wallet,
}: {
  guard: boolean;
  onDone: () => void;
  wallet: Wallet;
}) => {
  const [step, setStep] = useState<Step>({ kind: "scan" });
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);

  const scanned = useCallback((bytes: Uint8Array) => {
    try {
      setProblem("");
      setStep({ kind: "confirm", request: decodeRequest(bytes) });
    } catch {
      setProblem("That is not a payment request. Scan the Receive screen.");
      setAttempt((current) => current + 1);
    }
  }, []);

  const confirm = useCallback(
    async (request: PayRequest) => {
      try {
        const payment = await wallet.pay(request);
        setStep({
          amount: payment.header.face,
          bytes: encodePayment(payment),
          kind: "show",
        });
      } catch (cause) {
        // Not back to the camera: it would re-read the same code and hide this.
        setStep({
          kind: "failed",
          message: cause instanceof Error ? cause.message : "Could not pay",
        });
      }
    },
    [wallet]
  );

  if (step.kind === "failed") {
    return (
      <Screen onBack={onDone} title="Not paid">
        <Notice tone="bad">{step.message}</Notice>
        <div className="mt-auto">
          <Button onClick={onDone}>Done</Button>
        </div>
      </Screen>
    );
  }

  if (step.kind === "show") {
    return (
      <Screen onBack={onDone} title="Show this to them">
        <QrCode bytes={step.bytes} />
        <p className="tabular text-center text-4xl font-bold">
          {formatUsdt(step.amount)} USDT
        </p>
        <p className="text-muted text-center">
          They scan this. Turn your brightness up.
        </p>
        <div className="mt-auto">
          <Button onClick={onDone}>Done</Button>
        </div>
      </Screen>
    );
  }

  if (step.kind === "confirm") {
    const { amount } = step.request;
    return (
      <Screen onBack={onDone} title="Pay">
        <section className="py-10 text-center">
          <p className="text-muted">You are paying</p>
          <p className="tabular text-6xl font-bold">
            {amount === 0n ? "One note" : `${formatUsdt(amount)} USDT`}
          </p>
        </section>
        {!guard && <Notice tone="warn">Demo: double-spend guard is off</Notice>}
        <div className="mt-auto">
          <Button onClick={() => confirm(step.request)}>Pay</Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen onBack={onDone} title="Scan their code">
      <Camera key={attempt} onBytes={scanned} onError={setProblem} />
      {problem && <Notice tone="bad">{problem}</Notice>}
      <p className="text-muted text-center">
        Point at the code on their Receive screen.
      </p>
    </Screen>
  );
};
