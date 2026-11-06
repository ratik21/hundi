# Pays the coffee shop till from a lab wallet, offline, and saves a screenshot of each state.
# Usage: bun run lab, then bun run lab:shop. Pass through browser-harness.
import base64
import json
import os
import time

SHOTS = ".lab/shots/shop"
os.makedirs(SHOTS, exist_ok=True)
WALLET = "http://localhost:5191/"
STALL = "http://localhost:5192/"
SHOP = "http://localhost:5194/"
ROOT = "document.querySelector('#till')?.shadowRoot"
TAGLINE = "Money that works when the network doesn't."
offline = [False]
tabs = {}
step = [0]


def use(name):
    switch_tab(tabs[name])
    cdp("Emulation.setFocusEmulationEnabled", enabled=True)
    cdp("Network.enable")
    cdp("Network.setBlockedURLs", urls=["*:8599*"] if offline[0] else [])
    js("Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>%s});dispatchEvent(new Event('%s'))"
       % (("false", "offline") if offline[0] else ("true", "online")))
    time.sleep(0.3)


def text():
    return " ".join(js(f"({ROOT}?.textContent ?? '') + ' ' + (document.body?.innerText ?? '')").split())


def tap(label):
    result = js("(()=>{const m=[...(%s?.querySelectorAll('button')??[]),...document.querySelectorAll('button')].filter(b=>b.textContent.trim().startsWith(%s)||b.getAttribute('aria-label')===%s);if(!m[0])return 'MISSING';m[0].click();return 'ok'})()"
                % (ROOT, json.dumps(label), json.dumps(label)))
    assert result == "ok", (label, text()[:300])
    time.sleep(0.4)


def see(needle, seconds=45):
    deadline = time.time() + seconds
    while time.time() < deadline:
        if needle in text():
            return
        time.sleep(0.3)
    raise AssertionError(f"never saw {needle!r}: {text()[:300]}")


def shot(name, wait=1.2):
    time.sleep(wait)
    step[0] += 1
    with open(f"{SHOTS}/{step[0]:02d}-{name}.png", "wb") as file:
        file.write(base64.b64decode(cdp("Page.captureScreenshot", format="png")["data"]))


def open_fresh(name, url, width, height):
    tabs[name] = new_tab(url)
    wait_for_load()
    cdp("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=2, mobile=False)
    js("Promise.all(['hundi-wallet','hundi-keystore'].map(n=>new Promise(r=>{const q=indexedDB.deleteDatabase(n);q.onsuccess=q.onerror=q.onblocked=r})))")
    cdp("Page.reload", ignoreCache=True)
    wait_for_load()
    time.sleep(2)


for tab in list_tabs():
    if any(port in tab.get("url", "") for port in ("localhost:5191", "localhost:5192", "localhost:5194")):
        cdp("Target.closeTarget", targetId=tab.get("targetId") or tab.get("id"))
time.sleep(0.5)

open_fresh("customer", WALLET, 390, 844)
use("customer")
see(TAGLINE)
tap("Add money")
see("Available to add")
tap("Add 30 USDT")
see("Available offline", 60)
see("10 USDT")

open_fresh("stall", STALL, 390, 844)
use("stall")
see(TAGLINE)

open_fresh("shop", SHOP, 1280, 800)
use("shop")
see("To pay")
see("Hundi. Works with no network.")
shot("till-online")

offline[0] = True
use("shop")
see("Payments still work")
assert not js(f"{ROOT}.querySelector('.offline').hidden"), "the offline band should show"
shot("till-offline")

use("customer")
tap("Pay")
see("You are paying")
tap("Pay")
see("Show this to them")
time.sleep(0.5)

use("shop")
tap("Scan their payment")
see("Next customer")
assert js(f"{ROOT}.querySelector('[data-verdict]').dataset.verdict") == "ok"
shot("till-paid")
see("Coffee and croissant, paid at")
tap("Next customer")
see("To pay")

offline[0] = False
use("shop")
tap("Claim")
see("claimed", 60)
shot("till-settled")

# The stall takes the customer's other note, then settling fails on the chain read.
offline[0] = True
use("stall")
tap("Receive")
see("Ask them to scan")
time.sleep(0.5)
use("customer")
tap("Done")
tap("Pay")
see("You are paying")
tap("Pay")
see("Show this to them")
time.sleep(0.5)
use("stall")
tap("Scan their payment")
see("Paid")
see("Done")
tap("Done")
offline[0] = False
use("stall")
see("5 USDT pending")
js("const real=fetch;window.__fetch=real;window.fetch=(url,init)=>String(init?.body).includes('eth_call')?Promise.reject(new TypeError('blocked')):real(url,init)")
tap("Claim")
see("Not claimed", 90)
shot("stall-not-settled")
js("window.fetch=window.__fetch")
tap("Done")
see("5 USDT pending")
tap("Claim")
see("Receipt", 60)
shot("stall-settled-on-retry")
tap("Done")

use("shop")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
js("location.hash='#customer'")
time.sleep(1)
wait_for_load()
see("You can spend", 30)
shot("customer-view")

for target in tabs.values():
    cdp("Target.closeTarget", targetId=target)
print(f"Shop passed. Screenshots in {SHOTS}.")
