import { flushSync } from "react-dom";

export const reducedMotion = (): boolean =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** For routes only. A verdict shows straight away and never waits on a transition. */
export const slide = async (
  direction: "back" | "push",
  update: () => void
): Promise<void> => {
  if (!("startViewTransition" in document) || reducedMotion()) {
    update();
    return;
  }
  document.documentElement.dataset.slide = direction;
  await document.startViewTransition(() => flushSync(update))
    .updateCallbackDone;
};
