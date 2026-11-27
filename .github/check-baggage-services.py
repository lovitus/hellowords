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
        counter = json_items["service-desk-counter-gesture"]
        if phase == "baseline":
            errors = result["errors"]
            accepted = (
                result["status"] == "failed" and len(errors) == 1
                and desk_error in errors[0].get("message", "")
                and len(counter) == 1 and counter[0]["scene"] == "baggage-claim"
                and counter[0]["asset"] == "/scenes/baggage-claim-premium-v1.jpg"
                and (counter[0]["x"], counter[0]["y"]) == (260, 340)
                and counter[0]["scale"] >= 3.4 and attachments["service-desk-counter-end"] == 1
            )
        elif title == airport:
            accepted = accepted and len(counter) == 1 and counter[0]["scene"] == "baggage-service-desk"
            accepted = accepted and attachments["service-desk-counter-end"] == 1
            suitcase = json_items["open-suitcase-shell-gesture"]
            accepted = accepted and len(suitcase) == 1 and suitcase[0]["scene"] == "suitcase-packing-table"
            accepted = accepted and attachments["open-suitcase-shell-end"] == 1
            # Both parent photographs must once again have a pointable object.
            for word in ("counter-bell", "baggage-services-desk"):
                readings = json_items[f"{word}-geometry"]
                accepted = accepted and readings and all(reading["inside"] for reading in readings)
                accepted = accepted and attachments[f"{word}-dot-card"] == len(readings)
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
