# Taps the real wallet inside the iOS Simulators through safaridriver, and saves each screen in a device frame.
# Usage: bun run lab --ios, then python3 scripts/lab/sim-drive.py. Needs Pillow. Local fork only.
import json
import os
import subprocess
import time
import urllib.request

from PIL import Image, ImageDraw

OUT = ".lab/shots/sim"
ROLES = {
    "customer": ("iPhone 17 Pro", 5191, 4723),
    "stall": ("iPhone 17e", 5192, 4724),
}
GUARD = "Demo: disable double-spend guard"
os.makedirs(OUT, exist_ok=True)


def run(*command):
    return subprocess.run(command, check=True, capture_output=True, text=True).stdout


def udid(name):
    for line in run("xcrun", "simctl", "list", "devices", "available").splitlines():
        if f"{name} (" in line:
            return line.split("(")[-2].split(")")[0]
    raise AssertionError(f"no simulator named {name}")


def call(port, path, body=None, method="POST"):
    request = urllib.request.Request(
        f"http://localhost:{port}{path}",
        data=None if body is None else json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)["value"]


class Phone:
    def __init__(self, role):
        name, self.web, self.port = ROLES[role]
        self.device = udid(name)
        self.role = role
        self.driver = subprocess.Popen(["safaridriver", "-p", str(self.port)])
        time.sleep(1.5)
        for setting in (["ui", self.device, "appearance", "dark"], self.status_bar(False)):
            run("xcrun", "simctl", *setting)
        self.session = call(self.port, "/session", {"capabilities": {"alwaysMatch": {
            "browserName": "safari",
            "platformName": "iOS",
            "safari:deviceUDID": self.device,
            "safari:useSimulator": True,
        }}})["sessionId"]
        self.base = f"/session/{self.session}"

    def status_bar(self, airplane):
        common = ["status_bar", self.device, "override", "--time", "9:41", "--batteryState", "charged", "--batteryLevel", "100"]
        radios = ["--dataNetwork", "hide", "--wifiMode", "failed", "--cellularMode", "notSupported"] if airplane else ["--dataNetwork", "wifi", "--wifiBars", "3", "--cellularBars", "4"]
        return common + radios

    def js(self, script):
        return call(self.port, f"{self.base}/execute/sync", {"args": [], "script": script})

    def open(self):
        call(self.port, f"{self.base}/url", {"url": f"http://localhost:{self.web}/"})
        call(self.port, f"{self.base}/execute/async", {"args": [], "script": "const done=arguments[0];Promise.all(['hundi-wallet','hundi-keystore'].map(n=>new Promise(r=>{const q=indexedDB.deleteDatabase(n);q.onsuccess=q.onerror=q.onblocked=r}))).then(()=>done(1))"})
        call(self.port, f"{self.base}/refresh", {})
        time.sleep(2)

    def text(self):
        return " ".join(self.js("return document.body?.innerText ?? ''").split())

    def see(self, needle, seconds=60):
        deadline = time.time() + seconds
        while time.time() < deadline:
            if needle in self.text():
                return
            time.sleep(0.3)
        raise AssertionError(f"{self.role} never saw {needle!r}: {self.text()[:300]}")

    def tap(self, label):
        found = self.js("const m=[...document.querySelectorAll('button,label')].filter(b=>b.textContent.trim().startsWith(%s)||b.getAttribute('aria-label')===%s);if(!m[0])return false;m[0].click();return true" % (json.dumps(label), json.dumps(label)))
        assert found, (label, self.text()[:300])
        time.sleep(0.6)

    def network(self, online):
        self.js("Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>%s});dispatchEvent(new Event('%s'))" % (("true", "online") if online else ("false", "offline")))
        run("xcrun", "simctl", *self.status_bar(not online))
        time.sleep(0.8)

    def shot(self, name, wait=1.4):
        time.sleep(wait)
        raw = f"{OUT}/{name}.raw.png"
        run("xcrun", "simctl", "io", self.device, "screenshot", raw)
        frame(raw, f"{OUT}/{name}.png")
        os.remove(raw)

    def close(self):
        self.driver.terminate()


def frame(source, target):
    screen = Image.open(source).convert("RGBA")
    width, height = screen.size
    radius, edge, rim = 165, 42, 7
    corners = Image.new("L", screen.size, 0)
    ImageDraw.Draw(corners).rounded_rectangle((0, 0, width - 1, height - 1), radius, fill=255)
    body = (width + 2 * edge, height + 2 * edge)
    device = Image.new("RGBA", body, (0, 0, 0, 0))
    draw = ImageDraw.Draw(device)
    draw.rounded_rectangle((0, 0, body[0] - 1, body[1] - 1), radius + edge, fill=(74, 76, 82, 255))
    draw.rounded_rectangle((rim, rim, body[0] - 1 - rim, body[1] - 1 - rim), radius + edge - rim, fill=(10, 10, 12, 255))
    device.paste(screen, (edge, edge), corners)
    device.save(target)


customer = Phone("customer")
stall = Phone("stall")
customer.open()
stall.open()

customer.see("Money that works")
customer.shot("01-welcome")
customer.tap("Add money")
customer.see("Available to add")
customer.tap("Add 30 USDT")
customer.see("Available offline", 90)
customer.shot("02-home")
customer.tap("Wallet")
customer.see("View on explorer")
customer.shot("03-wallet-sheet")
customer.tap("Close")
time.sleep(0.5)

stall.see("Money that works")
stall.tap("Add money")
stall.see("Available to add")
stall.tap("For my stall")
stall.tap("Add 10 USDT")
stall.see("Safety deposit", 90)
customer.tap("Refresh")
stall.tap("Refresh")
time.sleep(1.5)

customer.network(False)
stall.network(False)
customer.see("Payments still work")
customer.shot("04-offline")


def pay():
    stall.tap("Receive")
    stall.see("Ask them to scan")
    time.sleep(0.6)
    customer.tap("Pay")
    customer.see("You are paying")


pay()
stall.shot("05-request")
customer.shot("06-confirm")
customer.tap("Pay")
customer.see("Show this to them")
customer.shot("07-payment")
customer.tap("Done")
stall.tap("Scan their payment")
stall.see("Done")
stall.shot("08-paid", 1.6)
stall.tap("Done")
stall.tap("activity")
stall.see("Pending")
stall.see("From ")
stall.shot("08b-pending")
stall.tap("tokens")
customer.tap("activity")
customer.see("To ")
customer.shot("08c-sent")
customer.tap("tokens")

pay()
customer.tap("Pay")
customer.see("Show this to them")
customer.tap("Done")
stall.tap("Scan their payment")
stall.see("Done")
stall.tap("Done")

customer.tap("Settings")
customer.see("What Hundi stands for")
customer.shot("09-settings")
customer.tap(GUARD)
customer.tap("Back")
customer.see("guard is off")
pay()
customer.tap("Pay")
customer.see("Show this to them")
customer.tap("Done")
stall.tap("Scan their payment")
stall.see("Refused")
stall.shot("10-refused", 1.6)
stall.tap("Done")

stall.network(True)
customer.network(True)
stall.tap("Claim")
stall.see("Receipt", 90)
stall.shot("11-settled", 1.6)
stall.tap("Done")
stall.tap("activity")
stall.see("Confirmed")
stall.shot("12-activity")

customer.close()
stall.close()
print(f"Simulators passed. Screens in {OUT}.")
