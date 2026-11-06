import { describe, expect, test } from "bun:test";
import { p256 } from "@noble/curves/nist.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { domain, hopMessage, keyId, linkOf, noteId, slotOf } from "./bytes";
import { accept } from "./rule";
import { applyEvents, emptySnapshot } from "./snapshot";
import type {
  Address,
  Bytes8,
  Bytes16,
  Bytes64,
  Header,
  Hex,
  Hex32,
  Hop,
  NoteId,
  Payment,
  PayRequest,
  PublicKey,
  RejectReason,
  Slot,
  UnixSeconds,
  UsdtAtoms,
  Verdict,
} from "./types";

const hex = (bytes: Uint8Array): Hex => `0x${bytesToHex(bytes)}`;

const person = (seed: string) => {
  const secret = hexToBytes(seed.repeat(32));
  const raw = p256.getPublicKey(secret, false);
  const key: PublicKey = {
    x: hex(raw.slice(1, 33)) as Hex32,
    y: hex(raw.slice(33, 65)) as Hex32,
  };
  const hopTo = (slot: Slot, to: PublicKey): Hop => ({
    sig: hex(
      p256.sign(hopMessage(slot, to), secret, { lowS: false })
    ) as Bytes64,
    to,
  });
  return { hopTo, key };
};

const customer = person("11");
const stall = person("22");
const supplier = person("33");
const stranger = person("44");

const DOMAIN = domain(1874n, `0x${"11".repeat(20)}` as Address);
const GRACE = 3600n;
const NOW = 1_800_000_000n as UnixSeconds;
const FACE = 5_000_000n as UsdtAtoms;
const EXPIRY = (NOW + 86_400n) as UnixSeconds;
const LOCK = (EXPIRY + GRACE) as UnixSeconds;
const REQUEST_ID = "0x0102030405060708" as Bytes8;

const header: Header = {
  expiry: EXPIRY,
  face: FACE,
  owner: customer.key,
  serial: "0x000102030405060708090a0b0c0d0e0f" as Bytes16,
};
const id = noteId(DOMAIN, header);

const bonded = (
  bonds: [PublicKey, bigint, bigint][],
  settled = false,
  loaded = true
) =>
  applyEvents(
    emptySnapshot(),
    [
      ...(loaded
        ? [
            {
              expiry: EXPIRY,
              face: FACE,
              kind: "NoteLoaded" as const,
              noteId: id,
            },
          ]
        : []),
      ...bonds.map(([key, amount, lockedUntil]) => ({
        amount: amount as UsdtAtoms,
        keyId: keyId(key),
        kind: "BondChanged" as const,
        lockedUntil: lockedUntil as UnixSeconds,
      })),
      ...(settled ? [{ kind: "Settled" as const, noteId: id }] : []),
    ],
    NOW
  );

const snapshot = bonded([
  [customer.key, 2n * FACE, LOCK],
  [stall.key, 2n * FACE, LOCK],
]);

const request: PayRequest = {
  amount: FACE,
  domainTag: "0x0000000000000000" as Bytes8,
  payee: stall.key,
  requestId: REQUEST_ID,
};

const firstHop = customer.hopTo(slotOf(id), stall.key);
const payment: Payment = {
  header,
  hops: [firstHop],
  requestId: REQUEST_ID,
};

const context = { domain: DOMAIN, grace: GRACE, seen: new Set<NoteId>() };

const run = (
  overrides: {
    now?: bigint;
    payment?: Payment;
    request?: PayRequest;
    seen?: Set<NoteId>;
    snapshot?: typeof snapshot;
  } = {}
) =>
  accept(
    overrides.payment ?? payment,
    overrides.request ?? request,
    overrides.snapshot ?? snapshot,
    (overrides.now ?? NOW) as UnixSeconds,
    overrides.seen ? { ...context, seen: overrides.seen } : context
  );

const refused = (reason: RejectReason): Verdict => ({ ok: false, reason });

describe("accept", () => {
  test("takes a valid one-hop payment with no network", () => {
    expect(run()).toEqual({ amount: FACE, ok: true });
  });

  test("takes a valid two-hop payment", () => {
    const link = linkOf(hopMessage(slotOf(id), stall.key));
    const hops = [firstHop, stall.hopTo(slotOf(link), supplier.key)];
    expect(
      run({
        payment: { ...payment, hops },
        request: { ...request, payee: supplier.key },
      })
    ).toEqual({ amount: FACE, ok: true });
  });

  test("a printed QR with no amount takes any face value", () => {
    expect(run({ request: { ...request, amount: 0n as UsdtAtoms } })).toEqual({
      amount: FACE,
      ok: true,
    });
  });

  test("wrong_amount: a different amount or another request", () => {
    expect(
      run({ request: { ...request, amount: (FACE + 1n) as UsdtAtoms } })
    ).toEqual(refused("wrong_amount"));
    expect(
      run({
        payment: { ...payment, requestId: "0x0000000000000009" as Bytes8 },
      })
    ).toEqual(refused("wrong_amount"));
  });

  test("too_long: more hops than MAX_HOPS", () => {
    const hops = [firstHop, firstHop, firstHop, firstHop, firstHop];
    expect(run({ payment: { ...payment, hops } })).toEqual(refused("too_long"));
  });

  test("unknown_note: minted after the last sync, or with another face", () => {
    expect(
      run({ snapshot: bonded([[customer.key, 2n * FACE, LOCK]], false, false) })
    ).toEqual(refused("unknown_note"));
    const inflated = applyEvents(
      snapshot,
      [
        {
          expiry: EXPIRY,
          face: (FACE + 1n) as UsdtAtoms,
          kind: "NoteLoaded",
          noteId: id,
        },
      ],
      NOW
    );
    expect(run({ snapshot: inflated })).toEqual(refused("unknown_note"));
  });

  test("spent: the snapshot shows it settled", () => {
    expect(
      run({ snapshot: bonded([[customer.key, 2n * FACE, LOCK]], true) })
    ).toEqual(refused("spent"));
  });

  test("expiring: within MARGIN of expiry, and at exactly the margin", () => {
    expect(run({ now: EXPIRY })).toEqual(refused("expiring"));
    expect(run({ now: EXPIRY - 300n })).toEqual(refused("expiring"));
    expect(run({ now: EXPIRY - 301n }).ok).toBe(true);
  });

  test("seen_before: this device already held the note", () => {
    expect(run({ seen: new Set([id]) })).toEqual(refused("seen_before"));
  });

  test("bad_signature: forged, missing, or not naming us", () => {
    const forged = stranger.hopTo(slotOf(id), stall.key);
    expect(run({ payment: { ...payment, hops: [forged] } })).toEqual(
      refused("bad_signature")
    );
    expect(run({ payment: { ...payment, hops: [] } })).toEqual(
      refused("bad_signature")
    );
    expect(run({ request: { ...request, payee: supplier.key } })).toEqual(
      refused("bad_signature")
    );
  });

  test("bad_signature: malformed signature bytes do not throw", () => {
    const sig = `0x${"00".repeat(64)}` as Bytes64;
    expect(
      run({ payment: { ...payment, hops: [{ ...firstHop, sig }] } })
    ).toEqual(refused("bad_signature"));
  });

  test("bad_chain: a key appears twice", () => {
    const toSelf = customer.hopTo(slotOf(id), customer.key);
    const link = linkOf(hopMessage(slotOf(id), customer.key));
    const back = customer.hopTo(slotOf(link), stall.key);
    expect(run({ payment: { ...payment, hops: [toSelf, back] } })).toEqual(
      refused("bad_chain")
    );
  });

  test("uncovered: a signer has no bond or too small a bond", () => {
    expect(run({ snapshot: bonded([]) })).toEqual(refused("uncovered"));
    expect(
      run({ snapshot: bonded([[customer.key, 2n * FACE - 1n, LOCK]]) })
    ).toEqual(refused("uncovered"));
  });

  test("uncovered: every signer is checked, not just the first", () => {
    const link = linkOf(hopMessage(slotOf(id), stall.key));
    const hops = [firstHop, stall.hopTo(slotOf(link), supplier.key)];
    expect(
      run({
        payment: { ...payment, hops },
        request: { ...request, payee: supplier.key },
        snapshot: bonded([[customer.key, 2n * FACE, LOCK]]),
      })
    ).toEqual(refused("uncovered"));
  });

  test("uncovered: a bond that unlocks before expiry plus GRACE", () => {
    expect(
      run({ snapshot: bonded([[customer.key, 2n * FACE, LOCK - 1n]]) })
    ).toEqual(refused("uncovered"));
  });

  test("a receiver who only receives needs no bond", () => {
    expect(
      run({ snapshot: bonded([[customer.key, 2n * FACE, LOCK]]) }).ok
    ).toBe(true);
  });

  test("the first failing step decides the reason", () => {
    expect(
      run({
        payment: { ...payment, hops: [] },
        seen: new Set([id]),
        snapshot: bonded([[customer.key, 2n * FACE, LOCK]], true),
      })
    ).toEqual(refused("spent"));
  });
});

describe("applyEvents", () => {
  test("a slashed bond falls to its new amount, and folding is pure", () => {
    const before = bonded([[customer.key, 4n * FACE, LOCK]]);
    const after = applyEvents(
      before,
      [
        {
          amount: (2n * FACE) as UsdtAtoms,
          keyId: keyId(customer.key),
          kind: "BondChanged",
          lockedUntil: LOCK,
        },
      ],
      NOW
    );
    expect(after.bonds.get(keyId(customer.key))?.amount as bigint).toBe(
      2n * FACE
    );
    expect(before.bonds.get(keyId(customer.key))?.amount as bigint).toBe(
      4n * FACE
    );
  });
});
