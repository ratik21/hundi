# Pays the chai shop till from a lab wallet, offline, and saves a screenshot of each state.
# Usage: bun run lab, then bun run lab:shop. Pass through browser-harness.
import base64
import json
import os
import time

SHOTS = ".lab/shots/shop"
os.makedirs(SHOTS, exist_ok=True)
WALLET = "http://localhost:5191/"
SHOP = "http://localhost:5194/"
ROOT = "document.querySelector('#till')?.shadowRoot"
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
    if any(port in tab.get("url", "") for port in ("localhost:5191", "localhost:5194")):
        cdp("Target.closeTarget", targetId=tab.get("targetId") or tab.get("id"))
time.sleep(0.5)

open_fresh("customer", WALLET, 390, 844)
use("customer")
see("Nothing here yet")
tap("Add money")
see("Available to add")
tap("Add 30 USDT")
see("2 notes of 5 USDT", 60)

open_fresh("shop", SHOP, 1280, 800)
use("shop")
see("To pay")
shot("till-online")

offline[0] = True
use("shop")
see("Payments still work")
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
see("Chai and samosa, paid at")
tap("Next customer")
see("To pay")

offline[0] = False
use("shop")
tap("Settle")
see("settled", 60)
shot("till-settled")

cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
js("location.hash='#customer'")
time.sleep(1)
wait_for_load()
see("You can spend", 30)
shot("customer-view")

for target in tabs.values():
    cdp("Target.closeTarget", targetId=target)
print(f"Shop passed. Screenshots in {SHOTS}.")
