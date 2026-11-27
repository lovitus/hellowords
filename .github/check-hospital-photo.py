"""Compare microscope clicks on frozen hospital photos and the candidate."""
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
output = temp / "hospital-evidence"
output.mkdir(exist_ok=True)
hospital = ("e2e/hospital-radiology.spec.ts", "hospital reads the photographed microscope and keeps cancer in the index on department round trips")
journeys = [hospital]
if phase == "candidate":
    journeys.extend([
        ("e2e/hospital-radiology.spec.ts", "hospital console and couch stay in the hospital while magnifying the scanner enters radiology"),
        ("e2e/hospital-radiology.spec.ts", "hospital radiology keeps ultrasound words on the photograph through Fit, continuous zoom and hospital return"),
        ("e2e/world.spec.ts", "urban services exposes hospital, airport and office vocabulary through the transit path"),
        ("e2e/airport-bag-drop.spec.ts", "airport security checkpoint reads the front stanchion pole, looks up its collar and returns from both child scenes"),
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
        result = attempts[0]
        geometry = []
        for i, item in enumerate(result["attachments"]):
            name = item["name"]
            if name == "microscope-geometry":
                geometry.append(json.loads(attachment_bytes(item, folder)))
            elif item["contentType"] == "image/png" and (name.startswith(("microscope", "hospital")) or name == "screenshot"):
                (output / f"{phase}-{project}-{len(rows)}-{i}-{name}.png").write_bytes(attachment_bytes(item, folder))
        accepted = result["status"] == "passed"
        if phase == "baseline":
            message = "\n".join(e.get("message", "") for e in result.get("errors", []))
            accepted = bool(result["status"] == "failed" and len(geometry) == 1 and not geometry[0]["inside"]
                            and abs(geometry[0]["x"] - 523) < 1 and abs(geometry[0]["y"] - 276) < 1
                            and "dot must land on the photographed microscope" in message)
        elif title == hospital[1]:
            accepted = bool(accepted and len(geometry) == 3 and all(g["inside"] for g in geometry))
        rows.append({"project": project, "journey": title, "status": result["status"], "geometry": geometry,
                     "accepted": accepted and len(attempts) == 1 and result["retry"] == 0})
expected_exit = "1" if phase == "baseline" else "0"
receipt = {"phase": phase, "stats": report["stats"], "cases": rows,
           "accepted": sorted(seen) == sorted(cases) and all(row["accepted"] for row in rows)
                       and not report["errors"] and (folder / "exit").read_text().strip() == expected_exit}
(output / f"{phase}.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, ensure_ascii=False))
raise SystemExit(0 if receipt["accepted"] else 1)
