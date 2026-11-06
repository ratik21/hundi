/** Stands in for cameras and the faucet in `bun run lab`. Local fork only. */
import { USDT } from "@hundi/wallet/chain-io";
import { serve } from "bun";
import { toHex } from "viem";

const FORK = "http://127.0.0.1:8599";
const WBT = "0xDE0B6B3A7640000";
const LAB_USDT = 100_000_000n;
const CORS = { "access-control-allow-origin": "*" };

interface ShownCode {
  from: string;
  hex: string;
}

let shown: ShownCode | undefined;
const funded = new Set<string>();

const fork = (method: string, params: unknown[]) =>
  fetch(FORK, {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

const fund = async (address: string) => {
  if (!funded.has(address)) {
    funded.add(address);
    await fork("anvil_setBalance", [address, WBT]);
    await fork("anvil_dealERC20", [address, USDT, toHex(LAB_USDT)]);
  }
};

serve({
  fetch: async (request) => {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS, status: 204 });
    }
    if (url.pathname === "/fund") {
      const { address } = (await request.json()) as { address: string };
      await fund(address);
      return Response.json({}, { headers: CORS });
    }
    if (request.method === "POST") {
      shown = (await request.json()) as ShownCode;
      return Response.json({}, { headers: CORS });
    }
    const code =
      shown && shown.from !== url.searchParams.get("for") ? shown : undefined;
    if (code) {
      shown = undefined;
    }
    return Response.json({ hex: code?.hex }, { headers: CORS });
  },
  port: 5190,
});
