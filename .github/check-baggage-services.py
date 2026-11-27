"""Compare the airport baggage service journey on two frozen production bundles."""
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
output = temp / "baggage-evidence"
output.mkdir(exist_ok=True)
hospital = "e2e/hospital-radiology.spec.ts"
pharmacy = "hospital pharmacy reads the photographed rolling cart and keeps amoxicillin in the index on the dispensing cabinet round trip"
airport = "baggage services opens the wooden counter and the open suitcase, then restores both parent scenes"
desk_error = "magnifying the photographed service-desk-counter must leave baggage-service-desk open"
claim_photo = "/scenes/baggage-claim-premium-v1.jpg"
desk_photo = "/scenes/baggage-service-desk-premium-v1.jpg"
table_photo = "/scenes/suitcase-packing-table-premium-v1.jpg"
word_photos = (
    ("desk bell", 1, "e6960ee5da74727d72647a1483f2ccc58794a636778c82ba316b7df30c987f13"),
    ("T-shirt", 1, "bb673805d31f21009b73821a8ecb78cab84b5982fe2f7d0b4665c9b0171d4f38"),
    ("baggage services desk", 1, "867f17349b32d7c2802e2710a9b765117e50480301c30e0dea5ee7a4f10457c0"),
)
journeys = [("e2e/baggage-services.spec.ts", airport)]
if phase == "candidate":
    journeys.extend([
        ("e2e/airport-bag-drop.spec.ts", "airport check-in opens the nearest self-service kiosk from its dot and reads the card reader without moving the photograph"),
        (hospital, pharmacy),
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
        screenshots = Counter()
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
            else:
                if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("Invalid image evidence")
                screenshots[name] += 1
            attachments[name] += 1
            (output / f"{phase}-{project}-{len(rows)}-{name}-{attachments[name]}.{extension}").write_bytes(data)
        accepted = result["status"] == "passed" and not result["errors"]
        counter = json_items["service-desk-counter-gesture"]
        if phase == "baseline":
            errors = result["errors"]
            accepted = (
                result["status"] == "failed" and len(errors) == 1
                and desk_error in errors[0].get("message", "")
                and len(counter) == 1 and counter[0]["scene"] == "baggage-claim"
                and counter[0]["asset"] == claim_photo
                and (counter[0]["x"], counter[0]["y"]) == (260, 340)
                and counter[0]["scale"] >= 3.4 and screenshots["service-desk-counter-end"] == 1
            )
        elif title == airport:
            for name, asset, xy, destination in (
                ("service-desk-counter", claim_photo, (260, 340), "baggage-service-desk"),
                ("open-suitcase-shell", desk_photo, (1260, 744), "suitcase-packing-table"),
                ("folded-shirt-fabric", table_photo, (813, 667), "suitcase-packing-table"),
            ):
                gestures = json_items[f"{name}-gesture"]
                accepted = accepted and len(gestures) == 1 and screenshots[f"{name}-end"] == 1
                if len(gestures) == 1:
                    gesture = gestures[0]
                    accepted = accepted and (gesture["asset"], gesture["scene"]) == (asset, destination)
                    accepted = accepted and (gesture["x"], gesture["y"]) == xy and gesture["screen"]["visible"]
                    if name == "folded-shirt-fabric":
                        accepted = accepted and gesture["scale"] >= 3.4
            for word, count, digest in word_photos:
                prefix = word.replace(" ", "-")
                readings = json_items[f"{prefix}-geometry"]
                dots = json_items[f"{prefix}-dot-geometry"]
                accepted = accepted and len(readings) == len(dots) == count
                accepted = accepted and all(r["inside"] and r["visible"] and r["word"] == word
                                            and r["sha256"] == digest for r in readings)
                accepted = accepted and all(dot["dotExposed"] for dot in dots)
                accepted = accepted and all(screenshots[f"{prefix}-{suffix}"] == count
                                            for suffix in ("view", "painted-card", "dot-card"))
            for name in ("desk-bell-arrival", "desk-bell-return", "shirt-arrival", "claim-counter-return"):
                accepted = accepted and all(screenshots[f"{name}-{suffix}"] == 1 for suffix in ("before", "card"))
            for name in ("packing-table-return", "baggage-service-desk-return"):
                returns = json_items[name]
                accepted = accepted and len(returns) == 1 and isinstance(returns[0], list) and len(returns[0]) >= 2
                if accepted:
                    scales = returns[0]
                    accepted = all(type(value) in (int, float) for value in scales)
                    accepted = accepted and any(0.74 < value < scales[0] * 0.9 for value in scales[1:])
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
