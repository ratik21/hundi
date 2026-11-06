import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./index.css";
import { QrTest } from "./qr-test";

const root = document.querySelector("#root");
if (root) {
  addEventListener("hashchange", () => location.reload());
  createRoot(root).render(location.hash === "#qr-test" ? <QrTest /> : <App />);
}
