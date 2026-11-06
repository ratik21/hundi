/** Runs the relayer as a local server. */
import { serve } from "bun";
import { relayerFromEnv } from "./from-env";

const DEFAULT_PORT = 8787;

const handle = await relayerFromEnv();

serve({
  fetch: (request, self) =>
    handle(request, self.requestIP(request)?.address ?? "unknown"),
  port: Number(process.env.PORT ?? DEFAULT_PORT),
});
