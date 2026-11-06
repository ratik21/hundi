import type { NoteRecord, Settings } from "@hundi/wallet/store";
import { openWallet, type Wallet } from "@hundi/wallet/wallet";
import { useCallback, useEffect, useState } from "react";
import { createReads, RELAYER_URL, writes } from "./network";

export interface WalletView {
  deposit: bigint;
  notes: readonly NoteRecord[];
  settings: Settings;
  syncedAt: bigint;
}

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const readView = async (wallet: Wallet): Promise<WalletView> => {
  const [deposit, notes, settings, snapshot] = await Promise.all([
    wallet.deposit(),
    wallet.notes(),
    wallet.settings(),
    wallet.snapshot(),
  ]);
  return { deposit, notes, settings, syncedAt: snapshot.syncedAt };
};

export const useOnline = (): boolean => {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);
  return online;
};

export const useWallet = () => {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [view, setView] = useState<WalletView | null>(null);
  const [error, setError] = useState("");
  const online = useOnline();

  useEffect(() => {
    const open = async () => {
      try {
        const opened = await openWallet({
          reads: createReads(),
          ...(RELAYER_URL ? { relayer: RELAYER_URL } : {}),
          writes,
        });
        await navigator.storage?.persist?.();
        setView(await readView(opened));
        setWallet(opened);
      } catch (cause) {
        setError(describe(cause));
      }
    };
    open();
  }, []);

  const refresh = useCallback(async () => {
    if (wallet) {
      setView(await readView(wallet));
    }
  }, [wallet]);

  const sync = useCallback(async () => {
    if (!wallet) {
      return;
    }
    await wallet.sync();
    await refresh();
  }, [refresh, wallet]);

  // Keep the offline snapshot fresh whenever there is signal.
  useEffect(() => {
    if (online && wallet) {
      sync().catch(() => undefined);
    }
  }, [online, sync, wallet]);

  return { error, online, refresh, sync, view, wallet };
};
