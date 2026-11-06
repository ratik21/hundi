# Project conventions

These are the setup choices and lessons from the first ETHGlobal Mumbai project, Cleared. Copy them into a new project instead of working them out again. The old code stays on GitHub at [ratik21/cleared](https://github.com/ratik21/cleared), commit `f6723bf`.

## Use this stack

| Layer | Choice | Version |
| --- | --- | --- |
| Runtime, installs, tests | Bun | 1.4.4 |
| Language | TypeScript, strict | 7.0.2 |
| Lint and format | Biome through Ultracite | 2.6.4 and 8.1.1 |
| Git hooks | Lefthook | Latest |
| Validation | Zod | 4.6.7 |
| Chain client | viem | 2.57.16 |
| Contracts | Foundry, Solidity | 1.9.0, 0.8.38 |
| Styling | Tailwind | 4.3.4 |
| Logging on a server | Pino | 10.4.0 |
| CI | GitHub Actions | Free on a public repo |

Pin exact versions in `package.json`, and set `"packageManager": "bun@1.4.4"`. Install with `bun install --frozen-lockfile` in CI.

## Start a new repo with these files

### `package.json` scripts

```json
{
  "scripts": {
    "check": "ultracite check",
    "fix": "ultracite fix",
    "test": "bun test src",
    "typecheck": "tsc --noEmit"
  }
}
```

List any package that needs an install script under `trustedDependencies`, or Bun skips it. Lefthook needs this.

### `biome.jsonc`

Extend only the Ultracite presets the project uses, and exclude generated folders.

```jsonc
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["ultracite/biome/core", "ultracite/biome/react"],
  "files": {
    "includes": ["!!contracts/lib", "!!contracts/out", "!!docs"]
  }
}
```

### `lefthook.yml`

```yaml
pre-commit:
  jobs:
    - run: bunx ultracite fix {staged_files}
      glob:
        - "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,json,jsonc,css,html,md,yaml,yml}"
      stage_fixed: true
```

### `tsconfig.json` flags that catch real bugs

Keep these on in every project.

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] },
    "types": ["bun", "node"]
  },
  "exclude": ["node_modules", "contracts", "docs"]
}
```

### `.gitignore`

```gitignore
.env
.env.*
!.env.example
node_modules/
contracts/out/
contracts/cache/
contracts/broadcast/
*.tsbuildinfo
*.pem
.DS_Store
HANDOFF.md
.handoffs/
```

### `contracts/foundry.toml`

```toml
[profile.default]
src = "src"
test = "test"
script = "script"
out = "out"
libs = ["lib"]
solc = "0.8.38"
evm_version = "prague"
optimizer = true
optimizer_runs = 200
via_ir = true
bytecode_hash = "none"
fs_permissions = [{ access = "read", path = "../vectors" }]

[rpc_endpoints]
whitechain = "https://rpc.testnet.whitechain.io/"
```

Add `forge-std` as a git submodule at `contracts/lib/forge-std`.

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.4
      - run: bun install --frozen-lockfile
      - run: bunx ultracite check
      - run: bun run typecheck
      - run: bun run test
      - run: bun run build

  contracts:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: contracts
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: v1.9.0
      - run: forge fmt --check
      - run: forge build
      - run: forge test
```

## Write TypeScript this way

- Brand every semantic primitive, so an address cannot pass where an amount belongs.

  ```ts
  export type Brand<T, B extends string> = T & { readonly __brand: B };
  export type Address = Brand<`0x${string}`, "Address">;
  /** USDT has 6 decimals. Always a bigint, never a float. */
  export type UsdtAtoms = Brand<bigint, "UsdtAtoms">;
  ```

- Parse external data once at the boundary with Zod, then trust the types inside.
- Keep business logic in pure functions under `src/domain/`. Keep network and storage code thin.
- Derive state from records instead of storing a status column that can drift.
- Parse environment variables at startup and stop on bad config. Report variable names and rule messages only, never values.
- Keep secrets out of client bundles. Only `NEXT_PUBLIC_` or `VITE_` variables reach the browser, so treat those names as public.

## Write Solidity this way

- Use custom errors, immutable config and no owner where the design allows it.
- Make settlement functions permissionless, so anyone can pay the gas and only the signed outcome can happen.
- Bind every signature to version, chain ID, contract address, purpose and amount. A relayer then cannot redirect funds or replay them elsewhere.
- Write state before external calls.
- Use a safe-transfer wrapper for USDT that accepts empty or `true` return data.

## Test against the real thing

- Run contract tests on a fork of the live chain against the real token, using `vm.createSelectFork("whitechain")` and `deal`. This caught more than mocks would.
- Share golden vectors between Forge and `bun test` in `vectors/*.json`, so Solidity and TypeScript cannot disagree on a hash.
- Generate the ABI from Forge output with a script. Never hand-write it.

  ```ts
  import { readFile, writeFile } from "node:fs/promises";

  const artifact = JSON.parse(await readFile("contracts/out/Vault.sol/Vault.json", "utf8"));
  await writeFile(
    "src/chain/abi.generated.ts",
    `// Generated by scripts/gen-abi.ts from forge out/. Do not edit.
  export const vaultAbi = ${JSON.stringify(artifact.abi, null, 2)} as const;
  `
  );
  ```

- Keep deployed addresses in `deployments/<chainId>.json`, and import that file rather than copying addresses.
- Check a chain is advancing by comparing block age or two block numbers. An RPC that answers can still be stalled.

## Commit and submit this way

- Commit each working unit and push at every checkpoint. ETHGlobal can disqualify large single commits or missing history.
- Use Conventional Commits, such as `feat(contracts): add settlement`.
- Never commit `.env`. Keep `.env.example` current with names only.
- Attribute AI use by file, and commit all specs, prompts and plans. ETHGlobal requires this, and a project that relies entirely on AI may lose finalist and partner eligibility.
- The video must run 2 to 4 minutes, at 720p or higher, with your own voice and no music. Do not speed it up or record it on a phone.
- A finalist project also needs a live deployment anyone can open, a complete submission form and a public repo.

## Use these Whitechain Sepolia details

| Item | Value |
| --- | --- |
| Chain ID | 1874 |
| RPC | `https://rpc.testnet.whitechain.io/` |
| Backup RPC | `https://rpc.ankr.com/whitechain_testnet` |
| Explorer | `https://explorer.testnet.whitechain.io` |
| Verifier URL | `https://explorer.testnet.whitechain.io/api/`, with the trailing slash |
| Gas token | WBT, 18 decimals |
| USDT | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, 6 decimals |
| Wrapped WBT | `0x4200000000000000000000000000000000000006` |
| Swap router | `0xe208cc685cd95d56e8ec6dec9816476567fc6962`, SwapRouter02, pool fee 3000 |
| Faucet | 2 WBT per GitHub account, about every 24 hours |

```ts
import { defineChain } from "viem";

export const whitechainSepolia = defineChain({
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.whitechain.io" },
  },
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { decimals: 18, name: "WBT", symbol: "WBT" },
  rpcUrls: { default: { http: ["https://rpc.testnet.whitechain.io/"] } },
});

/** Hardcoded because `eip712Domain()` reverts on the token. */
export const USDT_DOMAIN = {
  chainId: 1874,
  name: "Tether USD",
  verifyingContract: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
  version: "1",
} as const;
```

The USDT contract supports EIP-3009 `receiveWithAuthorization`, which requires `msg.sender` to equal `to`. Use only the USDT address above. The docs list a different test token, and the prize rejects it.

To reach the faucet from a script, open `https://faucet.testnet.whitechain.io/api/auth/github` directly. GitHub's permission screen still needs a person.

## Read chains privately through Anon-RPC

Create one long-lived worker per page load and pass its `fetch` to viem. Version 0.4.0 of `@anon-rpc/browser-harness` worked on chain 1874. Its Tor gateway is a demo gateway that may disappear, so keep a fallback and tell the user which path a read took.

```ts
import { AnonRpcWorker } from "@anon-rpc/browser-harness";

const worker = new AnonRpcWorker({
  address: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
  config: {
    gateways: ["152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ"],
  },
  preExisting: { rpcProvider: bootstrapProvider },
});
const transport = http(rpcUrl, { fetchFn: (input, init) => worker.fetch(input, init) });
```

`bootstrapProvider` is a small direct JSON-RPC client for Ethereum mainnet. It resolves the Tor specifier, and that one read is direct. Disclose it.

## Avoid these local traps

- Foundry is not on the shell PATH. Run `export PATH="$HOME/.foundry/bin:$PATH"` first.
- `timeout` does not exist on this Mac. Use the tool's own timeout.
- `cast wallet new --json` nests the wallet under `data`.
- `foundryup` and other large downloads can take over 5 minutes on venue Wi-Fi, so run them in the background.
- Run tests, typechecks and builds through `~/.local/bin/mb-heavy`.
- The default `browser-harness` connection is shared with other sessions. Set `BU_NAME=<project>`, open your own tab with `new_tab()`, and check the page URL before you navigate, type or click. Navigating with `goto_url()` on a shared connection can hijack another session's tab.
- `https://ethglobal.com/events/mumbai/dashboard` returns 404. Use `/home`, `/team` and `/project`.
- ethglobal.com rate-limits fast crawls with HTTP 429. Keep a 2 second gap between requests.
- Ultracite's `useSortedKeys` reorders object literals on fix. Never call a stateful reader or any order-dependent function inside an object literal. Read into locals first.
- Forge's local EVM has no `0x100` P-256 precompile before `osaka`, so a fork test on `prague` sees empty return data for every signature. Tests run on `osaka`. Deploy with `FOUNDRY_PROFILE=deploy`, which keeps `prague`.
- The Whitechain RPC refuses `eth_getLogs` over 10,000 blocks. At one block per second that is under 3 hours, so always read logs in chunks.
