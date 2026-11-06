/** Runs the relayer as a Vercel function at /api/submit. */
import { waitUntil } from "@vercel/functions";
import { relayerFromEnv } from "./from-env";

const ready = relayerFromEnv(waitUntil);

const route = async (request: Request) => {
  const handle = await ready;
  const forwarded = request.headers.get("x-forwarded-for") ?? "unknown";
  return handle(request, forwarded.split(",")[0]?.trim() ?? "unknown");
};

export const OPTIONS = route;
export const POST = route;
