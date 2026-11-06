import { hopMessage, keyId, linkOf, noteId, slotOf } from "./bytes";
import type {
  Bytes64,
  Domain,
  Hop,
  KeyId,
  Note,
  NoteId,
  PublicKey,
  Slot,
} from "./types";

export interface Step {
  message: Uint8Array;
  sig: Bytes64;
  signer: PublicKey;
}

export interface Walked {
  /** Whoever the last hop names, and so the only key that may sign next. */
  holder: PublicKey;
  id: NoteId;
  steps: readonly Step[];
  /** The slot the holder signs at. */
  tail: Slot;
}

/** Follows a note's hash chain, the same way `settle` does on-chain. */
export const walk = (dom: Domain, note: Note): Walked => {
  const id = noteId(dom, note.header);
  const steps: Step[] = [];
  let slot = slotOf(id);
  let signer = note.header.owner;
  for (const hop of note.hops) {
    const message = hopMessage(slot, hop.to);
    steps.push({ message, sig: hop.sig, signer });
    slot = slotOf(linkOf(message));
    signer = hop.to;
  }
  return { holder: signer, id, steps, tail: slot };
};

export const appendHop = (note: Note, hop: Hop): Note => ({
  header: note.header,
  hops: [...note.hops, hop],
});

/** Everyone who appears in the chain, in order, including the final holder. */
export const chainKeys = (note: Note): readonly KeyId[] =>
  [note.header.owner, ...note.hops.map((hop) => hop.to)].map(keyId);
