import type { RejectReason } from "@hundi/core/types";

export const REJECT_MESSAGES: Record<RejectReason, string> = {
  bad_chain: "This payment's history is broken.",
  bad_signature: "This payment is not signed correctly.",
  expiring: "This payment is about to expire.",
  seen_before: "You have already taken this payment.",
  spent: "This money has already been claimed.",
  too_long: "This money has changed hands too often. Ask them to claim it.",
  uncovered: "Nobody's safety deposit covers this payment.",
  unknown_note: "This payment is newer than your last check. Go online once.",
  wrong_amount: "The amount does not match.",
};
