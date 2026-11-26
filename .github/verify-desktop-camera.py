"""Retain only the two requested desktop outcomes and their sanitized diagnostics."""
import json
from pathlib import Path
import runpy
import sys


tools = runpy.run_path(str(Path(__file__).with_name("diagnose-office-phone.py")))
out = tools["OUT"]
folder = tools["TEMP"] / "desktop"
folder.mkdir()
cases = {
    ("chromium", "e2e/cache-motion.spec.ts", "continuous wheel input advances in monotonic animation frames without a scale jump"): "wheel",
    ("chromium", "e2e/continuous-semantic-zoom.spec.ts", "Apartment handoff settles to the complete child before a fresh outward gesture can exit"): "handoff",
}
selected = folder / "cases.txt"
selected.write_text("".join(f"[{p}] > {f} > {t}\n" for p, f, t in cases))
code = tools["execute"]([
    "./node_modules/.bin/playwright", "test", "--test-list", str(selected), "--project=chromium",
    "--retries=0", "--reporter=json", "--output", str(folder / "test-results"),
], folder / "browser.log", PLAYWRIGHT_JSON_OUTPUT_FILE=str(folder / "results.json"))
rows = {key: {"project": key[0], "file": key[1], "title": key[2], "attempts": [], "accepted": False} for key in cases}
summary = {"exit": code, "cases": list(rows.values()), "extraCases": [], "accepted": False}
try:
    report = json.loads((folder / "results.json").read_bytes())
    summary["reportErrors"] = [tools["details"](e.get("message", ""), e.get("stack", ""), e.get("location"))
                               for e in report["errors"]]
    summary["stats"] = {k: report["stats"][k] for k in ("expected", "unexpected", "skipped", "flaky")}
    seen = set()
    for key, test in tools["VERIFY"]["report_cases"](report):
        if key not in rows or key in seen:
            summary["extraCases"].append([tools["text"](part) for part in key])
            continue
        seen.add(key)
        row = rows[key]
        for index, result in enumerate(test["results"], 1):
            primary = result.get("error") or {}
            errors = result["errors"] or ([primary] if primary else [])
            attempt = {"status": result["status"], "retry": result["retry"],
                       "errors": [tools["details"](e.get("message", ""), primary.get("stack", ""), e.get("location")) for e in errors]}
            row["attempts"].append(attempt)
            record_dir = out / f"{cases[key]}-{index}"
            record_dir.mkdir()
            attempt["screenshots"] = [f"{record_dir.name}/{name}" for name in tools["save_attachments"](result, folder, record_dir)]
        row["accepted"] = (test["expectedStatus"] == "passed" and test["status"] == "expected"
                           and len(row["attempts"]) == 1 and attempt["status"] == "passed"
                           and attempt["retry"] == 0 and not attempt["errors"])
    summary["accepted"] = (code == 0 and not summary["reportErrors"] and not summary["extraCases"]
                           and summary["stats"] == {"expected": 2, "unexpected": 0, "skipped": 0, "flaky": 0}
                           and all(row["accepted"] for row in rows.values()))
except (KeyError, TypeError, ValueError, OSError) as error:
    summary["reportError"] = type(error).__name__
    summary["processError"] = tools["process_error"](folder / "browser.log")
tools["save"](out / "desktop.json", summary)
sys.exit(0 if summary["accepted"] else 1)
