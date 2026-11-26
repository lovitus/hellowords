"""Keep the original results and record the two photo clicks against the same build."""
import json
import os
from pathlib import Path
import runpy

controls = Path(__file__).resolve().parent
verify = runpy.run_path(str(controls / "verify-office-phone.py"))
attachment_data = runpy.run_path(str(controls / "diagnose-office-phone.py"))["attachment_data"]
temp = Path(os.environ["RUNNER_TEMP"])
output = temp / "gate-evidence"
output.mkdir()
case_title = "home atlas district journey photo anchors open the preparation room and the school gate enters campus"
cases = [(p, "e2e/world.spec.ts", case_title) for p in ("chromium", "mobile-chromium")]
verify["run_browser"]("gate", temp, cases)
folder = temp / "gate"
report = json.loads((folder / "results.json").read_bytes())
results = []
for suite in report["suites"]:
    for case, test in verify["report_cases"](suite):
        project = case[0]
        if case not in cases:
            raise ValueError("Unexpected test")
        attempts = test["results"]
        if len(attempts) != 1 or attempts[0]["retry"] != 0:
            raise ValueError("Unexpected attempt count")
        attempt = attempts[0]
        row = {"project": project, "status": attempt["status"], "gatePress": None, "screenshots": []}
        results.append(row)
        for attachment in attempt["attachments"]:
            name = attachment["name"]
            if name == "school-gate-press" and attachment["contentType"] == "application/json":
                row["gatePress"] = json.loads(attachment_data(attachment, folder))
            elif name in {"preparation-room-on-map", "campus-from-school-gate", "screenshot"} and attachment["contentType"] == "image/png":
                data = attachment_data(attachment, folder)
                if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("Expected screenshot")
                (output / f"{project}-{name}.png").write_bytes(data)
                row["screenshots"].append(name)

complete = (
    (folder / "exit").read_text().strip() == "0" and not report["errors"]
    and sorted(r["project"] for r in results) == sorted(c[0] for c in cases)
    and all(r["status"] == "passed"
            and r["gatePress"] and r["gatePress"]["targetScene"] == "school-campus"
            and set(r["screenshots"]) == {"preparation-room-on-map", "campus-from-school-gate"}
            for r in results)
)
original = json.loads((temp / "original/candidate.json").read_bytes())
receipt = {"build": os.environ["PRODUCT"], "originalRun": os.environ["SOURCE_RUN"],
           "originalStats": original["stats"], "supplementalCases": results, "accepted": complete}
(output / "gate.json").write_text(json.dumps(receipt, indent=2) + "\n")
raise SystemExit(0 if complete else 1)
