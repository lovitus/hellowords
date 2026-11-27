"""Run the same kiosk click on the frozen baseline and the candidate."""
import json
import os
from pathlib import Path
import runpy
import sys

controls = Path(__file__).resolve().parent
helpers = runpy.run_path(str(controls / "verify-office-phone.py"))
attachment_bytes = runpy.run_path(str(controls / "diagnose-office-phone.py"))["attachment_data"]
phase = sys.argv[1]
temp = Path(os.environ["RUNNER_TEMP"])
output = temp / "kiosk-evidence"
output.mkdir(exist_ok=True)
kiosk = ("e2e/airport-bag-drop.spec.ts", "airport check-in opens the nearest self-service kiosk from its dot and reads the card reader without moving the photograph")
journeys = [kiosk]
if phase == "candidate":
    journeys.extend([
        ("e2e/airport-bag-drop.spec.ts", "airport bag drop keeps photographed scale, platform and suitcase words on their objects and zooms back to check-in"),
        ("e2e/office-conference.spec.ts", helpers["RETURN"]),
        ("e2e/world.spec.ts", "home atlas district journey photo anchors open the preparation room and the school gate enters campus"),
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
        result = attempts[0]
        geometry = None
        for item in result["attachments"]:
            name = item["name"]
            if name == "check-in-kiosk-dot-geometry":
                geometry = json.loads(attachment_bytes(item, folder))
            elif item["contentType"] == "image/png" and (name.startswith("check-in-") or name == "screenshot"):
                (output / f"{phase}-{project}-{len(rows)}-{name}.png").write_bytes(attachment_bytes(item, folder))
        accepted = result["status"] == "passed"
        if phase == "baseline":
            message = "\n".join(e.get("message", "") for e in result.get("errors", []))
            accepted = bool(result["status"] == "failed" and geometry and not geometry["onFront"]
                            and abs(geometry["photoX"] - 850) < 1 and abs(geometry["photoY"] - 700) < 1
                            and "dot must land on the photographed front" in message)
        rows.append({"project": project, "journey": title, "status": result["status"], "geometry": geometry,
                     "accepted": accepted and len(attempts) == 1 and result["retry"] == 0})
expected_exit = "1" if phase == "baseline" else "0"
receipt = {"phase": phase, "stats": report["stats"], "cases": rows,
           "accepted": sorted(seen) == sorted(cases) and all(row["accepted"] for row in rows)
                       and not report["errors"] and (folder / "exit").read_text().strip() == expected_exit}
(output / f"{phase}.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, ensure_ascii=False))
raise SystemExit(0 if receipt["accepted"] else 1)
