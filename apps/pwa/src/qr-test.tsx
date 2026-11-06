import {
  type DeviceKey,
  keyFingerprint,
  type OpenedDeviceKey,
  openDeviceKey,
} from "@hundi/wallet/keystore";
import { drawQr, renderQr } from "@hundi/wallet/qr";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  buildPayload,
  FOUR_HOP_BYTES,
  payloadSigner,
  payloadVerifies,
  TWO_HOP_BYTES,
} from "./payload";
import { createDecoder, type Scan, startScan } from "./scanner";

/** PLAN.md U3 requires a scan within 5 seconds. */
const SCAN_LIMIT_MS = 5000;
const SELF_TEST_SCALE = 7;

type Mode = "scan" | "show";
type Result = Scan & { signer: string; valid: boolean };

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 text-sm">
    <span className="text-neutral-500">{label}</span>
    <span className="text-right font-mono">{value}</span>
  </div>
);

const Choice = <T,>({
  label,
  onChoose,
  selected,
  value,
}: {
  label: string;
  onChoose: (value: T) => void;
  selected: T;
  value: T;
}) => {
  const choose = useCallback(() => onChoose(value), [onChoose, value]);
  return (
    <button
      className={`flex-1 rounded-lg px-3 py-3 font-semibold ${
        selected === value
          ? "bg-emerald-800 text-white"
          : "bg-neutral-100 text-neutral-800"
      }`}
      onClick={choose}
      type="button"
    >
      {label}
    </button>
  );
};

const useRound = () => {
  const [round, setRound] = useState(0);
  const next = useCallback(() => setRound((current) => current + 1), []);
  return { next, round };
};

const useDeviceKey = () => {
  const [key, setKey] = useState<OpenedDeviceKey | null>(null);
  const [fingerprint, setFingerprint] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const open = async () => {
      try {
        const opened = await openDeviceKey();
        setFingerprint(await keyFingerprint(opened.publicKey));
        setKey(opened);
      } catch (cause) {
        setError(describeError(cause));
      }
    };
    open();
  }, []);

  return { error, fingerprint, key };
};

const useOnline = (): boolean => {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);

  return online;
};

const useServiceWorkerControl = (): boolean => {
  const [controlled, setControlled] = useState(
    Boolean(navigator.serviceWorker?.controller)
  );

  useEffect(() => {
    const update = () =>
      setControlled(Boolean(navigator.serviceWorker.controller));
    navigator.serviceWorker?.addEventListener("controllerchange", update);
    return () =>
      navigator.serviceWorker?.removeEventListener("controllerchange", update);
  }, []);

  return controlled;
};

const usePersistentStorage = (): string => {
  const [state, setState] = useState("checking");

  useEffect(() => {
    const request = async () => {
      const persisted = await navigator.storage?.persist?.();
      setState(persisted ? "persistent" : "best effort");
    };
    request();
  }, []);

  return state;
};

/** Remount with a new `key` for a new payload. */
const PayloadQr = ({
  deviceKey,
  size,
}: {
  deviceKey: DeviceKey;
  size: number;
}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [payload, setPayload] = useState<Uint8Array | null>(null);

  useEffect(() => {
    let current = true;
    const build = async () => {
      const built = await buildPayload(deviceKey, size);
      if (current) {
        setPayload(built);
      }
    };
    build();
    return () => {
      current = false;
    };
  }, [deviceKey, size]);

  useLayoutEffect(() => {
    const draw = () => {
      if (!(canvas.current && frame.current && payload)) {
        return;
      }
      const ratio = devicePixelRatio;
      const width = drawQr(
        canvas.current,
        payload,
        frame.current.clientWidth * ratio
      );
      canvas.current.style.width = `${width / ratio}px`;
    };
    draw();
    addEventListener("resize", draw);
    return () => removeEventListener("resize", draw);
  }, [payload]);

  return (
    <>
      <div className="flex justify-center bg-white" ref={frame}>
        <canvas
          aria-label={`QR code holding ${size} signed bytes`}
          ref={canvas}
          role="img"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
      <p className="text-center text-sm text-neutral-500">
        Turn screen brightness up. Payload is {payload?.length ?? 0} bytes.
      </p>
    </>
  );
};

const ShowQr = ({ deviceKey }: { deviceKey: DeviceKey }) => {
  const [size, setSize] = useState(FOUR_HOP_BYTES);
  const { next, round } = useRound();

  return (
    <section className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Choice
          label="618 bytes"
          onChoose={setSize}
          selected={size}
          value={FOUR_HOP_BYTES}
        />
        <Choice
          label="362 bytes"
          onChoose={setSize}
          selected={size}
          value={TWO_HOP_BYTES}
        />
      </div>
      <PayloadQr deviceKey={deviceKey} key={`${size}-${round}`} size={size} />
      <button
        className="rounded-lg bg-neutral-100 px-3 py-3 font-semibold"
        onClick={next}
        type="button"
      >
        New payload
      </button>
    </section>
  );
};

const Verdict = ({ result }: { result: Result }) => (
  <div
    className={`rounded-lg p-4 text-white ${
      result.valid ? "bg-green-700" : "bg-red-700"
    }`}
  >
    <p className="text-center text-3xl font-bold">
      {result.valid ? "Signature valid" : "Signature bad"}
    </p>
    <p className="mt-2 text-center">
      {result.bytes.length} bytes in {(result.milliseconds / 1000).toFixed(2)} s
      ({result.frames} frames)
    </p>
    <p className="text-center">
      {result.milliseconds <= SCAN_LIMIT_MS ? "Within" : "Over"} the 5 s limit.
      Signer {result.signer}
    </p>
  </div>
);

/** Remount with a new `key` to scan again. */
const CameraScan = ({ onAgain }: { onAgain: () => void }) => {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState("starting");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!video.current) {
      return;
    }
    return startScan({
      onCamera: setCamera,
      onError: setError,
      onScan: async (scan) => {
        setResult({
          ...scan,
          signer: await keyFingerprint(payloadSigner(scan.bytes)),
          valid: await payloadVerifies(scan.bytes),
        });
      },
      video: video.current,
    });
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-black">
        <video
          aria-label="Camera preview"
          autoPlay
          className="h-full w-full object-cover"
          muted
          playsInline
          ref={video}
        />
      </div>
      <Row label="Camera" value={camera} />
      {error ? (
        <p className="rounded-lg bg-red-700 p-4 text-white">{error}</p>
      ) : null}
      {result ? <Verdict result={result} /> : null}
      {result || error ? (
        <button
          className="rounded-lg bg-neutral-100 px-3 py-3 font-semibold"
          onClick={onAgain}
          type="button"
        >
          Scan again
        </button>
      ) : null}
    </section>
  );
};

const ScanQr = () => {
  const { next, round } = useRound();
  return <CameraScan key={round} onAgain={next} />;
};

/** Proves the worker, jsQR and verification on this device with no camera. */
const SelfTest = ({ deviceKey }: { deviceKey: DeviceKey }) => {
  const [outcome, setOutcome] = useState("Not run");

  const run = useCallback(async () => {
    setOutcome("Running");
    const decoder = createDecoder();
    try {
      const payload = await buildPayload(deviceKey, FOUR_HOP_BYTES);
      const image = renderQr(payload, SELF_TEST_SCALE);
      const startedAt = performance.now();
      const decoded = await decoder.decode(image);
      const milliseconds = Math.round(performance.now() - startedAt);
      const valid = decoded !== null && (await payloadVerifies(decoded));
      setOutcome(`${valid ? "Pass" : "Fail"}, decoded in ${milliseconds} ms`);
    } catch (cause) {
      setOutcome(`Error: ${describeError(cause)}`);
    } finally {
      decoder.stop();
    }
  }, [deviceKey]);

  return (
    <div className="flex items-center justify-between gap-4">
      <button
        className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-semibold"
        onClick={run}
        type="button"
      >
        Self-test
      </button>
      <span className="font-mono text-sm" data-testid="self-test">
        {outcome}
      </span>
    </div>
  );
};

export const QrTest = () => {
  const [mode, setMode] = useState<Mode>("show");
  const { error, fingerprint, key } = useDeviceKey();
  const online = useOnline();
  const controlled = useServiceWorkerControl();
  const storage = usePersistentStorage();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Hundi QR test</h1>
      <div className="flex gap-2">
        <Choice
          label="Show"
          onChoose={setMode}
          selected={mode}
          value={"show" as Mode}
        />
        <Choice
          label="Scan"
          onChoose={setMode}
          selected={mode}
          value={"scan" as Mode}
        />
      </div>
      {error ? (
        <p className="rounded-lg bg-red-700 p-4 text-white">{error}</p>
      ) : null}
      {mode === "show" && key ? <ShowQr deviceKey={key} /> : null}
      {mode === "scan" ? <ScanQr /> : null}
      <div className="flex flex-col gap-1 border-t border-neutral-200 pt-3">
        <Row label="Network" value={online ? "Online" : "Offline"} />
        <Row
          label="Service worker"
          value={controlled ? "Controlling" : "Not controlling"}
        />
        <Row
          label="Device key"
          value={`${fingerprint} ${key?.created ? "new" : "restored"}`}
        />
        <Row label="Storage" value={storage} />
        <Row label="Build" value={import.meta.env.VITE_BUILD_ID} />
        {key ? <SelfTest deviceKey={key} /> : null}
      </div>
    </main>
  );
};
