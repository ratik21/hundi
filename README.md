# Hundi

Pay in USDT from a phone in airplane mode. The receiver can spend that money onward while still offline, and a double-spender loses money on-chain.

Built at ETHGlobal Mumbai 2026. See `docs/ai/PLAN.md`.

## Deployment

Everything runs on the Whitechain Sepolia testnet, chain 1874.

- `HundiVault`, verified: [0x422D3a4745CFDEb1be99772eF636E827C892c45A](https://explorer.testnet.whitechain.io/address/0x422d3a4745cfdeb1be99772ef636e827c892c45a)
- First settlement, 5 USDT out of the vault to `payTo`: [0x4fa1...ebab](https://explorer.testnet.whitechain.io/tx/0x4fa116315edde176eb4c8d5e0a39998f21e8791afb5bb9b2958ba3412e74ebab)
- Settled through the relayer by a device holding no gas: [0x6724...ac66](https://explorer.testnet.whitechain.io/tx/0x6724decba19824a653c94e8557e3d106fcc4fdf94f18ed9667825cb0c257ac66)
- Settled directly with the relayer stopped: [0xaee9...caa8](https://explorer.testnet.whitechain.io/tx/0xaee94522ed28b70cb12c74c9e83c9bb1fac84a3bcd83fa2c63b28ebccfbcbca8)
- Wallet: <https://hundi-ten.vercel.app>

## Relayer

The relayer is optional. It carries `load` and `settle` for a device with no gas, and takes a 0.10 USDT fee from the payout. It simulates every call first, and refuses anything that would fail or would not cover its gas. Any device can skip it with **Submit directly**.

Start it, with a public tunnel, with `bun run relayer`. It runs on a laptop, so a stopped laptop stops the relayer but stops nothing else.
