# `eth_getLogs` through Anon-RPC

**Result: FAIL on 6 Nov 2026.** No read completed through Anon-RPC, because the one configured gateway did not answer. `eth_getLogs` through Anon-RPC is therefore untested, not disproved. The direct path works, with a 10,000-block limit on each query.

| Item | Value |
| --- | --- |
| Run | 2026-11-06, 14:26 to 14:34 UTC (19:56 to 20:04 IST) |
| Browser | Local Chrome, throwaway Vite page on `127.0.0.1` |
| Package | `@anon-rpc/browser-harness` 0.4.0 |
| Specifier | `0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e` on Ethereum mainnet |
| Gateway | `152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ` |
| RPC | `https://rpc.testnet.whitechain.io/`, chain 1874 |
| Vault | `0x422d3a4745cfdeb1be99772ef636e827c892c45a`, deploy block 12357204 |
| Latest block | 12378821 |

## Direct reads

| Round | `eth_chainId` | `eth_blockNumber` | `eth_getLogs`, deploy block to latest | `eth_getLogs`, 5,000 blocks |
| --- | --- | --- | --- | --- |
| 1 | 342 ms, 1874 | 140 ms, 12378820 | 152 ms, refused | 155 ms, 3 logs |
| 2 | 170 ms, 1874 | 191 ms, 12378821 | 161 ms, refused | Not run |
| 3 | 153 ms, 1874 | 151 ms, 12378821 | 169 ms, refused | Not run |

The refusal is `rpc error -32602: query exceeds max block range 10000`. The range was about 21,600 blocks.

The 3 logs are one `NoteLoaded`, one `BondChanged` and one `Settled`, by distinct `topic0` values `0x1e1fb151`, `0xfd9154f7` and `0x21de4105`. This matches the U2 run, which has one `BondChanged`, not two.

## Anon-RPC reads

No read succeeded, so the Anon-RPC half of the comparison has no timings.

| Attempt | Result |
| --- | --- |
| 1. Wait for `worker.ready` | Timed out at 180 s |
| 2. Send `eth_blockNumber` without waiting for `ready` | Timed out at 240 s |

Worker log from attempt 2, with the elapsed time from page load:

```text
2849ms   bootstrap eth_call on the specifier: answered
6019ms   bootstrap eth_call on the specifier: answered
8056ms   tor-js worker: using 1 gateway(s), log level info
8454ms   Fast bootstrap: fetching bootstrap.zip.zst...
23483ms  Fast bootstrap failed (continuing normally): all gateways failed for
         /bootstrap.zip.zst: 152.236.3.22:12298:uEiC...: dial ...: timed out
23534ms  1: Looking for a consensus., attempt = 1
78836ms  Reached circuit build retry limit, exiting...
78839ms  error while downloading, error = Problem downloading directory object
134137ms Reached circuit build retry limit, exiting...
195257ms Reached circuit build retry limit, exiting...
195259ms Unable to download a usable directory. (We will restart in 1s)
240505ms fetch FAIL: fetch timeout 240s
```

The harness loaded, the bundle passed its hash check and the worker started. The failure is the gateway dial, and everything after it follows from that.

## Which link failed

| Check | Result |
| --- | --- |
| Specifier contract on mainnet | Has code, and answered both reads |
| Harness and worker boot | Worked |
| Gateway dial from the worker | Timed out |
| TCP to `152.236.3.22:12298` | Timed out |
| UDP probe to `152.236.3.22:12298` | No reply, which proves little, because a WebRTC endpoint can ignore an unauthenticated probe |
| STUN to `stun.l.google.com:19302` | Reply in 24 ms |
| STUN to `stun.cloudflare.com:3478` | Reply in 21 ms |

This network passes ordinary outbound UDP, so a blanket UDP block is ruled out. Either the gateway is down, or something between this network and the gateway blocks it. One network was tested, so these two causes are not separated.

## What this means

- U4's fallback applies: if `eth_getLogs` fails through Anon-RPC, follow U8, which publishes a static `snapshot.json` and reads it through the worker. That fallback also needs a working gateway, so a dead gateway leaves direct reads as the only path.
- Reads need a short timeout and a direct fallback that says so on screen, as Appendix D requires.
- `sync` must query in chunks of at most 10,000 blocks on either path.
