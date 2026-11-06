import { flushSync } from "react-dom";

let sliding: ViewTransition | undefined;

// A sliding screen takes no hits, so a tap on it lands on <html>. End the slide
// and hand the tap to whatever is under it, so motion never swallows a tap.
document.addEventListener("pointerdown", () => sliding?.skipTransition(), true);
document.addEventListener("click", ({ clientX, clientY, target }) => {
  if (target === document.documentElement) {
    document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("a, button")
      ?.click();
  }
});

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
  sliding = document.startViewTransition(() => flushSync(update));
  await sliding.updateCallbackDone;
};
