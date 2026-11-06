import { decodeRequest, encodePayment } from "@hundi/core/bytes";
import type { PayRequest } from "@hundi/core/types";
import { formatUsdt, type Wallet } from "@hundi/wallet/wallet";
import { useCallback, useState } from "react";
import { Failure } from "./moments";
import { Button, Camera, Notice, QrCode, Screen, TokenIcon } from "./ui";

type Step =
  | { kind: "scan" }
  | { kind: "confirm"; request: PayRequest }
  | { kind: "failed"; message: string }
  | { amount: bigint; bytes: Uint8Array; kind: "show" };

const NO_NOTE = "No note can pay this amount";

const NEXT_STEPS: Record<string, string> = {
  [NO_NOTE]:
    "You have no notes left to spend. Add money when you have signal, or receive a payment first.",
  "This request is for another network":
    "Ask them to open Receive in Hundi on their phone, then scan again.",
};

export const Pay = ({
  guard,
  onAddMoney,
  onDone,
  wallet,
}: {
  guard: boolean;
  /** Absent with no signal, when adding money is not an option. */
  onAddMoney?: (() => void) | undefined;
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
      <Failure
        action={
          onAddMoney && step.message === NO_NOTE
            ? { label: "Add money", onClick: onAddMoney }
            : undefined
        }
        next={NEXT_STEPS[step.message] ?? "Go back and try again."}
        onDone={onDone}
        title="Not paid"
        what={`${step.message}. Nothing left your phone.`}
      />
    );
  }

  if (step.kind === "show") {
    return (
      <Screen onBack={onDone} title="Show this to them">
        <QrCode bytes={step.bytes} />
        <p className="tabular text-center text-4xl font-semibold">
          {formatUsdt(step.amount)} USDT
        </p>
        <p className="text-muted text-center">
          They scan this to get paid. Turn your brightness up.
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
        <div className="animate-lift bg-surface border-line mt-6 flex flex-col items-center gap-2 rounded-2xl border px-5 py-8 text-center">
          <TokenIcon className="size-12" />
          <p className="text-muted mt-1">You are paying</p>
          <p className="tabular text-5xl font-semibold tracking-tight">
            {amount === 0n ? "One note" : `${formatUsdt(amount)} USDT`}
          </p>
        </div>
        <p className="text-muted text-center">
          One whole note leaves your phone. It works with no signal.
        </p>
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
      <p className="text-center text-lg">
        Point at the code on their Receive screen.
      </p>
    </Screen>
  );
};
