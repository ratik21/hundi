# Uniswap feedback

Hundi's relayer pays gas in WBT and earns fees in USDT. I used the v3 pool on Whitechain so it can buy its own gas. The code is in `apps/relayer/src/refill.ts`.

## What worked
- `multicall` with `exactInputSingle` and `unwrapWETH9` did the swap and the unwrap in one transaction, so the relayer gets native gas straight away.
- The same code worked on a local fork and on the testnet with no changes. 2 USDT bought about 0.026 WBT after gas in [this transaction](https://explorer.testnet.whitechain.io/tx/0x257e04889dbdbe086acff4953a25b8b42fdcaf5de9a97407a4f9115784982725).
- Simulating the call first catches a bad swap before it costs any gas.

## Where I got stuck
- `SwapRouter02`'s `exactInputSingle` has no `deadline`, unlike the first `SwapRouter`. The deadline moves to `multicall`, and that is easy to mix up.
- Sending the swap to the router so it can unwrap means passing `address(2)` as the recipient. That is a magic value.

## What I would like
- A short recipe for "swap a token into native gas in one call". This must be a common need for anyone running a relayer.
- A clear list of which chains the Uniswap API covers, so I know early if I need to go to the contracts directly.

I used the contracts directly, not the API.
