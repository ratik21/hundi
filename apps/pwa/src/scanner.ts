import type { Bytes } from "@hundi/wallet/keystore";
import type { QrImage } from "@hundi/wallet/qr";

export interface Decoder {
  decode: (image: QrImage) => Promise<Bytes | null>;
  stop: () => void;
}

export interface Scan {
  bytes: Bytes;
  frames: number;
  milliseconds: number;
}

interface ScanOptions {
  onCamera: (description: string) => void;
  onError: (message: string) => void;
  onScan: (scan: Scan) => void;
  video: HTMLVideoElement;
}

/** Decoding runs in a worker so the camera preview stays smooth. One frame at a time. */
export const createDecoder = (): Decoder => {
  const worker = new Worker(new URL("./scan-worker.ts", import.meta.url), {
    type: "module",
  });
  return {
    decode: (image) =>
      new Promise((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<Bytes | null>) =>
          resolve(event.data);
        worker.onerror = (event) => reject(new Error(event.message));
        worker.postMessage(image, [image.pixels.buffer]);
      }),
    stop: () => worker.terminate(),
  };
};

/** The centre square of the frame, at full resolution. */
const grabFrame = (
  video: HTMLVideoElement,
  context: CanvasRenderingContext2D
): QrImage => {
  const size = Math.min(video.videoWidth, video.videoHeight);
  context.canvas.width = size;
  context.canvas.height = size;
  context.drawImage(
    video,
    (video.videoWidth - size) / 2,
    (video.videoHeight - size) / 2,
    size,
    size,
    0,
    0,
    size,
    size
  );
  const { data } = context.getImageData(0, 0, size, size);
  return { height: size, pixels: data, width: size };
};

const openCamera = (): Promise<MediaStream> =>
  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      height: { ideal: 1080 },
      width: { ideal: 1920 },
    },
  });

/** Returns a function that stops the camera. */
export const startScan = ({
  onCamera,
  onError,
  onScan,
  video,
}: ScanOptions): (() => void) => {
  const decoder = createDecoder();
  const context = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  let stopped = false;
  let stream: MediaStream | null = null;
  let frames = 0;
  let firstFrameAt = 0;

  const stop = () => {
    stopped = true;
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    decoder.stop();
  };

  const fail = (error: unknown) => {
    if (!stopped) {
      onError(error instanceof Error ? error.message : String(error));
      stop();
    }
  };

  const scanFrame = async () => {
    if (stopped || !context) {
      return;
    }
    if (video.readyState < video.HAVE_CURRENT_DATA) {
      requestAnimationFrame(scanFrame);
      return;
    }
    if (frames === 0) {
      firstFrameAt = performance.now();
      onCamera(`${video.videoWidth}×${video.videoHeight}`);
    }
    frames += 1;
    try {
      const bytes = await decoder.decode(grabFrame(video, context));
      if (stopped) {
        return;
      }
      if (bytes) {
        const milliseconds = Math.round(performance.now() - firstFrameAt);
        stop();
        onScan({ bytes, frames, milliseconds });
        return;
      }
      requestAnimationFrame(scanFrame);
    } catch (error) {
      fail(error);
    }
  };

  const start = async () => {
    try {
      const opened = await openCamera();
      if (stopped) {
        for (const track of opened.getTracks()) {
          track.stop();
        }
        return;
      }
      stream = opened;
      video.srcObject = opened;
      await video.play();
      requestAnimationFrame(scanFrame);
    } catch (error) {
      fail(error);
    }
  };

  start();
  return stop;
};
