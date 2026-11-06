# Whitechain feedback

## What worked
- forge deploy and Blockscout verification worked first try.
- `receiveWithAuthorization` on the test USDT worked, so a gasless load through my relayer was simple.
- The `0x100` P-256 precompile verified a browser WebCrypto signature, 27,745 gas for the whole transaction. This is what makes phone keys possible for Hundi.
- `eth_simulateV1` is on the RPC, so my relayer reads the real payout before it sends anything.

## Where I got stuck
- `eth_getLogs` is capped at 10,000 blocks. At one block per second that is under 3 hours, so my first sync failed. I only found the limit from the error.
- `eip712Domain()` reverts on the USDT, so I hardcoded the domain and checked it against `DOMAIN_SEPARATOR()`.
- The precompile returns empty bytes on failure, not zero. That is easy to get wrong.
- forge's local EVM has no `0x100` on `prague`, so every signature failed in fork tests until I moved the tests to `osaka`.

## What the docs were missing
- Public RPC limits, like the `eth_getLogs` cap and which methods are enabled. `debug_traceCall` is not.
- The P-256 precompile's address and how it fails. The docs mention `P256VERIFY`, but not `0x100` or the empty return data.
- The USDT EIP-712 domain.
- The token list shows USDT on chain 1874 at `0xaa79…8f46`, which is not the token the prize needs.
- The swap router and pool fee for getting test USDT.
