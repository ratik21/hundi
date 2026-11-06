export type Bytes = Uint8Array<ArrayBuffer>;

export interface DeviceKey {
  /** Raw x || y, 64 bytes. */
  publicKey: Bytes;
  /** Signs raw message bytes. WebCrypto hashes them with SHA-256. Returns r || s, 64 bytes. */
  sign: (message: Bytes) => Promise<Bytes>;
}

export type OpenedDeviceKey = DeviceKey & {
  /** True when this call made the key, false when it came from storage. */
  created: boolean;
};

const CURVE = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGNATURE = { hash: "SHA-256", name: "ECDSA" } as const;
const DATABASE = "hundi-keystore";
const STORE = "keys";
const DEVICE_KEY = "device";
const UNCOMPRESSED_POINT = 0x04;
const PUBLIC_KEY_BYTES = 64;
const SIGNATURE_BYTES = 64;
const FINGERPRINT_BYTES = 4;

export const generateKeyPair = (): Promise<CryptoKeyPair> =>
  crypto.subtle.generateKey(CURVE, false, ["sign", "verify"]);

export const deviceKeyFrom = async (
  pair: CryptoKeyPair
): Promise<DeviceKey> => {
  const point = await crypto.subtle.exportKey("raw", pair.publicKey);
  return {
    publicKey: new Uint8Array(point).slice(1),
    sign: async (message) =>
      new Uint8Array(
        await crypto.subtle.sign(SIGNATURE, pair.privateKey, message)
      ),
  };
};

/** Scanned bytes are untrusted, so a malformed key or signature is `false`, not an error. */
export const verifyP256 = async (
  publicKey: Bytes,
  signature: Bytes,
  message: Bytes
): Promise<boolean> => {
  if (
    publicKey.length !== PUBLIC_KEY_BYTES ||
    signature.length !== SIGNATURE_BYTES
  ) {
    return false;
  }
  const point = new Uint8Array(PUBLIC_KEY_BYTES + 1);
  point[0] = UNCOMPRESSED_POINT;
  point.set(publicKey, 1);
  try {
    const key = await crypto.subtle.importKey("raw", point, CURVE, false, [
      "verify",
    ]);
    return await crypto.subtle.verify(SIGNATURE, key, signature, message);
  } catch {
    return false;
  }
};

export const keyFingerprint = async (publicKey: Bytes): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", publicKey)
  );
  return Array.from(digest.slice(0, FINGERPRINT_BYTES), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

const settled = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const openDatabase = (): Promise<IDBDatabase> => {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  return settled(request);
};

const readPair = (database: IDBDatabase): Promise<CryptoKeyPair | undefined> =>
  settled(
    database.transaction(STORE).objectStore(STORE).get(DEVICE_KEY)
  ) as Promise<CryptoKeyPair | undefined>;

/** `add` refuses to overwrite, so a racing tab can never replace a key that already signed. */
const addPair = async (
  database: IDBDatabase,
  pair: CryptoKeyPair
): Promise<boolean> => {
  const store = database.transaction(STORE, "readwrite").objectStore(STORE);
  try {
    await settled(store.add(pair, DEVICE_KEY));
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "ConstraintError") {
      return false;
    }
    throw error;
  }
};

export const openDeviceKey = async (): Promise<OpenedDeviceKey> => {
  const database = await openDatabase();
  const existing = await readPair(database);
  if (existing) {
    return { ...(await deviceKeyFrom(existing)), created: false };
  }
  const created = await addPair(database, await generateKeyPair());
  const stored = await readPair(database);
  if (!stored) {
    throw new Error("The device key was not saved");
  }
  return { ...(await deviceKeyFrom(stored)), created };
};
