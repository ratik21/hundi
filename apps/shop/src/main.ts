import type { Verdict } from "@hundi/core/types";
import { mountHundi, registerHundiWorker } from "@hundi/wallet/widget";

const orders = document.querySelector("#orders");

const markOrderPaid = (verdict: Verdict) => {
  if (verdict.ok) {
    const order = document.createElement("li");
    order.textContent = `Coffee and croissant, paid at ${new Date().toLocaleTimeString()}`;
    orders?.append(order);
  }
};

addEventListener("hashchange", () => location.reload());

await registerHundiWorker();
await mountHundi(document.querySelector("#till"), {
  onVerdict: markOrderPaid,
  price: "5.00",
  role: location.hash === "#customer" ? "customer" : "merchant",
});
