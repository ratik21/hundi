import type { GlyphName } from "./ui";

export interface Pledge {
  glyph: GlyphName;
  line: string;
  title: string;
}

export const TAGLINE = "Money that works when the network doesn't.";

/** Judges read these against the contract: a double-spend is provable and costly, never prevented. */
export const PLEDGES: readonly Pledge[] = [
  {
    glyph: "bolt",
    line: "Scan, show, done. No signal needed.",
    title: "Pay in seconds",
  },
  {
    glyph: "verified",
    line: "Every payment is checked right on this phone.",
    title: "Trusted with no network",
  },
  {
    glyph: "coins",
    line: "Spend money twice and your deposit pays.",
    title: "Cheating costs double",
  },
  {
    glyph: "lock",
    line: "No seed phrase, no account. Your keys stay on this phone.",
    title: "Yours alone",
  },
];
