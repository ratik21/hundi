# How Hundi was built

This file records what is new, what is reused, and where AI was used, as the ETHGlobal rules ask.

Hundi started from an empty repo at this event. Only setup files, Whitechain chain details and small helpers came from a dropped project at the same event, [Cleared](https://github.com/ratik21/cleared) at `f6723bf`. None of its contract or application code is here.

Ratik Jindal chose the project, approved the design, and tested it on real devices. Claude Code wrote the code from the plan, with Ratik directing.

| Files | Written by | How |
| --- | --- | --- |
| `docs/ai/PLAN.md`, `docs/ai/CONVENTIONS.md` | Claude Code, with Ratik directing | Design runs in Appendix C of the plan, approved by Ratik |
| `contracts/`, `packages/` | Claude Code (Opus 5.5) | From Appendix B of the plan |
| `apps/pwa/` | Claude Code (Opus 5.5), with subagents | From the plan, with design direction from Ratik |
| `apps/relayer/`, `apps/shop/`, `scripts/` | Claude Code (Opus 5.5) | From the plan |
| `README.md`, `docs/` | Claude Code (Opus 5.5) | Checked against the code and the chain |

Prompts, the plan and test evidence are in [`docs/ai/`](ai/).
