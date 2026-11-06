import type { Address } from "@hundi/core/types";
import { type Bytes, keyFingerprint } from "@hundi/wallet/keystore";
import type { Wallet } from "@hundi/wallet/wallet";
import { useCallback, useEffect, useState } from "react";
import { concatHex, hexToBytes, isAddress } from "viem";
import { Button, Card, Notice, Screen } from "./ui";
import type { WalletView } from "./use-wallet";

const Switch = ({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) => (
  <label className="flex items-center justify-between gap-4">
    <span className="font-medium">{label}</span>
    <input
      checked={checked}
      className="accent-leaf size-6"
      onChange={(event) => onChange(event.target.checked)}
      type="checkbox"
    />
  </label>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 text-sm">
    <span className="text-muted">{label}</span>
    <span className="text-right font-mono break-all">{value}</span>
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
        <label className="flex flex-col gap-2">
          <span className="font-medium">Pay me out to</span>
          <input
            className="border-sand rounded-xl border bg-white px-3 py-2 font-mono text-sm"
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

      <Card>
        <div className="flex flex-col gap-4">
          <Switch
            checked={view.settings.submitDirectly}
            label="Submit directly"
            onChange={(submitDirectly) => update({ submitDirectly })}
          />
          <Switch
            checked={!view.settings.guard}
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
        <div className="flex flex-col gap-2">
          <Row label="Device key" value={fingerprint} />
          <Row label="Top-up address" value={wallet.address} />
          <Row label="Build" value={import.meta.env.VITE_BUILD_ID as string} />
        </div>
      </Card>
      <a className="text-muted text-center text-sm underline" href="#qr-test">
        QR test page
      </a>
    </Screen>
  );
};
