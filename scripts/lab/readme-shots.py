# Shoots the real app at the iPhone 17 Pro's screen size and saves each screen in a phone shell, for the README.
# Usage: bun run lab, then bun run lab:readme. Pass through browser-harness.
import base64
import json
import os
import time

OUT = "docs/assets"
WORK = os.path.abspath(".lab/readme")
os.makedirs(WORK, exist_ok=True)
WIDTH, HEIGHT = 402, 874
PORTS = {"alice": 5191, "bob": 5192}
SAFE_AREA = "main{padding-top:64px!important;padding-bottom:38px!important}"
offline = [False]
tabs = {}


def use(name):
    switch_tab(tabs[name])
    cdp("Emulation.setDeviceMetricsOverride", width=WIDTH, height=HEIGHT, deviceScaleFactor=3, mobile=True)
    cdp("Emulation.setFocusEmulationEnabled", enabled=True)
    cdp("Network.enable")
    cdp("Network.setBlockedURLs", urls=["*:8599*"] if offline[0] else [])
    js("Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>%s});dispatchEvent(new Event('%s'))"
       % (("false", "offline") if offline[0] else ("true", "online")))
    js("if(!document.querySelector('#safe')){const s=document.createElement('style');s.id='safe';s.textContent=%s;document.head.append(s)}" % json.dumps(SAFE_AREA))
    time.sleep(0.3)


def text():
    return " ".join(js("document.body?.innerText ?? ''").split())


def tap(label):
    result = js("(()=>{const m=[...document.querySelectorAll('button,label')].filter(b=>b.textContent.trim().startsWith(%s)||b.getAttribute('aria-label')===%s);if(!m[0])return 'MISSING';m[0].click();return 'ok'})()"
                % (json.dumps(label), json.dumps(label)))
    assert result == "ok", (label, text()[:300])
    time.sleep(0.5)


def see(needle, seconds=60):
    deadline = time.time() + seconds
    while time.time() < deadline:
        if needle in text():
            return
        time.sleep(0.3)
    raise AssertionError(f"never saw {needle!r}: {text()[:300]}")


def capture(name, wait=1.4):
    time.sleep(wait)
    data = cdp("Page.captureScreenshot", format="png", clip={"x": 0, "y": 0, "width": WIDTH, "height": HEIGHT, "scale": 1})["data"]
    with open(f"{WORK}/{name}.png", "wb") as file:
        file.write(base64.b64decode(data))


SIGNAL = '<svg width="20" height="13" viewBox="0 0 20 13"><rect y="9" width="3.6" height="4" rx="1"/><rect x="5.4" y="6" width="3.6" height="7" rx="1"/><rect x="10.8" y="3" width="3.6" height="10" rx="1"/><rect x="16.2" width="3.6" height="13" rx="1"/></svg>'
WIFI = '<svg width="19" height="14" viewBox="0 0 19 14"><path d="M9.5 3c2.7 0 5.2 1 7 2.8l1.3-1.4A12 12 0 0 0 9.5 1 12 12 0 0 0 1.2 4.4l1.3 1.4A10 10 0 0 1 9.5 3zm0 4.2c1.6 0 3 .6 4.1 1.6l1.3-1.4a8 8 0 0 0-10.8 0l1.3 1.4a6 6 0 0 1 4.1-1.6zm0 4.2-2.5-2.6a3.6 3.6 0 0 1 5 0z"/></svg>'
PLANE = '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>'
BATTERY = '<svg width="29" height="14" viewBox="0 0 29 14"><rect x=".5" y=".5" width="24" height="13" rx="4" fill="none" stroke="#fff" stroke-opacity=".45"/><rect x="2" y="2" width="21" height="10" rx="2.6"/><path d="M26 4.6v4.8c1-.4 1.7-1.3 1.7-2.4S27 5 26 4.6z" fill-opacity=".5"/></svg>'

SHELL = """<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{background:transparent}
body{width:470px;height:930px;padding:12px 18px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}
.rim{position:relative;width:434px;height:906px;padding:4px;border-radius:72px;background:linear-gradient(135deg,#8d9199 0%,#4d5159 22%,#6f737b 50%,#3f4349 78%,#9a9ea6 100%)}
.bezel{width:426px;height:898px;padding:12px;border-radius:68px;background:#050506}
.screen{position:relative;width:402px;height:874px;border-radius:56px;overflow:hidden;background:#0d1014}
.screen img{display:block;width:402px;height:874px}
.island{position:absolute;left:138px;top:11px;width:126px;height:37px;border-radius:19px;background:#000}
.time{position:absolute;left:52px;top:18px;color:#fff;font-size:17px;font-weight:600;letter-spacing:-.2px}
.icons{position:absolute;right:30px;top:19px;display:flex;align-items:center;gap:6px;fill:#fff}
.btn{position:absolute;width:4px;border-radius:2px;background:linear-gradient(180deg,#7c8088,#4a4e55)}
</style></head><body><div class="rim">
<i class="btn" style="left:-3px;top:150px;height:34px"></i><i class="btn" style="left:-3px;top:212px;height:62px"></i><i class="btn" style="left:-3px;top:288px;height:62px"></i><i class="btn" style="right:-3px;top:236px;height:98px"></i>
<div class="bezel"><div class="screen"><img src="__IMG__.png"><div class="island"></div><div class="time">__TIME__</div><div class="icons">__ICONS__</div></div></div>
</div></body></html>"""


def shell(name, icons):
    with open(f"{WORK}/{name}.html", "w", encoding="utf-8") as file:
        file.write(SHELL.replace("__IMG__", name).replace("__ICONS__", icons).replace("__TIME__", time.strftime("%H:%M")))
    target = new_tab(f"file://{WORK}/{name}.html")
    wait_for_load()
    cdp("Emulation.setDeviceMetricsOverride", width=470, height=930, deviceScaleFactor=2, mobile=False)
    cdp("Emulation.setDefaultBackgroundColorOverride", color={"r": 0, "g": 0, "b": 0, "a": 0})
    time.sleep(1)
    data = cdp("Page.captureScreenshot", format="png", clip={"x": 0, "y": 0, "width": 470, "height": 930, "scale": 1})["data"]
    with open(f"{OUT}/phone-{name}.png", "wb") as file:
        file.write(base64.b64decode(data))
    cdp("Target.closeTarget", targetId=target)


for tab in list_tabs():
    if any(f"localhost:{port}" in tab.get("url", "") for port in PORTS.values()):
        cdp("Target.closeTarget", targetId=tab.get("targetId") or tab.get("id"))
time.sleep(0.5)

for name, port in PORTS.items():
    tabs[name] = new_tab(f"http://localhost:{port}/")
    wait_for_load()
    js("Promise.all(['hundi-wallet','hundi-keystore'].map(n=>new Promise(r=>{const q=indexedDB.deleteDatabase(n);q.onsuccess=q.onerror=q.onblocked=r})))")
    cdp("Page.reload", ignoreCache=True)
    wait_for_load()
    time.sleep(2)

use("alice")
tap("Add money")
see("Available to add")
tap("Add 30 USDT")
see("Available offline")
see("Safety deposit")
use("alice")
capture("balance", 2)

use("bob")
tap("Add money")
see("Available to add")
tap("For my shop")
tap("Add 10 USDT")
see("Safety deposit")
for name in tabs:
    use(name)
    tap("Refresh")
    time.sleep(1.2)

offline[0] = True
use("bob")
tap("Receive")
see("Ask them to scan")
time.sleep(0.6)
use("alice")
tap("Pay")
see("You are paying")
tap("Pay")
see("Show this to them")
time.sleep(0.6)
use("bob")
tap("Scan their payment")
see("Done")
use("bob")
capture("paid", 1.8)
tap("Done")
see("5 USDT pending")
tap("activity")
see("Pending")
use("bob")
capture("offline", 1.6)

online_icons = SIGNAL + WIFI + BATTERY
shell("balance", online_icons)
shell("offline", PLANE + BATTERY)
shell("paid", PLANE + BATTERY)

for target in tabs.values():
    cdp("Target.closeTarget", targetId=target)
print(f"Phone images in {OUT}.")
