import {
  domain,
  domainTag,
  hopMessage,
  keyId,
  noteId,
  settleMessage,
} from "@hundi/core/bytes";
import { appendHop, walk } from "@hundi/core/chain";
import { accept } from "@hundi/core/rule";
import { applyEvents, emptySnapshot } from "@hundi/core/snapshot";
import type {
  Bytes8,
  Bytes16,
  Bytes64,
  Hex32,
  Hop,
  Address as HundiAddress,
  Note,
  NoteId,
  Payment,
  PayRequest,
  PublicKey,
  Snapshot,
  UnixSeconds,
  UsdtAtoms,
  Verdict,
} from "@hundi/core/types";
import {
  type Address,
  bytesToHex,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  http,
  type PublicClient,
  parseSignature,
  slice,
  type Transport,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { vaultAbi } from "./abi.generated";
import {
  CHAIN_ID,
  DEPLOY_BLOCK,
  directSubmit,
  findSettlement,
  GRACE,
  loadNonce,
  RECEIVE_WITH_AUTHORIZATION_TYPES,
  readEvents,
  relayerSubmit,
  revertReason,
  type Submit,
  settledIn,
  USDT,
  USDT_DOMAIN,
  VAULT,
  whitechainSepolia,
} from "./chain-io";
import { type Bytes, type DeviceKey, openDeviceKey } from "./keystore";
import {
  choosePayment,
  indexedDbStore,
  type NoteRecord,
  offered,
  type Receipt,
  type Settings,
  type WalletStore,
} from "./store";

const USDT_ATOMS = 1_000_000n;
const TRAILING_ZEROS = /0+$/u;
const DEFAULT_LIFETIME = 86_400n;
const AUTHORIZATION_SECONDS = 3600n;
/**
 * What a relayer earns for carrying a call. A settle cost about 0.044 USDT of
 * gas and a load 0.074, so this leaves room for a four-hop note. Direct
 * submission pays nothing.
 */
const RELAY_FEE = 100_000n as UsdtAtoms;
const NO_FEE = 0n as UsdtAtoms;
const ZERO_SLOT = `0x${"00".repeat(32)}`;
const SERIAL_BYTES = 16;
const REQUEST_ID_BYTES = 8;

const DEFAULT_SETTINGS: Settings = { guard: true, submitDirectly: false };

const CENT_DIGITS = 2;

export const formatUsdt = (atoms: bigint): string => {
  const whole = atoms / USDT_ATOMS;
  const part = (atoms % USDT_ATOMS)
    .toString()
    .padStart(6, "0")
    .replace(TRAILING_ZEROS, "");
  return part ? `${whole}.${part.padEnd(CENT_DIGITS, "0")}` : `${whole}`;
};

export const usdt = (amount: number): UsdtAtoms =>
  (BigInt(Math.round(amount * 100)) * (USDT_ATOMS / 100n)) as UsdtAtoms;

export interface LoadInput {
  bond: UsdtAtoms;
  /** Seconds until these notes expire. */
  lifetime?: bigint;
  notes: readonly UsdtAtoms[];
}

export type SettleResult =
  | { kind: "already"; noteId: NoteId; txHash?: Hex }
  | { kind: "failed"; noteId: NoteId; reason: string }
  /** Paid from escrow. `paid` is what arrived, after any relay fee. */
  | { kind: "paid"; noteId: NoteId; paid: bigint; txHash: Hex }
  /** Paid from the cheater's bond, possibly short of the note's face. */
  | { kind: "covered"; noteId: NoteId; paid: bigint; txHash: Hex };

export interface WalletOptions {
  device?: DeviceKey;
  now?: () => bigint;
  reads: PublicClient;
  /** A URL, or a lookup, so a relayer can move without a new app build. */
  relayer?: string | (() => Promise<string | undefined>);
  store?: WalletStore;
  /** Where direct submissions go. Defaults to the public RPC. */
  writes?: Transport;
}

const toPublicKey = (raw: Bytes): PublicKey => ({
  x: bytesToHex(raw.slice(0, 32)) as Hex32,
  y: bytesToHex(raw.slice(32, 64)) as Hex32,
});

const randomHex = <T extends Hex>(length: number): T =>
  bytesToHex(crypto.getRandomValues(new Uint8Array(length))) as T;

const splitSignature = (signature: Hex) => ({
  r: slice(signature, 0, 32),
  s: slice(signature, 32, 64),
});

const openFunding = async (store: WalletStore) => {
  const stored = await store.read("fundingKey");
  if (stored) {
    return privateKeyToAccount(stored);
  }
  const created = generatePrivateKey();
  await store.write("fundingKey", created);
  return privateKeyToAccount(created);
};

export const openWallet = async (options: WalletOptions) => {
  const { reads, relayer } = options;
  const store = options.store ?? (await indexedDbStore());
  const device = options.device ?? (await openDeviceKey());
  const now = () =>
    (options.now?.() ?? BigInt(Math.floor(Date.now() / 1000))) as UnixSeconds;
  const funding = await openFunding(store);
  const self = toPublicKey(device.publicKey);
  const dom = domain(CHAIN_ID, VAULT as HundiAddress);
  const tag = domainTag(dom);
  const writes =
    options.writes ?? http(whitechainSepolia.rpcUrls.default.http[0]);

  const settings = async (): Promise<Settings> =>
    (await store.read("settings")) ?? DEFAULT_SETTINGS;

  const updateSettings = async (change: Partial<Settings>): Promise<void> => {
    await store.write("settings", { ...(await settings()), ...change });
  };

  const snapshot = async (): Promise<Snapshot> =>
    (await store.read("snapshot")) ?? emptySnapshot();

  const relayerUrl = async () =>
    typeof relayer === "function" ? relayer() : relayer;

  const route = async (): Promise<{ fee: UsdtAtoms; submit: Submit }> => {
    const { submitDirectly } = await settings();
    const url = submitDirectly ? undefined : await relayerUrl();
    return url
      ? { fee: RELAY_FEE, submit: relayerSubmit(url) }
      : { fee: NO_FEE, submit: directSubmit(funding, writes) };
  };

  const payout = async (): Promise<Address> =>
    (await settings()).payTo ?? funding.address;

  const signRaw = async (message: Uint8Array) =>
    splitSignature(bytesToHex(await device.sign(message as Bytes)));

  let confirmedBlock = 0n;

  const confirmed = async (hash: Hex) => {
    const receipt = await reads.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error("Transaction reverted");
    }
    confirmedBlock = receipt.blockNumber;
    return receipt;
  };

  const sync = async (): Promise<Snapshot> => {
    const from = ((await store.read("syncedBlock")) ?? DEPLOY_BLOCK - 1n) + 1n;
    // The RPC head can trail a transaction this device just saw confirmed.
    const head = await reads.getBlockNumber({ cacheTime: 0 });
    const to = head > confirmedBlock ? head : confirmedBlock;
    const events = await readEvents(reads, from, to);
    const next = applyEvents(await snapshot(), events, now());
    await store.write("snapshot", next);
    await store.write("syncedBlock", to);
    const posted = next.bonds.get(keyId(self))?.amount ?? 0n;
    if (posted > ((await store.read("depositPeak")) ?? 0n)) {
      await store.write("depositPeak", posted);
    }
    return next;
  };

  const lockFor = async (latestExpiry: bigint): Promise<UnixSeconds> => {
    const [, current] = await reads.readContract({
      abi: vaultAbi,
      address: VAULT,
      args: [keyId(self)],
      functionName: "bonds",
    });
    const wanted =
      latestExpiry === 0n
        ? now() + 2n * DEFAULT_LIFETIME + GRACE
        : latestExpiry + GRACE;
    return (wanted > current ? wanted : BigInt(current)) as UnixSeconds;
  };

  const authorize = async (args: LoadArgsFor, value: bigint) => {
    const validBefore = now() + AUTHORIZATION_SECONDS;
    const signature = await funding.signTypedData({
      domain: USDT_DOMAIN,
      message: {
        from: funding.address,
        nonce: loadNonce(args, VAULT, CHAIN_ID),
        to: VAULT,
        validAfter: 0n,
        validBefore,
        value,
      },
      primaryType: "ReceiveWithAuthorization",
      types: RECEIVE_WITH_AUTHORIZATION_TYPES,
    });
    const { r, s, v, yParity } = parseSignature(signature);
    return {
      from: funding.address,
      r,
      s,
      v: Number(v ?? BigInt(yParity + 27)),
      validAfter: 0n,
      validBefore,
    };
  };

  const load = async (input: LoadInput): Promise<Hex> => {
    const expiry = (now() +
      (input.lifetime ?? DEFAULT_LIFETIME)) as UnixSeconds;
    const { fee, submit } = await route();
    const minted = input.notes.map((face) => ({
      expiry,
      face,
      serial: randomHex<Bytes16>(SERIAL_BYTES),
    }));
    const args: LoadArgsFor = {
      bond: input.bond,
      fee,
      lockedUntil: await lockFor(minted.length > 0 ? expiry : 0n),
      notes: minted,
      x: self.x,
      y: self.y,
    };
    const value =
      input.bond + fee + input.notes.reduce((sum, face) => sum + face, 0n);
    const permit = await authorize(args, value);
    await reads.simulateContract({
      abi: vaultAbi,
      account: funding.address,
      address: VAULT,
      args: [args, permit],
      functionName: "load",
    });

    // Saved first, so a lost reply cannot strand a note the chain already minted.
    const notes = minted.map((n) => ({
      header: { ...n, owner: self },
      hops: [],
    }));
    const ids = notes.map((note) => noteId(dom, note.header));
    await Promise.all(
      notes.map((note, index) =>
        store.putNote(ids[index] as NoteId, { kind: "held", note })
      )
    );
    try {
      const hash = await submit(
        encodeFunctionData({
          abi: vaultAbi,
          args: [args, permit],
          functionName: "load",
        })
      );
      await confirmed(hash);
      await sync();
      return hash;
    } catch (error) {
      await Promise.all(ids.map((id) => store.removeNote(id)));
      throw error;
    }
  };

  const request = (amount: UsdtAtoms): PayRequest => ({
    amount,
    domainTag: tag,
    payee: self,
    requestId: randomHex<Bytes8>(REQUEST_ID_BYTES),
  });

  const signHop = async (note: Note, to: PublicKey): Promise<Hop> => {
    const message = hopMessage(walk(dom, note).tail, to);
    return {
      sig: bytesToHex(await device.sign(message as Bytes)) as Bytes64,
      to,
    };
  };

  const pay = async (target: PayRequest): Promise<Payment> => {
    if (target.domainTag !== tag) {
      throw new Error("This request is for another network");
    }
    const records = await store.notes();
    const { guard } = await settings();
    const chosen = choosePayment(records, target, guard);
    if (
      !chosen ||
      chosen.state.kind === "settled" ||
      chosen.state.kind === "lost"
    ) {
      throw new Error("No note can pay this amount");
    }
    const { requestId } = target;
    const { note } = chosen.state;
    if (
      chosen.state.kind === "offered" &&
      chosen.state.requestId === requestId
    ) {
      const { header, hops } = appendHop(note, chosen.state.hop);
      return { header, hops, requestId };
    }
    const hop = await signHop(note, target.payee);
    // Marked before the QR shows, so a crash cannot lead to a second hop.
    await store.putNote(chosen.id, offered(note, hop, target));
    const { header, hops } = appendHop(note, hop);
    return { header, hops, requestId };
  };

  const receive = async (
    payment: Payment,
    target: PayRequest
  ): Promise<Verdict> => {
    const records = await store.notes();
    const verdict = accept(payment, target, await snapshot(), now(), {
      domain: dom,
      grace: GRACE,
      seen: new Set(records.map(({ id }) => id)),
    });
    if (verdict.ok) {
      const { header, hops } = payment;
      const note = { header, hops };
      await store.putNote(walk(dom, note).id, { kind: "held", note });
    }
    return verdict;
  };

  const settleArgs = async (note: Note, payTo: Address, fee: UsdtAtoms) => {
    const { header, hops } = note;
    const { tail } = walk(dom, note);
    const message = settleMessage(tail, payTo as HundiAddress, fee);
    return [
      {
        expiry: header.expiry,
        face: header.face,
        serial: header.serial,
        x: header.owner.x,
        y: header.owner.y,
      },
      hops.map((hop) => ({
        ...splitSignature(hop.sig),
        x: hop.to.x,
        y: hop.to.y,
      })),
      { fee, payTo, ...(await signRaw(message)) },
    ] as const;
  };

  const settleOne = async (
    id: NoteId,
    note: Note,
    payTo: Address
  ): Promise<SettleResult> => {
    const spent = await reads.readContract({
      abi: vaultAbi,
      address: VAULT,
      args: [walk(dom, note).tail],
      functionName: "spentBy",
    });
    if (spent !== ZERO_SLOT) {
      const block = await reads.getBlockNumber();
      const txHash = await findSettlement(reads, id, payTo, block);
      await store.putNote(id, {
        kind: "settled",
        txHash: (txHash ?? ZERO_SLOT) as Hex32,
      });
      return txHash
        ? { kind: "already", noteId: id, txHash }
        : { kind: "already", noteId: id };
    }

    const { fee, submit } = await route();
    const args = await settleArgs(note, payTo, fee);
    await reads.simulateContract({
      abi: vaultAbi,
      account: funding.address,
      address: VAULT,
      args,
      functionName: "settle",
    });
    const txHash = await submit(
      encodeFunctionData({ abi: vaultAbi, args, functionName: "settle" })
    );
    const log = settledIn(await confirmed(txHash));
    const paid = log?.paid ?? 0n;
    const honest = log?.liable === ZERO_SLOT;
    await store.putNote(id, {
      kind: paid === note.header.face ? "settled" : "lost",
      txHash: txHash as Hex32,
    });
    const received = paid > fee ? paid - fee : 0n;
    const kind = honest ? "paid" : "covered";
    const receipt = { kind, noteId: id, paid: received, txHash } as const;
    const earlier = (await store.read("receipts")) ?? [];
    await store.write("receipts", [...earlier, { ...receipt, at: now() }]);
    return receipt;
  };

  /** Redeems every note this device received. Safe to run as often as you like. */
  const settle = async (): Promise<SettleResult[]> => {
    const payTo = await payout();
    const held = (await store.notes()).filter(
      (
        record
      ): record is NoteRecord & { state: { kind: "held"; note: Note } } =>
        record.state.kind === "held" && record.state.note.hops.length > 0
    );
    const results: SettleResult[] = [];
    for (const { id, state } of held) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: direct sends share one account nonce, so they run in turn.
        results.push(await settleOne(id, state.note, payTo));
      } catch (error) {
        results.push({
          kind: "failed",
          noteId: id,
          reason: revertReason(error),
        });
      }
    }
    await sync();
    return results;
  };

  /** The signed call that settles a note, for inspecting a relayer's rules. */
  const settleCalldata = async (note: Note, fee: bigint): Promise<Hex> =>
    encodeFunctionData({
      abi: vaultAbi,
      args: await settleArgs(note, await payout(), fee as UsdtAtoms),
      functionName: "settle",
    });

  /** The safety deposit this key has posted, as of the last sync. */
  const deposit = async (): Promise<bigint> =>
    (await snapshot()).bonds.get(keyId(self))?.amount ?? 0n;

  /** What was taken from the deposit for spending a note twice. Only slashing lowers it before its lock ends. */
  const depositLost = async (): Promise<bigint> => {
    const peak = (await store.read("depositPeak")) ?? 0n;
    const current = await deposit();
    return peak > current ? peak - current : 0n;
  };

  /** USDT waiting on the funding key, ready to load. Needs a network. */
  const funds = (): Promise<bigint> =>
    reads.readContract({
      abi: erc20Abi,
      address: USDT,
      args: [funding.address],
      functionName: "balanceOf",
    });

  const receipts = async (): Promise<readonly Receipt[]> =>
    (await store.read("receipts")) ?? [];

  return {
    address: funding.address,
    deposit,
    depositLost,
    funds,
    key: self,
    load,
    notes: () => store.notes(),
    pay,
    payout,
    receipts,
    receive,
    request,
    settings,
    settle,
    settleCalldata,
    snapshot,
    sync,
    updateSettings,
  };
};

type LoadArgsFor = Parameters<typeof loadNonce>[0];

export type Wallet = Awaited<ReturnType<typeof openWallet>>;
