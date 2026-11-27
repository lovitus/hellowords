"""Run the same pharmacy journey against a frozen bundle and its successor."""
from collections import Counter, defaultdict
import json
import os
from pathlib import Path
import re
import runpy
import sys

controls = Path(__file__).resolve().parent
helpers = runpy.run_path(str(controls / "verify-office-phone.py"))
attachment_bytes = runpy.run_path(str(controls / "diagnose-office-phone.py"))["attachment_data"]
phase = sys.argv[1]
temp = Path(os.environ["RUNNER_TEMP"])
output = temp / "pharmacy-evidence"
output.mkdir(exist_ok=True)
hospital = "e2e/hospital-radiology.spec.ts"
pharmacy = "hospital pharmacy reads the photographed rolling cart and keeps amoxicillin in the index on the dispensing cabinet round trip"
cart_error = "the rolling cart dot must land on the metal frame of the photographed cart at the front right"
photo_sha = "6bb0f995f40e5c980e1a191168eff6d25647b24f58289c5845ead2277eb651b3"
journeys = [(hospital, pharmacy)]
if phase == "candidate":
    journeys.extend([
        (hospital, "hospital reads the photographed microscope and keeps cancer in the index on department round trips"),
        (hospital, "pathology lab reads the photographed microtome and keeps histopathology in the index on workstation round trips"),
        ("e2e/world.spec.ts", "urban services exposes hospital, airport and office vocabulary through the transit path"),
        ("e2e/office-conference.spec.ts", helpers["RETURN"]),
    ])
cases = [(project, file, title) for project in ("chromium", "mobile-chromium") for file, title in journeys]
helpers["run_browser"](phase, temp, cases)
folder = temp / phase
report = json.loads((folder / "results.json").read_bytes())
seen = []
rows = []
for suite in report["suites"]:
    for case, test in helpers["report_cases"](suite):
        seen.append(case)
        project, _, title = case
        attempts = test["results"]
        row = {"project": project, "journey": title, "attempts": len(attempts), "accepted": False}
        rows.append(row)
        if len(attempts) != 1:
            continue
        result = attempts[0]
        json_items = defaultdict(list)
        attachments = Counter()
        for item in result["attachments"]:
            name = item["name"]
            mime = item["contentType"]
            if not re.fullmatch(r"[a-zA-Z0-9_-]+", name) or mime not in ("image/png", "application/json"):
                continue
            data = attachment_bytes(item, folder)
            extension = "json" if mime == "application/json" else "png"
            if extension == "json":
                json_items[name].append(json.loads(data))
            elif not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("Invalid image evidence")
            attachments[name] += 1
            (output / f"{phase}-{project}-{len(rows)}-{name}-{attachments[name]}.{extension}").write_bytes(data)
        accepted = result["status"] == "passed" and not result["errors"]
        cart = json_items["rolling-cart-geometry"]
        if phase == "baseline":
            errors = result["errors"]
            accepted = (
                result["status"] == "failed" and len(errors) == 1
                and cart_error in errors[0].get("message", "")
                and len(cart) == 1 and not cart[0]["inside"] and cart[0]["sha256"] == photo_sha
                and abs(cart[0]["x"] - 1048) < 1 and abs(cart[0]["y"] - 508) < 1
                and attachments["rolling-cart-view"] == 1
            )
        elif title == pharmacy:
            accepted = accepted and len(cart) >= 2 and all(dot["inside"] and dot["sha256"] == photo_sha for dot in cart)
            for name in ("rolling-cart-view", "rolling-cart-painted-card", "rolling-cart-dot-geometry", "rolling-cart-dot-card"):
                accepted = accepted and attachments[name] == len(cart)
            accepted = accepted and attachments["amoxicillin-index"] == 1
            for subject, scene in [
                ("cart-bottle", "hospital-pharmacy"),
                ("pharmacy-counting-tray", "tablet-counting-bench"),
                ("counting-bench-blister-pack", "tablet-counting-bench"),
            ]:
                gestures = json_items[f"{subject}-gesture"]
                accepted = accepted and len(gestures) == 1 and gestures[0]["scene"] == scene and attachments[f"{subject}-end"] == 1
            retreat = json_items["counting-bench-retreat"]
            accepted = accepted and len(retreat) == 1 and retreat[0]["returned"] == "hospital-pharmacy"
        row.update(status=result["status"], retry=result["retry"], attachments=dict(attachments),
                   accepted=bool(accepted and result["retry"] == 0))

receipt = {
    "phase": phase, "product": os.environ["PRODUCT" if phase == "candidate" else "BASELINE"],
    "stats": report["stats"], "cases": rows,
    "accepted": sorted(seen) == sorted(cases) and all(row["accepted"] for row in rows)
                and not report["errors"] and (folder / "exit").read_text().strip() == ("1" if phase == "baseline" else "0"),
}
(output / f"{phase}.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, ensure_ascii=False))
raise SystemExit(0 if receipt["accepted"] else 1)
