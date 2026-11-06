import { useCallback, useState } from "react";
import { AddMoney } from "./add-money";
import { Home } from "./home";
import { Pay } from "./pay";
import { Receive } from "./receive";
import { Settings } from "./settings";
import { Notice, Screen as Page } from "./ui";
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
      <Page title="Hundi">
        <Notice tone="bad">
          This phone could not open its wallet: {error}
        </Notice>
      </Page>
    );
  }
  if (!(wallet && view)) {
    return (
      <Page title="Hundi">
        <p className="text-muted">Opening…</p>
      </Page>
    );
  }
  if (route === "add") {
    return (
      <AddMoney onDone={home} online={online} view={view} wallet={wallet} />
    );
  }
  if (route === "pay") {
    return <Pay guard={view.settings.guard} onDone={home} wallet={wallet} />;
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
