import type {
  Address,
  Hop,
  Note,
  NoteId,
  NoteState,
  PayRequest,
  Snapshot,
} from "@hundi/core/types";
import { MAX_HOPS } from "@hundi/core/types";
import type { Hex } from "viem";

export interface NoteRecord {
  id: NoteId;
  /** Grows with every write, so the latest offer can be found. */
  order: number;
  state: NoteState;
}

export interface Settings {
  /** Demo only. Off lets this device sign a second hop at one slot. */
  guard: boolean;
  payTo?: Address;
  submitDirectly: boolean;
}

export interface Meta {
  fundingKey: Hex;
  settings: Settings;
  snapshot: Snapshot;
  syncedBlock: bigint;
}

export interface WalletStore {
  notes: () => Promise<NoteRecord[]>;
  putNote: (id: NoteId, state: NoteState) => Promise<void>;
  read: <K extends keyof Meta>(key: K) => Promise<Meta[K] | undefined>;
  removeNote: (id: NoteId) => Promise<void>;
  write: <K extends keyof Meta>(key: K, value: Meta[K]) => Promise<void>;
}

const matches = (note: Note, request: PayRequest): boolean =>
  request.amount === 0n || note.header.face === request.amount;

/**
 * Picks the note that pays a request. An offered note can only re-show its
 * hop. With the guard off, and nothing else to spend, the latest offer forks.
 */
export const choosePayment = (
  records: readonly NoteRecord[],
  request: PayRequest,
  guard: boolean
): NoteRecord | undefined => {
  const reshow = records.find(
    ({ state }) =>
      state.kind === "offered" && state.requestId === request.requestId
  );
  if (reshow) {
    return reshow;
  }
  const held = records.find(
    ({ state }) =>
      state.kind === "held" &&
      state.note.hops.length < MAX_HOPS &&
      matches(state.note, request)
  );
  if (held || guard) {
    return held;
  }
  return records
    .filter(
      ({ state }) => state.kind === "offered" && matches(state.note, request)
    )
    .sort((a, b) => b.order - a.order)[0];
};

export const offered = (
  note: Note,
  hop: Hop,
  request: PayRequest
): NoteState => ({
  hop,
  kind: "offered",
  note,
  requestId: request.requestId,
});

export const memoryStore = (): WalletStore => {
  const notes = new Map<NoteId, NoteRecord>();
  const meta = new Map<keyof Meta, Meta[keyof Meta]>();
  let order = 0;
  return {
    notes: () => Promise.resolve([...notes.values()]),
    putNote: (id, state) => {
      order += 1;
      notes.set(id, { id, order, state });
      return Promise.resolve();
    },
    read: <K extends keyof Meta>(key: K) =>
      Promise.resolve(meta.get(key) as Meta[K] | undefined),
    removeNote: (id) => {
      notes.delete(id);
      return Promise.resolve();
    },
    write: (key, value) => {
      meta.set(key, value);
      return Promise.resolve();
    },
  };
};

const DATABASE = "hundi-wallet";
const NOTES = "notes";
const META = "meta";

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const openDatabase = (): Promise<IDBDatabase> => {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(NOTES, { keyPath: "id" });
    request.result.createObjectStore(META);
  };
  return done(request);
};

export const indexedDbStore = async (): Promise<WalletStore> => {
  const database = await openDatabase();
  const table = (name: string, mode: IDBTransactionMode = "readonly") =>
    database.transaction(name, mode).objectStore(name);
  const notes = () => done(table(NOTES).getAll()) as Promise<NoteRecord[]>;
  return {
    notes,
    putNote: async (id, state) => {
      const order = Math.max(0, ...(await notes()).map((n) => n.order)) + 1;
      await done(table(NOTES, "readwrite").put({ id, order, state }));
    },
    read: <K extends keyof Meta>(key: K) =>
      done(table(META).get(key)) as Promise<Meta[K] | undefined>,
    removeNote: async (id) => {
      await done(table(NOTES, "readwrite").delete(id));
    },
    write: async (key, value) => {
      await done(table(META, "readwrite").put(value, key));
    },
  };
};
