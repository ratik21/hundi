# Prompts

These are the prompts that directed the build from the start of U0, word for word. The design work before U0 is recorded in `PLAN.md` Appendix C. Every message from the first idea onward is in the [full prompt log](prompt-log.md).

## Opening prompt

```text
Resume Hundi for ETHGlobal Mumbai. Submissions close Sat 7 Nov 09:00 IST.
Check the current time first, and adjust the PLAN.md schedule to the hours left.

Read HANDOFF.md, PLAN.md and CONVENTIONS.md in full. Re-verify HANDOFF.md, report any drift, then proceed without waiting if nothing blocks you.

My answers to the open questions:
- Go: start U0 now, then U1 and U3 in parallel.
- Use Vite and React, not Next.js.
- you can replace or remove ratik21/cleared with the new project

Rules:
- PLAN.md is the spec. Tell me before you deviate from Appendix B.
- Write .gitignore before the first git add. The repo is public and .env is in this folder.
- Commit and push after every unit.
- A unit is done only when its "You see" result happens on the real chain or real phones.
- Run tests and builds through ~/.local/bin/mb-heavy.
- For browser work, use BU_NAME=hundi and your own new_tab(). Never navigate a tab you didn't open.
- Never write DECISIONS.md. I write that myself.
- Stop and ask me for anything only I can do: phones, GitHub consent screens, the ETHGlobal form.

The first real risks are U2 (a real USDT settlement) and U3 (QR between two phones in airplane mode). Prove both before building anything else.
```

## Subagent briefs

### U3, the PWA shell and QR test

```text
You are the U3 fork. Build everything for PLAN.md U3 that doesn't need a human, deploy it, and report the URL. The main thread is doing U1/U2 in contracts/, packages/core/, vectors/, scripts/ — do NOT touch those paths.

Scope (only these paths): apps/pwa/**, packages/wallet/src/qr.ts, packages/wallet/src/keystore.ts, their tests, packages/wallet/package.json and bun.lock if a dep is truly needed. All deps are already declared at U0 (vite, vite-plugin-pwa, react, tailwind, qrcode, jsqr).

Build:
1. vite-plugin-pwa with generateSW, autoUpdate, precaching ALL build assets, a manifest with real icons, display standalone. App must cold-start in airplane mode after one online load.
2. packages/wallet/src/keystore.ts: non-extractable WebCrypto P-256 key in IndexedDB; sign raw message bytes, export raw x||y public key.
3. packages/wallet/src/qr.ts: `qrcode` to draw in BYTE mode from Uint8Array segments, error correction L, quiet zone kept, pure black on white; `jsqr` to read and use its `binaryData`. No BarcodeDetector.
4. Test page as the default screen. Show builds a payload of EXACTLY 618 bytes = pubkey 64 || sig 64 || random 490, with a 362-byte variant. Scan uses the environment camera, decodes frames, verifies the signature with WebCrypto, no network, and shows the result and time-to-scan. Also show online state, service worker state, build id, and whether the key survives reload.
5. No analytics, no trackers, no external fonts or CDN.

Prove what you can before reporting, deploy to Vercel, commit, and do NOT mark U3 done: its You-see result needs real phones.
```

### Anon-RPC check

```text
You are the Anon-RPC fork for the PLAN.md U4 line: "Test eth_getLogs through Anon-RPC now, before building on it. Evidence is a saved log."

Do this in a throwaway project, following the CONVENTIONS.md section on Anon-RPC. Testnet only: chain 1874. Through the worker, run eth_blockNumber, eth_chainId and eth_getLogs for the vault from its deploy block to latest. Time each read, repeat 3 times, and compare with the same reads direct.

Save the raw results to docs/ai/evidence/anon-rpc-getlogs.md. If the gateway is down or getLogs fails, say so plainly: that is a valid result. Do not build the fallback.
```

## Go-aheads and check-ins

The plan defines each unit, so most of these only start the next one.

<details>
<summary>Show all</summary>

```text
I'm assuming you are doing everything on testnet, right?
(do only test stuff)
how are we doing now?
What do i need to do tell me here? Also shouldn't we build an app for this? seems to be like an app interface/design.. And just let me know what I need to test as well
got this: [screenshot of a 618-byte scan, valid signature in 3.39 s, in airplane mode]
yes start
yes start U5
yes start U6
yes start U7
yes, start
```

</details>
