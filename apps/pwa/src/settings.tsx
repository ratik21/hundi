import type { Address } from "@hundi/core/types";
import { type Bytes, keyFingerprint } from "@hundi/wallet/keystore";
import type { Wallet } from "@hundi/wallet/wallet";
import { useCallback, useEffect, useState } from "react";
import { concatHex, hexToBytes, isAddress } from "viem";
import { Button, Card, Notice, Screen } from "./ui";
import type { WalletView } from "./use-wallet";

const Switch = ({
  checked,
  help,
  label,
  onChange,
}: {
  checked: boolean;
  help: string;
  label: string;
  onChange: (checked: boolean) => void;
}) => (
  <div>
    <label className="flex items-center justify-between gap-4">
      <span className="font-medium">{label}</span>
      <input
        aria-checked={checked}
        checked={checked}
        className="peer sr-only"
        onChange={(event) => onChange(event.target.checked)}
        role="switch"
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className="bg-raised peer-checked:bg-accent peer-focus-visible:outline-accent relative h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
      />
    </label>
    <p className="text-muted mt-1 pr-16 text-sm">{help}</p>
  </div>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="text-sm">
    <p className="text-muted">{label}</p>
    <p className="font-mono break-all">{value}</p>
  </div>
);

export const Settings = ({
  onChange,
  onDone,
  view,
  wallet,
}: {
  onChange: () => Promise<void>;
  onDone: () => void;
  view: WalletView;
  wallet: Wallet;
}) => {
  const [payTo, setPayTo] = useState(view.settings.payTo ?? wallet.address);
  const [saved, setSaved] = useState(false);
  const [fingerprint, setFingerprint] = useState("");

  useEffect(() => {
    const raw = hexToBytes(concatHex([wallet.key.x, wallet.key.y]));
    keyFingerprint(raw as Bytes).then(setFingerprint);
  }, [wallet]);

  const update = useCallback(
    async (change: Parameters<Wallet["updateSettings"]>[0]) => {
      await wallet.updateSettings(change);
      await onChange();
    },
    [onChange, wallet]
  );

  const save = useCallback(async () => {
    await update({ payTo: payTo as Address });
    setSaved(true);
  }, [payTo, update]);

  return (
    <Screen onBack={onDone} title="Settings">
      <Card>
        <div className="flex flex-col gap-5">
          <Switch
            checked={view.settings.submitDirectly}
            help="Settle from this phone, with no relay service and no relay fee."
            label="Submit directly"
            onChange={(submitDirectly) => update({ submitDirectly })}
          />
          <Switch
            checked={!view.settings.guard}
            help="Lets this phone spend one note twice, to show what happens."
            label="Demo: disable double-spend guard"
            onChange={(disabled) => update({ guard: !disabled })}
          />
        </div>
      </Card>
      {!view.settings.guard && (
        <Notice tone="warn">
          With the guard off, this phone can spend one note twice. Your deposit
          pays for it.
        </Notice>
      )}

      <Card>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Pay me out to</span>
          <span className="text-muted text-sm">
            Where your money goes when you settle.
          </span>
          <input
            className="border-line bg-raised mt-1 rounded-lg border px-3 py-2 font-mono text-sm"
            onChange={(event) => {
              setSaved(false);
              setPayTo(event.target.value as Address);
            }}
            value={payTo}
          />
        </label>
        <div className="mt-3">
          <Button disabled={!isAddress(payTo)} onClick={save} variant="plain">
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </Card>

      <details className="border-line bg-surface rounded-xl border p-4">
        <summary className="font-medium">About this phone</summary>
        <div className="mt-3 flex flex-col gap-3">
          <Row label="Device key" value={fingerprint} />
          <Row label="Top-up address" value={wallet.address} />
          <Row label="Build" value={import.meta.env.VITE_BUILD_ID as string} />
          <a className="text-muted text-sm underline" href="#qr-test">
            QR test page
          </a>
        </div>
      </details>
    </Screen>
  );
};
