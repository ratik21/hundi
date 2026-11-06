# Runs PLAN.md Appendix F through the real screens and saves a screenshot of each step.
# Usage: bun run lab, then bun run lab:drive. Pass through browser-harness.
import base64
import json
import os
import time

SHOTS = ".lab/shots"
os.makedirs(SHOTS, exist_ok=True)
PORTS = {"customer": 5191, "stall": 5192, "supplier": 5193}
TAGLINE = "Money that works when the network doesn't."
PLEDGES = ("Pay in seconds", "Trusted with no network", "Cheating costs double", "Yours alone")
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
    return " ".join(js("document.body?.innerText ?? ''").split())


def tap(label):
    result = js("(()=>{const m=[...document.querySelectorAll('button,label')].filter(b=>b.textContent.trim().startsWith(%s)||b.getAttribute('aria-label')===%s);if(!m[0])return 'MISSING';m[0].click();return 'ok'})()"
                % (json.dumps(label), json.dumps(label)))
    assert result == "ok", (label, text()[:300])
    time.sleep(0.4)


def motions(label, ms=350):
    return js("new Promise(done=>{const m=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim().startsWith(%s)||b.getAttribute('aria-label')===%s);m[0].click();const seen=new Set(),end=performance.now()+%d;const look=()=>{for(const a of document.getAnimations()){const p=a.effect.pseudoElement;if(p?.includes('view-transition'))seen.add(a.animationName)}performance.now()<end?requestAnimationFrame(look):done([...seen])};requestAnimationFrame(look)})"
              % (json.dumps(label), json.dumps(label), ms))


def balance_frames(label):
    return js("new Promise(done=>{const m=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim().startsWith(%s));m[0].click();const seen=[],end=performance.now()+900;const look=()=>{const v=document.querySelector('[data-balance]')?.textContent;if(v&&seen.at(-1)!==v)seen.push(v);performance.now()<end?requestAnimationFrame(look):done(seen)};requestAnimationFrame(look)})"
              % json.dumps(label))


def cool_glow():
    return js("getComputedStyle(document.querySelector('[data-glow]'),'::after').opacity")


def see(needle, seconds=45):
    deadline = time.time() + seconds
    while time.time() < deadline:
        body = text()
        if needle in body:
            return body
        time.sleep(0.3)
    raise AssertionError(f"never saw {needle!r}: {text()[:300]}")


def shot(name, wait=0.6, fit=390):
    time.sleep(wait)
    width = js("document.documentElement.scrollWidth")
    assert width <= fit, (name, width)
    step[0] += 1
    path = f"{SHOTS}/{step[0]:02d}-{name}.png"
    size = js("({width:innerWidth,height:innerHeight})")
    clip = {"x": 0, "y": 0, "scale": 1, **size}
    with open(path, "wb") as file:
        file.write(base64.b64decode(cdp("Page.captureScreenshot", format="png", clip=clip)["data"]))


def screen(width, height, mobile):
    cdp("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=2, mobile=mobile)
    time.sleep(0.4)


def phone():
    screen(390, 844, True)


def laptop():
    screen(1280, 800, False)


def in_wallet(selector):
    box = js("(()=>{const w=document.querySelector('[data-wallet]').getBoundingClientRect(),r=document.querySelector(%s).getBoundingClientRect();return {width:w.width,inside:r.left>=w.left&&r.right<=w.right&&r.top>=w.top&&r.bottom<=w.bottom}})()"
             % json.dumps(selector))
    assert box["width"] == 390 and box["inside"], (selector, box)


def drag_handle(distance):
    box = js("(()=>{const r=document.querySelector('[data-handle]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
    mouse = {"x": box["x"], "button": "left", "clickCount": 1}
    cdp("Input.dispatchMouseEvent", type="mousePressed", y=box["y"], **mouse)
    cdp("Input.dispatchMouseEvent", type="mouseMoved", y=box["y"] + distance, **mouse)
    cdp("Input.dispatchMouseEvent", type="mouseReleased", y=box["y"] + distance, **mouse)
    time.sleep(0.5)


def press(label):
    box = js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===%s);const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()"
             % json.dumps(label))
    click_at_xy(box["x"], box["y"])


def sheet_open():
    return js("!!document.querySelector('[role=dialog]')")


def request_from(name):
    use(name)
    tap("Receive")
    see("Ask them to scan")
    time.sleep(0.5)


def pay(name):
    use(name)
    tap("Pay")
    see("You are paying")
    shot(f"{name}-confirm")
    tap("Pay")
    see("Show this to them")
    time.sleep(0.5)


def verdict(expected):
    see("Done")
    found = js("document.querySelector('[data-verdict]')?.dataset.verdict")
    assert found == expected, (found, expected, text()[:300])
    time.sleep(1.2)


def accept(name):
    use(name)
    assert motions("Scan their payment", 800) == [], "a transition ran before the verdict"
    see("Paid")
    verdict("ok")
    shot(f"{name}-paid")
    tap("Done")


for tab in list_tabs():
    if any(f"localhost:{port}" in tab.get("url", "") for port in PORTS.values()):
        cdp("Target.closeTarget", targetId=tab.get("targetId") or tab.get("id"))
time.sleep(0.5)

for name, port in PORTS.items():
    tabs[name] = new_tab(f"http://localhost:{port}/")
    wait_for_load()
    phone()
    js("Promise.all(['hundi-wallet','hundi-keystore'].map(n=>new Promise(r=>{const q=indexedDB.deleteDatabase(n);q.onsuccess=q.onerror=q.onblocked=r})))")
    cdp("Page.reload", ignoreCache=True)
    wait_for_load()
    time.sleep(2)

use("supplier")
laptop()
see("Nothing here yet")
for pledge in PLEDGES:
    assert text().count(pledge) == 1, (pledge, text()[:300])
assert text().count(TAGLINE) == 1, text()[:300]
in_wallet("main")
shot("supplier-laptop", fit=1280)
phone()

use("customer")
see(TAGLINE)
for pledge in PLEDGES:
    see(pledge)
shot("customer-empty")
tap("Add money")
see("Available to add")
shot("customer-add-money")
tap("Change amounts")
tap("More Notes")
see("at least twice your notes")
shot("customer-adjust")
tap("Less Notes")
tap("Add 30 USDT")
see("Adding your money")
shot("customer-adding", 0)
see("Safety deposit", 60)
see("20 USDT")
see("2 notes of 5 USDT")
shot("customer-loaded")
assert cool_glow() == "0", "the glow should be marigold online"
tap("Account")
see("View on explorer")
shot("customer-account")
press("Copy")
see("Copied", 1)
shot("customer-copied", 0.2)
drag_handle(30)
assert sheet_open(), "a short drag should snap back"
drag_handle(160)
assert not sheet_open(), "a long drag should close the sheet"

use("stall")
see(TAGLINE)
tap("Add money")
see("Available to add")
tap("For my stall")
tap("Add 10 USDT")
see("Safety deposit", 60)
see("You can spend")

for name in tabs:
    use(name)
    see("Updated")
    tap("Refresh")
    time.sleep(1)

offline[0] = True
use("customer")
chain = js("fetch('http://localhost:8599',{method:'POST',body:'{}'}).then(()=>'reached',()=>'blocked')")
assert chain == "blocked", "the chain is still reachable"
see("Payments still work")
shot("customer-offline", 0.8)
assert cool_glow() == "1", "the glow should cool when offline"

request_from("stall")
shot("stall-request")
tap("Scan their payment")
see("Point at the code on their phone")
shot("stall-scan")
tap("Back")
see("Ask them to scan")
pay("customer")
shot("customer-payment")
frames = balance_frames("Done")
assert len(frames) > 3 and frames[0] == "$10.00" and frames[-1] == "$5.00", frames
accept("stall")
see("You received 5 USDT")
see("Settle when you have signal")
shot("stall-received")

request_from("supplier")
pay("stall")
tap("Done")
accept("supplier")

request_from("stall")
pay("customer")
tap("Done")
use("stall")
tap("Scan their payment")
see("Paid")
tap("Done")

request_from("supplier")
use("customer")
tap("Pay")
see("You are paying")
tap("Pay")
see("No note can pay")
see("What to do next")
shot("customer-guard-refuses")
tap("Done")
assert set(motions("Settings")) == {"push-out", "push-in"}
see("What Hundi stands for")
for pledge in PLEDGES:
    see(pledge)
tap("Demo: disable double-spend guard")
see("With the guard off")
shot("customer-guard-off")
assert set(motions("Back")) == {"back-out", "back-in"}
see("guard is off")

request_from("stall")
pay("customer")
tap("Done")
use("stall")
cdp("Emulation.setEmulatedMedia", features=[{"name": "prefers-reduced-motion", "value": "reduce"}])
tap("Scan their payment")
see("Refused")
verdict("seen_before")
still = js("getComputedStyle(document.querySelector('.stamp')).animationName")
assert still == "none", still
shot("stall-refused")
assert motions("Done") == [], "reduced motion must skip the slide"
cdp("Emulation.setEmulatedMedia", features=[])

use("supplier")
tap("Back")
tap("Receive")
see("Ask them to scan")
time.sleep(0.5)
pay("customer")
tap("Done")
accept("supplier")

offline[0] = False
use("supplier")
time.sleep(1)
tap("Settle")
see("Settling")
shot("supplier-settling", 0)
see("Receipt", 60)
verdict("Settled")
shot("supplier-settled")
tap("Done")
tap("activity")
see("Paid out to you")
shot("supplier-activity")

use("stall")
time.sleep(1)
tap("Settle")
see("Covered", 60)
verdict("Covered")
shot("stall-covered")
laptop()
in_wallet("[data-verdict]")
shot("stall-covered-laptop", fit=1280)
phone()
tap("Done")
tap("activity")
see("Covered by a deposit")
shot("stall-activity")

use("customer")
tap("Refresh")
see("10 USDT taken", 30)
shot("customer-after-cheat")
laptop()
tap("Account")
see("View on explorer")
in_wallet("[role=dialog]")
shot("customer-account-laptop", fit=1280)
tap("Close")
phone()

js("location.hash='#qr-test'")
see("Hundi QR test")

for target in tabs.values():
    cdp("Target.closeTarget", targetId=target)
print(f"Appendix F passed. Screenshots in {SHOTS}.")
