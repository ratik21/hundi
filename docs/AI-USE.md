# How I built Hundi

I built Hundi at ETHGlobal Mumbai with an AI coding agent. I set the direction and made the product and design decisions. The agent wrote most of the code.

## Method

- **Spec first.** [`PLAN.md`](ai/PLAN.md) splits the build into units. Each one ends in a result on the real chain or a real phone, so passing tests alone don't finish a unit.
- **Competing designs.** Separate design runs started from different shapes, and a judge from a different model reviewed them. [Appendix C](ai/PLAN.md#appendix-c-alternatives-rejected) records what lost and why.
- **Attacks before code.** A modelled attack showed a cheater could recover their bond through a second key, which is why claims burn as much as they pay.
- **Riskiest parts first.** Real USDT settlement and airplane-mode QR came before everything else.
- **Clear agent rules.** Testnet only, one commit per unit, and no change to the core design without my approval.

## Verification

| Check | What it proves |
| --- | --- |
| Shared vectors | Solidity and TypeScript agree on every hash |
| Fork tests | The contract works against the real USDT |
| Story test | The whole demo runs in one test, including a double-spend claim |
| Failing test first | Hashes and bug fixes start from a failure, as in `f0c9b9f` then `93360ba` |
| Real-chain checks | A sync bug missed on a fork (0 of 12) appeared on the testnet (2 of 10) |
| Scripted app runs | The main payment flows are driven in Chrome and iOS Safari |
| Independent review | A separate agent reviews changes it didn't write |
| Real devices | An [iPhone in airplane mode paid a laptop by camera](https://explorer.testnet.whitechain.io/tx/0x13d45e60b0a2446c156cdda4e6e834cc39cd19bae3df4b873cd366d3aeaee589) |

## My decisions

The reasoning behind the design is in [`DECISIONS.md`](../DECISIONS.md).

- Entered Partner Prizes Only, on testnet, with Whitechain, the Ethereum Foundation and Uniswap.
- Added the relayer's Uniswap refill, and moved the relayer to Vercel.
- Dropped Anon-RPC after its gateway failed the test.
- Chose the dark, crypto-native wallet design.
- Replaced protocol terms with wallet words like Pending, Confirmed and Claim.
- Rewrote the demo for readers outside India.

## Tools

An AI coding agent, pstack skills (`poteto-mode`, `unslop`, `thermo-nuclear-review`), `handoff` for verified session handovers, and `browser-harness` for driving real browsers.

## New and reused

Hundi started from an empty repo at this event. Only setup files, Whitechain chain details and small helpers came from a dropped project at the same event, [Cleared](https://github.com/ratik21/cleared) at `f6723bf`. None of its contract or application code is here.

## Where AI was used

| Files | Written by | How |
| --- | --- | --- |
| `docs/ai/PLAN.md`, `docs/ai/CONVENTIONS.md` | AI agent, with me directing | Design runs in Appendix C, approved by me |
| `contracts/`, `packages/` | AI agent | From Appendix B of the plan |
| `apps/pwa/` | AI agent, with subagents | From the plan, with my design direction |
| `apps/relayer/`, `apps/shop/`, `scripts/` | AI agent | From the plan |
| `README.md`, `DECISIONS.md`, `docs/` | AI agent, with me directing | From my messages and the plan, checked by me |

The key prompts are in [`docs/ai/prompts.md`](ai/prompts.md), and every message is in the [full prompt log](ai/prompt-log.md).
