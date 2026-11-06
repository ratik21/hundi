import type { RejectReason } from "@hundi/core/types";

export const REJECT_MESSAGES: Record<RejectReason, string> = {
  bad_chain: "This note's history is broken.",
  bad_signature: "This note is not signed correctly.",
  expiring: "This note is about to expire.",
  seen_before: "You have already taken this note.",
  spent: "This note has already been cashed.",
  too_long: "This note has changed hands too often. Ask them to settle it.",
  uncovered: "Nobody's safety deposit covers this note.",
  unknown_note: "This note is newer than your last check. Go online once.",
  wrong_amount: "The amount does not match.",
};
