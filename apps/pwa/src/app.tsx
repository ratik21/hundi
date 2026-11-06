import { useCallback, useState } from "react";
import { AddMoney } from "./add-money";
import { Home } from "./home";
import { Failure, Working } from "./moments";
import { slide } from "./motion";
import { Pay } from "./pay";
import { TAGLINE } from "./pledges";
import { Receive } from "./receive";
import { Settings } from "./settings";
import { PledgeRows, Seal } from "./ui";
import { useWallet } from "./use-wallet";

export type Route = "add" | "home" | "pay" | "receive" | "settings";

const Screens = () => {
  const [route, setRoute] = useState<Route>("home");
  const { error, online, refresh, sync, view, wallet } = useWallet();

  const go = useCallback((next: Route) => {
    slide("push", () => setRoute(next));
  }, []);

  // Refresh after the route lands, so Home mounts on the old balance and tweens.
  const home = useCallback(async () => {
    await slide("back", () => setRoute("home"));
    await refresh();
  }, [refresh]);

  if (error) {
    return (
      <Failure
        next="Close Hundi and open it again. Your notes stay on this phone."
        title="Could not open"
        what={`This phone could not open its wallet: ${error}`}
      />
    );
  }
  if (!(wallet && view)) {
    return <Working detail="Your notes live on this phone." title="Opening…" />;
  }
  if (route === "add") {
    return (
      <AddMoney onDone={home} online={online} view={view} wallet={wallet} />
    );
  }
  if (route === "pay") {
    return (
      <Pay
        guard={view.settings.guard}
        onAddMoney={online ? () => go("add") : undefined}
        onDone={home}
        wallet={wallet}
      />
    );
  }
  if (route === "receive") {
    return <Receive onDone={home} wallet={wallet} />;
  }
  if (route === "settings") {
    return (
      <Settings onChange={refresh} onDone={home} view={view} wallet={wallet} />
    );
  }
  return (
    <Home
      go={go}
      online={online}
      refresh={refresh}
      sync={sync}
      view={view}
      wallet={wallet}
    />
  );
};

const Pitch = () => (
  <aside className="hidden flex-col gap-8 lg:flex">
    <p className="flex items-center gap-3 text-2xl font-semibold">
      <Seal className="size-12" />
      Hundi
    </p>
    <p className="text-5xl/tight font-semibold tracking-tight text-balance xl:text-6xl/tight">
      {TAGLINE}
    </p>
    <PledgeRows />
  </aside>
);

/** Layout containment makes the frame the fixed-position root, so sheets stay in the wallet. */
export const App = () => (
  <div className="lg:mx-auto lg:grid lg:min-h-dvh lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_24.375rem] lg:items-center lg:gap-16 lg:px-12">
    <Pitch />
    <div
      className="lg:ring-line lg:h-(--app-height) lg:overflow-hidden lg:rounded-(--app-radius) lg:shadow-2xl lg:ring-1 lg:contain-layout"
      data-wallet
    >
      <div className="wallet lg:h-full lg:[scrollbar-width:none] lg:overflow-y-auto">
        <Screens />
      </div>
    </div>
  </div>
);
