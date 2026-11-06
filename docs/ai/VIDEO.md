# Demo video

Hundi enters **Partner Prizes Only**, so partners judge it from the video, the README and the repo. There is no live demo.

The video must run 2:30 to 2:55. Whitechain wants 2 to 4 minutes that show each party. CROPS allows 3 minutes at most and wants the moment the lead property matters. ETHGlobal wants 720p or higher and your own voice, with no music, no AI voice, and no speed-up. You must not record it on a phone. You may cut out waiting.

## What each judge needs to see

| Judge | Must see | Where |
| --- | --- | --- |
| Whitechain, all tracks | Each party, and USDT settling on chain | 1:45 |
| Operate | A drop-in piece in about 20 lines, a merchant view and a customer view, an accountant export | 2:15 |
| Scale | A payer who sees no crypto steps, who pays the gas, what stops a drain | 0:35, 1:45 |
| CROPS | The backend switched off, and it still works | 2:00 |
| Uniswap | The relayer buying its own gas | 1:45 |

## Shot list

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Title card | "Access Now counted 65 internet shutdowns in India last year. When the network goes, digital money stops. Merchants here solved this centuries ago with the hundi, a paper note that passed from hand to hand." |
| 0:15 | Three wallets side by side. Name each party | "A customer, a stall, and the stall's supplier. Everyone synced earlier, and the customer locked up two 5 USDT notes and a safety deposit." |
| 0:25 | Turn off the Wi-Fi | "From here on there is no network." |
| 0:35 | Stall shows a code. Customer scans it and pays. Stall scans. Big green Paid | "The customer pays. The stall checks it on the spot, with no network. No gas, no seed phrase, no chain to pick." |
| 0:55 | Stall pays the supplier with the same note. Paid | "Now the part nobody else does. The stall spends that same money onward, still offline. The money moved twice with no network." |
| 1:15 | Customer turns off the guard, then pays note 2 to both the stall and the supplier. Two green screens | "Now I cheat. Same note, two people. Both look valid, because offline nobody can know yet." |
| 1:45 | Supplier goes online and taps **Settle**. Paid. Open the receipt on the explorer | "The supplier gets signal first and settles. Real USDT on Whitechain. My relayer paid the gas and took a 10 cent fee from the payout. It simulates every call first, refuses anything that would not pay for itself, and buys its own gas on Uniswap." |
| 2:00 | Stop the relayer in the terminal. Stall turns on **Submit directly**, goes online, taps **Settle**. Covered | "Now I switch my backend off. The stall settles anyway, straight to the chain. Nothing here depends on me." |
| 2:10 | Explorer. The cheater's deposit falls from 20 to 10 | "The chain saw two signatures at one slot. The stall got paid, and the cheater lost double." |
| 2:15 | Chai shop till, then `main.ts`, then the CSV | "Any shop can add this in 21 lines. Here is a chai shop taking a payment offline, the customer's view, and the file for the accountant." |
| 2:40 | Title card with the URL and repo | "Hundi doesn't stop a double-spend. It makes one provable and costly. Money that works when the network doesn't." |

## How to record

Record three iOS Simulators side by side on the real testnet, plus one short real clip. Decided by Ratik on 6 Nov.

1. Run `bun run lab --ios --testnet`. It opens one wallet per simulator at ports 5191 to 5193, and funds the customer and the stall from the relayer account the first time each wallet opens.
2. Start a local relayer in a visible terminal with `bun apps/relayer/src/index.ts`. Press Ctrl-C at 2:00 to switch the backend off on camera.
3. On each simulator, use **Add to Home Screen** and open the wallet from there. In Safari the verdict stops short of the screen edges, and the browser bar stays in the shot.
4. Load money, then tap **Refresh** on all three while online.
5. For the offline half, turn off the Mac's Wi-Fi. The simulators lose the chain, and QR codes still pass over `localhost`. This is untested, so try it before the take.
6. Record the laptop screen with QuickTime or OBS. Don't record on a phone.
7. Add a real clip of the iPhone in airplane mode scanning a code from the laptop. A simulator has no camera, so this clip shows the scan is real.
8. Say it plainly in the video and in the README: the simulators pass QR codes through a local relay because they have no camera.
9. Record the voice separately if that is easier. Cut the waiting. Never speed the footage up.

A take uses up both notes and 10 USDT of the deposit. A retake needs new wallets or a top-up, and the relayer account holds enough for about one full take, so plan for the faucet.
