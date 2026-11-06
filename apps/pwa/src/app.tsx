import { useCallback, useState } from "react";
import { AddMoney } from "./add-money";
import { Home } from "./home";
import { Failure, Working } from "./moments";
import { Pay } from "./pay";
import { Receive } from "./receive";
import { Settings } from "./settings";
import { useWallet } from "./use-wallet";

export type Route = "add" | "home" | "pay" | "receive" | "settings";

export const App = () => {
  const [route, setRoute] = useState<Route>("home");
  const { error, online, refresh, sync, view, wallet } = useWallet();

  const home = useCallback(() => {
    setRoute("home");
    refresh();
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
        onAddMoney={online ? () => setRoute("add") : undefined}
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
      go={setRoute}
      online={online}
      refresh={refresh}
      sync={sync}
      view={view}
      wallet={wallet}
    />
  );
};
