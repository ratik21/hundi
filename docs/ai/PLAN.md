# Hundi plan

Hundi lets a phone in airplane mode pay in USDT, lets the receiver spend that same money onward while still offline, and makes a double-spender lose money on-chain. It is for people whose money is digital when the network goes down. It enters ETHGlobal Mumbai from scratch, with Whitechain and the Ethereum Foundation as partner picks.

The rule the design enforces is one signature per slot. Each holder of a note may sign exactly one message at their place in the note's history. Two different messages at one slot prove a cheat.

The build runs as units U0 to U9, in order, from repo setup through submission. U3 runs beside U1 and U2.

Submissions close Sat 7 Nov at 09:00 IST. Judging starts at 09:30 IST.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. Check a box only when its evidence exists, such as a file, a test run, a transaction hash, a photo or a commit. The body is a how-to. The appendices explain and record.

Tests alone are not enough. A unit is done only when its **You see** result happens on the real chain or the real phones.

`CONVENTIONS.md` holds the stack, config files and traps. Follow it, and read it before U0.

## Keep to this schedule

Times are IST. This schedule assumes work starts at 13:45 on Fri 6 Nov. Re-checked at 13:39 on resume: 19h21m left, so no times moved. Commit and push at the end of every unit, because ETHGlobal can disqualify large single commits.

| Time | Unit | Done when |
| --- | --- | --- |
| 13:45 to 14:15 | U0 | CI is green on a new public repo |
| 14:15 to 15:00 | U1 | `bun test` and `forge test` agree on every hash |
| 14:15 to 16:00 | U3, in parallel | A note moves between two real phones in airplane mode |
| 15:00 to 17:00 | U2 | Explorer shows real USDT moved by a P-256 signed note |
| 17:30 | **Go or no-go** | See below |
| 17:30 to 19:30 | U4 | Wallet runs the full story in tests |
| 18:00 | Dinner | Show the pitch to the Whitechain and EF booths |
| 19:30 to 22:00 | U5 | Full story works in the app on phones |
| 22:00 to 23:00 | U6 | Live URL and relayer work |
| 23:00 to 00:00 | U7 | Chai shop app accepts Hundi in about 20 lines |
| 00:00 to 04:00 | Sleep | Agents draft docs only. No contract changes |
| 04:00 to 05:30 | U8, rehearse | Cold demo runs under 3 minutes |
| 05:30 to 07:00 | U9 video | Upload accepted |
| 07:00 to 08:00 | U9 submit | Form complete, every link tested |
| 08:00 to 09:00 | Buffer | No code |

**Go or no-go at 17:30.** If U2 or U3 is still red, stop and decide. If U3 fails only on one phone, continue with the phone that works plus the laptop. If U2 fails on real USDT, ask at the Whitechain booth, then fall back to Octroi from the earlier decision only if no fix is in sight by 19:00.

## Do these yourself first

Only you can do these. Do them while agents start U0.

- [ ] Rename the ETHGlobal project from Cleared to Hundi, and update its description. Evidence is the project page.
- [ ] Get three devices. You need two phones and the laptop. Borrow a phone today if you have one. Evidence is both phones opening a test URL.
- [ ] Write `DECISIONS.md` in your own words. Cover why notes are minted, why bonds exist, why claims burn, and what Hundi cannot prevent. ETHGlobal may refuse a project that relies entirely on AI, and judges will ask what you decided. Evidence is your commit.
- [ ] Read `HundiVault.sol` line by line after U2, and explain each function aloud. Evidence is a rehearsal with no notes.

## Create the repo (U0)

**Depends on.** Nothing.

**Files.**

- [x] Create the new public repo `ratik21/hundi` from this folder, with an open-source license. Use MIT.
- [x] Create `package.json` with Bun workspaces for `packages/*` and `apps/*`.
- [x] Create `biome.jsonc`, `lefthook.yml`, `tsconfig.json`, `.gitignore`, `.github/workflows/ci.yml` and `contracts/foundry.toml` from `CONVENTIONS.md`.
- [x] Create `.env.example` with names only. Keep `.env` out of git.
- [ ] Create `docs/ai/` for prompts, specs and plans, and copy this plan and `DECISIONS.md` into the repo. Plan copied. `DECISIONS.md` is yours to write.

**Build.**

- [x] Remove the old variables from `.env`. Keep `RELAYER_PRIVATE_KEY`, `RELAYER_ADDRESS`, `CLIENT_DEMO_PRIVATE_KEY`, `CLIENT_DEMO_ADDRESS`, `RPC_1874`, `RPC_1874_BACKUP`, `USDT_ADDRESS` and `EXPLORER_API`.
- [x] Add a placeholder test in each package so CI runs real commands.

**You see.**

- [x] The first GitHub Actions run passes both the `app` and `contracts` jobs. Evidence is the run URL.

## Fix the shared bytes (U1)

Every other unit depends on TypeScript and Solidity computing identical hashes, so this comes first.

**Depends on.** U0.

**Files.**

- [x] Create `packages/core/src/types.ts` with the branded types in Appendix B.
- [x] Create `packages/core/src/bytes.ts` with `domain`, `noteId`, `hopMessage`, `settleMessage`, `withdrawMessage`, `encodePayment`, `decodePayment`, `encodeRequest` and `decodeRequest`.
- [x] Create `vectors/golden.json`, generated by `scripts/gen-vectors.ts` from a fixed P-256 key.
- [x] Create `contracts/src/HundiBytes.sol` with the same hashing as an internal library.
- [x] Create `contracts/test/Vectors.t.sol`.

**Build.**

- [x] Implement the layouts in Appendix B exactly. Hash with SHA-256 everywhere.
- [x] Never pass a signature into a hash function. Signatures are malleable, as Appendix A records.

**You see.**

- [x] `bun test packages/core` and `forge test --match-contract Vectors` both pass on the same `golden.json`. Evidence is both outputs.

**Verify.**

- [x] Change one byte in a vector and confirm both suites fail. Evidence is the failing output, then a revert.

## Build the contract and settle real USDT (U2)

This is the highest risk on the chain side. No real USDT has moved yet.

**Depends on.** U1.

**Files.**

- [x] Create `contracts/src/HundiVault.sol` and `contracts/src/P256.sol` from Appendix B.
- [x] Create `contracts/test/HundiVault.t.sol`, running on a Whitechain fork against the real USDT.
- [x] Create `contracts/script/Deploy.s.sol`, and record the result in `deployments/1874.json`.
- [x] Create `scripts/swap-usdt.ts` and `scripts/settle-once.ts`.

**Build.**

- [x] Implement `load`, `settle`, `reclaim` and `withdrawBond`.
- [x] Make `P256.verify` require a successful call, 32 bytes of return data and the value 1. Empty return data means failure.
- [x] Write state before every USDT transfer. Use the safe-transfer wrapper from `CONVENTIONS.md`.

**Verify, with fork tests in `HundiVault.t.sol`.** Each case below is one test. Run `~/.local/bin/mb-heavy forge test`.

- [x] A one-hop note settles and pays `payTo`.
- [x] A carrier cannot change `payTo` or `fee`.
- [x] A fork pays the loser, burns the same amount, and takes double from the forker's bond.
- [x] A redeem followed by a hand-on makes the redeemer liable.
- [x] A nested fork makes the deepest forker liable, and nobody upstream pays twice.
- [x] A sock-puppet claim race leaves the cheater with a net gain of zero or less when the bond is twice the note.
- [x] A claim cannot run twice for one tail.
- [x] A holder who already handed a note on cannot settle it, and the next holder is never charged for that attempt.
- [x] A claim against an empty bond reverts and leaves the victim's tail unspent.
- [x] `load` refuses a bond below twice its notes' face value, and a `lockedUntil` earlier than the latest `expiry + GRACE`.
- [x] A stranger cannot add to another key's bond or extend its lock.
- [x] A flipped `s` value neither creates a conflict nor bypasses the slot rule.
- [x] A note on another deployment fails.
- [x] `reclaim` works only after `expiry + GRACE`, and only for an unsettled note.
- [x] `withdrawBond` works only after `lockedUntil`.
- [x] After every test, the vault's USDT balance equals unsettled face value plus all bonds plus `burned`.

**Run it on the real chain.**

- [x] Swap 1 WBT for USDT through router `0xe208cc685cd95d56e8ec6dec9816476567fc6962`. Expect about 70 USDT, which covers the demo's notes and bonds and leaves about 1 WBT for gas. Evidence is the transaction hash.
- [x] Deploy and verify `HundiVault`. Evidence is the verified explorer page.
- [x] Run `scripts/settle-once.ts`, which loads one 5 USDT note, signs one hop with a real P-256 key, and settles it.

**You see.**

- [x] Explorer shows a USDT transfer out of the vault to the `payTo` address. Put the link in `README.md`.

## Prove offline transfer on real phones (U3)

This is the highest risk on the device side. Run it in parallel, on throwaway payloads. It needs no contract.

**Depends on.** U0.

**Files.**

- [ ] Create `apps/pwa/` with Vite, React and `vite-plugin-pwa`.
- [ ] Create `packages/wallet/src/qr.ts` using `qrcode` to draw and `jsqr` to read. Do not use `BarcodeDetector`, because iOS Safari lacks it.
- [ ] Create `packages/wallet/src/keystore.ts` with a non-extractable WebCrypto P-256 key stored in IndexedDB.

**Build.**

- [ ] Deploy the shell to a public HTTPS URL now. The camera and service worker both need a secure origin.
- [ ] Add a test page that signs 618 random bytes and shows them as a QR, and a scanner that verifies the signature.

**You see.**

- [ ] Both phones load the app, go into airplane mode, close and reopen it, and it still runs. Evidence is a photo of each.
- [ ] A 618-byte QR, the size of a four-hop payment, scans phone to phone within 5 seconds. Evidence is a short video.
- [ ] The signature verifies on the receiving phone with no network. Evidence is the on-screen result.

If 618 bytes fails to scan, lower `MAX_HOPS` to 2, which gives 362 bytes. The demo needs only 2 hops.

## Build the wallet (U4)

**Depends on.** U1, U2, U3.

**Files.**

- [x] Create `packages/core/src/chain.ts` with `walk` and `appendHop`.
- [x] Create `packages/core/src/rule.ts` with the pure `accept` function from Appendix B.
- [x] Create `packages/core/src/snapshot.ts` with a pure reducer over contract events.
- [x] Create `packages/wallet/src/store.ts` with the note state machine in IndexedDB.
- [x] Create `packages/wallet/src/chain-io.ts` for reads, simulation and submission.
- [x] Create `packages/wallet/src/wallet.ts` as the only public entry point.

**Build.**

- [x] Implement `load`, `sync`, `request`, `pay`, `receive` and `settle`.
- [x] Mark a note `offered` before showing its QR. An offered note can only re-show the same hop.
- [x] Make `settle` idempotent. It reads the chain first, and reports `already` for finished work.
- [x] Test `eth_getLogs` through Anon-RPC now, before building on it. Evidence is a saved log. If it fails, follow the fallback in U8. Failed on 6 Nov: the gateway did not answer. See `docs/ai/evidence/anon-rpc-getlogs.md`.
- [x] Generate a secp256k1 funding key in the app for EIP-3009 and as the default payout address. Sign the USDT authorization with `USDT_DOMAIN`.

**Verify.**

- [x] `packages/core/src/rule.test.ts` covers every rejection reason in Appendix B.
- [x] `packages/wallet/src/story.test.ts` runs the whole demo against a local fork. Run `~/.local/bin/mb-heavy bun test packages/wallet/src/story.test.ts`.

**You see.**

- [x] The story test ends with the honest note settled, the forked note settled, and the victim paid from the bond.

## Build the app (U5)

**Depends on.** U4.

**Files.**

- [x] Create the screens **Home**, **Add money**, **Pay**, **Receive** and **Settings** in `apps/pwa/src/`.

**Build.**

- [x] **Home** shows the balance, held notes, and a clear online or offline badge.
- [x] **Pay** scans the payee's QR, confirms the amount, and shows the payment QR.
- [x] **Receive** shows the request QR, scans the payment, and shows a large green or red verdict with the reason.
- [x] **Settings** shows the payout address, a **Submit directly** switch, and the visible toggle **Demo: disable double-spend guard**.
- [x] Hide all crypto language from the main flow. Show "5 USDT", "Paid", "Covered". No gas, hashes or chain names.
- [x] After settlement, show a link to the explorer.

**You see.**

- [ ] The full demo in Appendix F works on the real devices with airplane mode on. Evidence is a recording.

**Review gate.**

- [ ] Run the demo yourself once, end to end, before U6. If any step feels slow or confusing, fix that step before adding anything else.

## Host it and add the relayer (U6)

ETHGlobal removes a project with no live deployment from finalist judging.

**Depends on.** U5.

**Files.**

- [x] Create `apps/relayer/src/index.ts` as a small Bun server with one route, `POST /submit`.

**Build.**

- [x] Accept only calls to `HundiVault`. Run `eth_call` first, and send nothing that fails.
- [x] Read the expected payout from the simulation, and require `min(fee, paid)` at or above the estimated gas cost.
- [x] Rate-limit per IP.
- [x] Deploy the relayer on Railway, or on the laptop through a tunnel if Railway fails. Runs on the laptop through a tunnel, with `bun run relayer`.
- [x] Publish the PWA at a stable HTTPS URL with no analytics.

**You see.**

- [x] A device with no WBT settles through the relayer. Evidence is [0x6724...ac66](https://explorer.testnet.whitechain.io/tx/0x6724decba19824a653c94e8557e3d106fcc4fdf94f18ed9667825cb0c257ac66).
- [x] With the relayer stopped, the app settles directly through **Submit directly**. Evidence is [0xaee9...bca8](https://explorer.testnet.whitechain.io/tx/0xaee94522ed28b70cb12c74c9e83c9bb1fac84a3bcd83fa2c63b28ebccfbcbca8).

## Build the drop-in widget (U7)

This is what the Whitechain Operate track asks for.

**Depends on.** U5.

**Files.**

- [x] Create `packages/wallet/src/widget.ts` exporting `mountHundi` and `registerHundiWorker`.
- [x] Create `apps/shop/`, a separate small chai shop app.

**Build.**

- [x] Integrate the widget in `apps/shop` in about 20 lines. Show the merchant view and the customer view.
- [x] Add a settlement CSV export for the accountant, which Operate gives extra credit for.

**You see.**

- [x] `apps/shop` takes a payment offline. Evidence is `docs/ai/evidence/shop-paid-offline.png`, plus the line count of the integration, 21 lines in `apps/shop/src/main.ts`. Tested in Chrome with a stubbed camera on a local fork. Not yet tested on a phone.

## Route reads through Anon-RPC (U8)

Skip this unit if time runs short. Skipping it loses only the Anon-RPC entry, because CROPS stays eligible.

**Depends on.** U4.

**Build.**

- [ ] Reuse the worker from `CONVENTIONS.md` for every read in `chain-io.ts`, as the default.
- [ ] Test `eth_getLogs` through it. If it fails, publish a static `snapshot.json` that anyone can rebuild from public logs, and read that through the worker.
- [ ] Show which path each read took in **Settings**.

**You see.**

- [ ] `sync` works through Anon-RPC. Evidence is a log of the read counters.

## Submit (U9)

**Depends on.** All units you did not cut.

- [ ] Complete every item in Appendix G. Evidence is each file and link.
- [ ] Record the video from Appendix F at 2:30 to 2:55. It must stay under the 3-minute CROPS limit and above the 2-minute ETHGlobal minimum.
- [ ] Choose **Finalist and Partner Prizes**, and pick Whitechain and the Ethereum Foundation.
- [ ] Open the live URL on a phone that has never loaded it. Evidence is a screenshot.
- [ ] Rehearse Appendix E's answers aloud. The live session is 4 minutes of demo and 3 minutes of questions.

## Cut in this order if you fall behind

1. Sound transfer, which is not in the plan anyway.
2. Passkeys. Use plain WebCrypto keys.
3. U8, Anon-RPC.
4. CSV export.
5. `reclaim` and `withdrawBond` UI. Keep them in the contract.
6. U7. This loses the Operate track only.

Never cut U2's real settlement, the second offline hop, the fork claim, or the live URL.

## Appendix A. Prototype evidence

These results come from live runs on 6 Nov 2026.

| Question | Result |
| --- | --- |
| Does a browser-style P-256 signature verify on Whitechain? | Yes. A non-extractable WebCrypto key produced a raw 64-byte signature. Precompile `0x100` returned 1 for digest `SHA-256(message)` |
| What does failure return? | Empty bytes, not zero |
| Are signatures malleable? | Yes. Replacing `s` with `n - s` still verified |
| What does a verify cost? | 27,745 gas for a transaction, including the 21,000 base |
| Does the USDT accept EIP-3009? | Yes. Nine fork tests passed against the real USDT |
| Can the relayer get USDT? | Simulated only. 0.05 WBT returned 3.635 USDT through router `0xe208...6962`, pool fee 3000 |
| Is the chain healthy? | Yes. It produced 12 blocks in about 12 seconds |
| Does paying claims in full deter a cheat? | No. A modelled sock-puppet race gives the cheater `(k - 1) * v` at any bond size |
| Does burning fix it? | Yes, within limits. With burn equal to payout and a bond of `2v`, a two-way fork nets zero |

**Proved after this table.** A USDT settlement on the Whitechain testnet, in U2.

**Still unproven.** QR scanning on your phones, `eth_getLogs` through Anon-RPC, and Railway hosting. U3, U8 and U6 prove each of these.

## Appendix B. Design reference

This design is the result of the architecture bakeoff recorded in Appendix C.

### Usage

```ts
const wallet = await openWallet({ reads, relayer: RELAYER_URL });

// Online, before the outage.
await wallet.load({ notes: [usdt(5), usdt(5)], bond: usdt(20) });
await wallet.sync();

// Offline. The merchant shows a request. A printed QR with no amount also works.
const request = wallet.request(usdt(5));

// Offline. The customer scans it and shows a payment.
const payment = await wallet.pay(request);

// Offline. The merchant scans it and gets a verdict with no network.
const verdict = await wallet.receive(payment, request);

// Online, on any device, as often as you like.
const report = await wallet.settle();
```

Drop-in use:

```ts
import { mountHundi, registerHundiWorker } from "@hundi/wallet/widget";

await registerHundiWorker();
mountHundi(document.querySelector("#till"), {
  onVerdict: (verdict) => markOrderPaid(verdict),
  price: "5.00",
  role: "merchant",
});
```

### Core types

```ts
type KeyId = Brand<Hex32, "KeyId">;       // sha256(x || y)
type NoteId = Brand<Hex32, "NoteId">;
type Slot = Brand<Hex32, "Slot">;         // the prev hash a holder signs at
type Link = Brand<Hex32, "Link">;         // sha256 of a signed message
type UsdtAtoms = Brand<bigint, "UsdtAtoms">;

type PublicKey = { x: Hex32; y: Hex32 };
type Header = { serial: Bytes16; face: UsdtAtoms; expiry: UnixSeconds; owner: PublicKey };
type Hop = { to: PublicKey; sig: Bytes64 };   // signed by the previous holder
type Note = { header: Header; hops: readonly Hop[] };

type Snapshot = {
  bonds: ReadonlyMap<KeyId, { amount: UsdtAtoms; lockedUntil: UnixSeconds }>;
  notes: ReadonlyMap<NoteId, { expiry: UnixSeconds; face: UsdtAtoms; settled: boolean }>;
  syncedAt: UnixSeconds;
};

type NoteState =
  | { kind: "held"; note: Note }
  | { kind: "offered"; hop: Hop; note: Note; requestId: Bytes8 }
  | { kind: "settled"; txHash: Hex32 }
  | { kind: "lost"; txHash: Hex32 };

type Verdict =
  | { ok: true; amount: UsdtAtoms }
  | { ok: false; reason: RejectReason };
```

### Signed messages

All integers are big-endian. WebCrypto hashes each message with SHA-256, and that hash is both the digest the precompile checks and the message's identity.

```text
domain = sha256("HUNDI/1" || chainId u64 || vault 20)
noteId = sha256(0x01 || domain || serial 16 || face u64 || expiry u64 || ownerX 32 || ownerY 32)

hop      = 0x02 || slot 32 || toX 32 || toY 32                     97 bytes
settle   = 0x03 || slot 32 || payTo 20 || fee u64                  61 bytes
withdraw = 0x04 || domain 32 || keyId 32 || payTo 20 || lockedUntil u64

link = sha256(message)
The first slot is noteId. Each later slot is the link of the hop before it.
```

The hash chain covers messages and never signatures, so a flipped `s` cannot create a second identity.

### QR formats

```text
Request 0x10 || domain first 8 || payee 64 || amount u64 || requestId 8              89 bytes
Payment 0x11 || requestId 8 || serial 16 || face u64 || expiry u64 || owner 64
        || hop count 1 || hops of (to 64 || sig 64)                          106 + 128n bytes
```

A payment is 234 bytes at one hop, 362 at two, and 618 at four. `MAX_HOPS` is 4. A holder at the limit must settle online.

### Contract

```solidity
struct NoteIn { bytes16 serial; uint64 face; uint64 expiry; }
struct LoadArgs { bytes32 x; bytes32 y; uint128 bond; uint64 lockedUntil; uint64 fee; NoteIn[] notes; }
struct Permit { address from; uint256 validAfter; uint256 validBefore; uint8 v; bytes32 r; bytes32 s; }
struct Header { bytes16 serial; uint64 face; uint64 expiry; bytes32 x; bytes32 y; }
struct Hop { bytes32 x; bytes32 y; bytes32 r; bytes32 s; }
struct Auth { address payTo; uint64 fee; bytes32 r; bytes32 s; }

mapping(bytes32 noteId => Note) notes;          // face, expiry, refundTo, settled
mapping(bytes32 slot => bytes32 link) spentBy;  // the first message recorded at each slot
mapping(bytes32 keyId => Bond) bonds;           // amount, lockedUntil, funder
uint256 burned;                                 // slashed USDT, locked in the vault for good

function load(LoadArgs calldata a, Permit calldata p) external;
function settle(Header calldata h, Hop[] calldata hops, Auth calldata a) external;
function reclaim(bytes32 noteId) external;
function withdrawBond(bytes32 x, bytes32 y, address payTo, bytes32 r, bytes32 s) external;

event NoteLoaded(bytes32 indexed noteId, bytes32 indexed keyId, uint64 face, uint64 expiry);
event BondChanged(bytes32 indexed keyId, uint128 amount, uint64 lockedUntil);
event Settled(bytes32 indexed noteId, address payTo, uint256 paid, bytes32 liable);
```

`load` pulls `sum(face) + bond + fee` with `receiveWithAuthorization`, and pays the fee to `msg.sender`. The EIP-3009 nonce is `keccak256(abi.encode("HUNDI_LOAD", chainid, vault, keccak256(abi.encode(a))))`, so a relayer cannot change what gets minted. `lockedUntil` can only grow, and only the key's first funder can add to a bond. Without that rule, anyone could call `load` against another person's key and lock their bond far into the future. `load` also requires the resulting bond to be at least twice the face value of the notes in that call, and `lockedUntil` to reach the latest `expiry + GRACE`. Otherwise the loader's own notes would fail the receiver's rule.

`settle` is the only way to get paid. It covers both a normal redemption and a claim, so a carrier runs one path.

```text
settle(header, hops, auth):
  id = noteId(header); require note exists and now <= expiry + GRACE
  slot = id; key = header owner; liable = 0
  for hop in hops (at most MAX_HOPS):
    link = sha256(hop message at slot, to hop key)
    require P256.verify(key, link, hop signature)
    if spentBy[slot] == 0: spentBy[slot] = link
    else if spentBy[slot] != link: liable = keyId(key)      // the deepest conflict wins
    slot = link; key = hop key
  tail = sha256(settle message at slot with auth.payTo and auth.fee)
  require P256.verify(key, tail, auth signature)
  require spentBy[slot] == 0; spentBy[slot] = tail
  if liable == 0:
    mark settled; paid = face
  else:
    paid = min(face, bond[liable] / 2); require paid > 0      // an empty bond must not spend the victim's tail
    bond[liable] -= 2 * paid
    burned += paid
  fee = min(auth.fee, paid)
  transfer paid - fee to auth.payTo; transfer fee to msg.sender   // skip zero amounts
```

Three properties follow from this rule.

- The first settlement of a note can never conflict, because every slot is empty. So `liable == 0` always pays from escrow, once.
- A conflict is two messages from one key at one slot, so `liable` is always a real double-signer. Nobody innocent can be charged.
- Recording empty slots during a claim means a nested fork charges each forker once.

`reclaim` returns an unsettled note's face value to `refundTo` after `expiry + GRACE`. `withdrawBond` pays out after `lockedUntil`, and signs over `lockedUntil`. `GRACE` and `MAX_LIFETIME` are constructor values.

`burned` is an internal tally, not a transfer, so no claim depends on a USDT call to a burn address. The invariant is `USDT.balanceOf(vault) == sum(unsettled face) + sum(bonds) + burned`.

### Offline acceptance rule

`accept(payment, request, snapshot, now)` is pure, and stops at the first failure.

| Step | Check | Reason on failure |
| --- | --- | --- |
| 1 | The request is ours and the amount matches | `wrong_amount` |
| 2 | Hop count is at most `MAX_HOPS` | `too_long` |
| 3 | `noteId` is in the snapshot with the same face | `unknown_note` |
| 4 | The snapshot does not show it settled | `spent` |
| 5 | `now + MARGIN < expiry` | `expiring` |
| 6 | We have not seen this note before | `seen_before` |
| 7 | Every signature verifies, and the last hop names us | `bad_signature` |
| 8 | No key appears twice in the chain | `bad_chain` |
| 9 | Every signer's bond is at least `2 * face` | `uncovered` |
| 10 | Every signer's bond is locked past `expiry + GRACE` | `uncovered` |

Step 10 removes the need for a freshness check on bonds. A cached bond is a promise until `lockedUntil`, because nothing except slashing can move it first.

A receiver who only receives needs no bond. A bond is needed to spend a note, because the next receiver checks every signer. Present the stall's bond to judges as a merchant float, posted before the outage. `MARGIN` is 300 seconds.

A payment carries one note. If multi-note payments are ever added, check each signer's bond against the sum of the values it signed in that payment, not against each note alone.

### Packages

```text
packages/core      pure, no network or storage, shared by app, relayer and tests
  types.ts bytes.ts chain.ts rule.ts snapshot.ts
packages/wallet    thin shell around core
  keystore.ts store.ts chain-io.ts qr.ts wallet.ts widget.ts
apps/pwa           the wallet app, a static site
apps/shop          the separate chai shop demo
apps/relayer       Bun, one route, optional
contracts          HundiVault.sol P256.sol HundiBytes.sol and fork tests
vectors            golden.json shared by forge and bun test
```

The client is a static Vite and React PWA, not Next.js, because Hundi has no server of its own to render from. Every design candidate chose this independently.

## Appendix C. Alternatives rejected

Four design runs started from different shapes. The cheque run failed with an API error and produced nothing. The attack-first run costed cheques and rejected them. All three finished runs reached minted notes.

**Base.** The attack-first candidate. The cross-model judge recommended it, scoring it highest on attack resistance. It supplies minted notes with per-key bonds, one `load` call, expiry with `reclaim`, and the worst-case loss formula.

**Grafted from the banknote candidate.** The one-slot rule `spentBy`, which handles redemption, claims and redeem-then-spend with one check. Also `mountHundi`, a DOM mount that needs no React in the host app. Its unbonded micro-payments, unsynced-note policy and `claimUnminted` are dropped, because the judge found they open holes.

**Grafted from the smallest candidate.** The ordered acceptance steps, the 300-second clock margin, and the discipline of a small screen count. Its per-note bond is rejected, as the table below explains.

**Changed during synthesis.**

- `redeem` and `claim` merged into `settle`, because a carrier should not need to know which one applies.
- The deepest conflict decides liability, so a nested forker cannot push their cost onto an upstream forker.
- `lockedUntil` replaced the cooldown, the pending-withdrawal flag and the snapshot age limit.
- Claims burn as much as they pay. Without this, a cheater recovers their whole bond with a sock-puppet claim.
- Only a key's first funder can add to its bond, which stops a stranger locking someone else's bond.
- From the judge's review of `settle`. A claim needs a non-empty bond, so it cannot spend a victim's tail for nothing. Burns are an internal tally. `load` enforces bond size and lock length.

The judge traced first settle, second settle, strict prefix, prefix extension, nested forks, collusion and replay, and found no path where an innocent party pays.

**Rejected.**

| Approach | Why it lost |
| --- | --- |
| Cheques against a shared balance | A payer can sign any number of cheques, and receivers cannot see each other. Overspend is unbounded |
| Per-note bond locked by the drawer | Smallest design, but an unbonded stall can pay one note to two suppliers, and the honest customer's bond covers the loss. The cheater gains and the innocent party pays |
| Pro-rata payouts after a claim window | A cheater creates unlimited sock-puppet claimants at no cost |
| Relayer-signed mint receipts | A trusted attestor fails CROPS |
| No bond withdrawal at all | The judge suggested this to cut scope. It strands bonds forever, and `lockedUntil` already reduces withdrawal to one function, so it stays |
| Fixed denominations in the contract | The app can choose note sizes. The contract does not need the rule |

## Appendix D. Risks

| Risk | Unit | Watch for | Mitigation |
| --- | --- | --- | --- |
| ETHGlobal AI rule | All | Judges ask what you built | Write `DECISIONS.md` yourself, own the contract, commit prompts |
| QR will not scan on phones | U3 | Scans over 5 seconds | Lower `MAX_HOPS` to 2, raise screen brightness, use the laptop webcam |
| iOS drops service worker or storage | U3 | App blank after reopening | Test early. Use Android for the demo if needed |
| Real USDT settlement fails | U2 | Revert on chain but not on fork | Check the token proxy, then ask at the Whitechain booth |
| WhitePay and others crowd Whitechain | U9 | Judges see one more checkout | Lead with re-spend and slashing, never checkout |
| Receiver rejects a note minted after its last sync | U4 | `unknown_note` in the demo | Always sync all devices after `load`, and state this limit |
| Anon-RPC gateway is down | U8 | Reads hang | Time out, fall back to direct reads, and say so on screen |
| Venue network fails during the demo | U9 | No signal at judging | The offline half needs none. Use a hotspot and pre-settled links |
| Faucet or gas runs out | U2 | Relayer below 0.1 WBT | About 1.99 WBT is available now. A settle costs little, so measure it in U2 |

## Appendix E. What Hundi cannot prevent, and how to answer judges

`v` is a note's value, `B` is the cheater's bond, and `k` is how many people receive the same note. `X` is the sum of `(k - 1) * v` across their notes.

```text
Cheater's worst-case net gain  = X - B / 2
Honest receiver's maximum loss = v per note
```

With a bond of `2v`, a two-way fork of one note nets zero even when the cheater wins the claim race. Each further victim adds `v` to their gain. `load` makes the bond cover all notes minted in that call, so forking each once still nets zero. A forwarder is weaker, because receivers check a bond against one note at a time. A stall with a `2v` bond that forks `n` received notes nets `(n - 1) * v`.

Say these plainly.

- Hundi does not stop a double-spend. It makes one provable and costly.
- Nothing offline limits `k`. A cheater who defrauds several people in person before anyone settles can profit.
- A victim is repaid only if they claim before the bond runs out. A cheater who races their own claim can beat them.
- Keys are free, so a burned key is abandoned. The bond is the only deterrent.
- A note loaded after a receiver's last sync gets refused.
- USDT can be frozen by its issuer, and Whitechain is an L2 with a sequencer. The README states both.

| Question | Answer |
| --- | --- |
| Can I still double-spend offline? | Yes. Nothing without secure hardware can stop it. The two signatures are proof, the bond pays the victim, and a matching amount is locked away for good |
| Why burn money? | Otherwise a cheater claims their own bond back through a second key. The burn means cheating costs money even if they win that race |
| What if a cheat exceeds the bond? | Later victims go unpaid. Each note is capped, and the required bond sets the break-even point |
| Why not cash? | Cash is better if you have it. This is for people whose money is already digital |
| Why do you need a blockchain? | Any stranger's phone must be able to redeem a note at a place no operator can shut down or refuse. A company database is the thing a shutdown order reaches |
| Why not just relay signed transactions? | Then the receiver cannot trust or re-spend anything until someone gets online. That is what OffGrid Pay and Kinjo do |
| What did you decide, and what did AI do? | Answer from `DECISIONS.md` in your own words |

## Appendix F. Demo script

Sync all three devices first. The customer has two 5 USDT notes and a 20 USDT bond. The stall has a 10 USDT bond. The supplier has no bond.

| Time | Action | Say |
| --- | --- | --- |
| 0:00 | Show the title | "India had 65 internet shutdowns last year. Merchants here solved this centuries ago with the hundi." |
| 0:20 | Put all three devices in airplane mode | "No network from here on." |
| 0:30 | Customer pays the stall note 1 | "Checked with no network." |
| 0:55 | **Stall pays the supplier with note 1** | "That money just moved twice with no network." |
| 1:20 | Customer turns off the guard, then pays note 2 to both the stall and the supplier | "Now I cheat. Both look valid, because nobody can know yet." |
| 1:50 | Supplier goes online and taps **Settle** | "Real USDT, settled by whoever got signal first." |
| 2:10 | Stall goes online and taps **Settle** | "The chain proved the cheat. The stall got paid, and the cheater lost twice that." |
| 2:35 | Stop the relayer and settle directly | "Nothing here depends on me." |

**Relay fee.** Through the relayer a 5 USDT note pays 4.90, and the app shows that. **Submit directly** pays the full 5.

**Video rules.** Whitechain wants each party shown. CROPS wants the moment it matters, which is the 2:35 step with the relayer off.

**Fallbacks.** If the chain or RPC fails, switch to the backup RPC, then show links to transactions settled earlier. If a camera fails, use the laptop webcam. If venue Wi-Fi fails, use a phone hotspot.

## Appendix G. Prize checklist

| Pick | Requirement | Evidence |
| --- | --- | --- |
| ETHGlobal | Live deployment anyone can open | URL |
| ETHGlobal | Public repo with steady commits | GitHub history |
| ETHGlobal | Video of 2 to 4 minutes, 720p or higher, own voice, no music, not sped up, not filmed on a phone | Upload |
| ETHGlobal | AI attribution by file, with specs, prompts and plans in the repo | `README.md`, `docs/ai/` |
| ETHGlobal | State what is reused from Cleared and what is new | `README.md` |
| Whitechain | Contracts deployed and verified on chain 1874 | Explorer link |
| Whitechain | USDT payment in the main flow, with the link in the README | `README.md` |
| Whitechain | A line on why this needs on-chain settlement | `README.md` |
| Whitechain | Setup, architecture and limitations | `README.md` |
| Whitechain | Honest feedback | `WHITECHAIN_FEEDBACK.md` |
| Operate | Drop-in piece in about 20 lines, with merchant and customer views | `apps/shop` |
| Scale | Zero visible crypto steps, and how gas is funded and protected | `README.md`, demo |
| EF CROPS | Free license and a README that explains how to run it | `LICENSE`, `README.md` |
| EF CROPS | README section titled CROPS with C, O, P and S lines | `README.md` |
| EF CROPS | Video of at most 3 minutes showing the moment it matters | Upload |
| EF CROPS | No trackers, and keys stay on the device | Code |
| EF Anon-RPC | Reads go through Anon-RPC by default | `chain-io.ts` |

The rules place a project in at most one EF prize. The gateway failed the U4 check, so reads are direct for now, and the Anon-RPC row stays unmet.

## Appendix H. Links

- [Prizes](https://ethglobal.com/events/mumbai/prizes)
- [Rules and judging](https://ethglobal.com/events/mumbai/info/details)
- [Whitechain explorer](https://explorer.testnet.whitechain.io)
- [Anon-RPC](https://github.com/ethereum/anon-rpc)
- [Earlier project, for reference](https://github.com/ratik21/cleared)
