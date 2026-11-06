import type {
  Bond,
  KeyId,
  NoteFacts,
  NoteId,
  Snapshot,
  UnixSeconds,
  UsdtAtoms,
} from "./types";

export type ChainEvent =
  | {
      expiry: UnixSeconds;
      face: UsdtAtoms;
      kind: "NoteLoaded";
      noteId: NoteId;
    }
  | {
      amount: UsdtAtoms;
      keyId: KeyId;
      kind: "BondChanged";
      lockedUntil: UnixSeconds;
    }
  | { kind: "Settled"; noteId: NoteId };

export const emptySnapshot = (): Snapshot => ({
  bonds: new Map(),
  notes: new Map(),
  syncedAt: 0n as UnixSeconds,
});

/** Folds contract events, oldest first, into what a receiver needs offline. */
export const applyEvents = (
  snapshot: Snapshot,
  events: readonly ChainEvent[],
  syncedAt: UnixSeconds
): Snapshot => {
  const bonds = new Map<KeyId, Bond>(snapshot.bonds);
  const notes = new Map<NoteId, NoteFacts>(snapshot.notes);
  for (const event of events) {
    if (event.kind === "NoteLoaded") {
      const { expiry, face } = event;
      notes.set(event.noteId, { expiry, face, settled: false });
    } else if (event.kind === "BondChanged") {
      const { amount, lockedUntil } = event;
      bonds.set(event.keyId, { amount, lockedUntil });
    } else {
      const facts = notes.get(event.noteId);
      if (facts) {
        notes.set(event.noteId, { ...facts, settled: true });
      }
    }
  }
  return { bonds, notes, syncedAt };
};
