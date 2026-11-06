import { flushSync } from "react-dom";

export const reducedMotion = (): boolean =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** For routes only. A verdict shows straight away and never waits on a transition. */
export const slide = (direction: "back" | "push", update: () => void): void => {
  if (!("startViewTransition" in document) || reducedMotion()) {
    update();
    return;
  }
  document.documentElement.dataset.slide = direction;
  document.startViewTransition(() => flushSync(update));
};
