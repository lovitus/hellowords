"""Record exact old/new browser outcomes and every original scene performance limit."""
import json
import math
import os
from pathlib import Path
import re
import runpy
import shutil
import sys


helpers = runpy.run_path(str(Path(__file__).with_name("diagnose-office-phone.py")))
verify = helpers["VERIFY"]
temp, out = helpers["TEMP"], helpers["OUT"]
desktop, phone = verify["DESKTOP"], verify["PHONE"]
motion = "e2e/cache-motion.spec.ts"
reverse_tab = (phone, "e2e/world.spec.ts", "portrait bilingual apartment returns keyboard focus from living room to the apartment word")
pointer = (desktop, motion, "wheel zoom keeps the photographed point beneath the pointer throughout the gesture")
assertions = {
    reverse_tab: "Shift+Tab from living room returns to the apartment word",
    pointer: "the photographed point stays within one CSS pixel of the pointer in every frame",
}
regressions = [
    (desktop, motion, "continuous wheel input advances in monotonic animation frames without a scale jump"),
    (desktop, "e2e/label-zoom-retention.spec.ts", verify["APARTMENT"]),
    (desktop, "e2e/continuous-semantic-zoom.spec.ts", "Apartment handoff settles to the complete child before a fresh outward gesture can exit"),
    (desktop, motion, "root portal click settles apartment before a deliberate third-step exit"),
    (desktop, verify["OFFICE"], verify["RETURN"]), verify["PHONE_RETURN"],
    (desktop, motion, "a decoded parent stays hot when entering a child and zooming back out"),
    (desktop, motion, "a warm adjacent transition avoids the loader, while outrunning the neighbor cache reveals it"),
    (phone, motion, "mobile keeps its warmed child and parent transitions free of a loader flash"),
    (desktop, motion, "reduced motion and keyboard navigation preserve the warm parent path"),
]
gates = ("source", "dependencies", "chromium", "download", "baseline_manifest", "red", "build",
         "production", "green", "performance", "samples", "types", "lint", "domain")


def write(path, value):
    helpers["save"](path, value)


def details(error):
    return helpers["details"](error.get("message", ""), error.get("stack", ""), error.get("location"))


def headline(error):
    text = helpers["ANSI"].sub("", error.get("message", ""))
    return text.lstrip().partition("\n")[0].removeprefix("Error: ").strip()


def retain_attempt(phase, number, case, result, folder):
    old = phase == "baseline"
    primary = result.get("error") or {}
    errors = result["errors"]
    receipts = []
    record = {"status": result["status"], "retry": result["retry"], "attachments": receipts,
              "errors": [details(error) for error in errors], "accepted": False}
    dest = out / phase / f"case-{number}"
    dest.mkdir(parents=True)
    for index, item in enumerate(result["attachments"], 1):
        name, mime = item["name"], item["contentType"]
        if name == "error-context" and case == reverse_tab:
            context = helpers["attachment_data"](item, folder).decode(errors="replace")
            record["activeInFailureSnapshot"] = [helpers["text"](line) for line in context.splitlines() if "[active]" in line][:5]
        if mime not in {"image/png", "application/json"} or not re.fullmatch(r"[\w .-]{1,100}", name):
            continue
        data = helpers["attachment_data"](item, folder)
        if mime == "application/json":
            body = json.loads(data)
            path = dest / f"{index:02d}-{name}.json"
            if name == "wheel-pointer-trajectory":
                drifts = [frame["drift"] for frame in body]
                scales = [frame["scale"] for frame in body]
                if not all(math.isfinite(v) for v in [*drifts, *scales]) or not drifts:
                    raise ValueError("Invalid wheel trajectory")
                record["wheel"] = {"frames": len(drifts), "distinctScales": len(set(scales)), "finalScale": scales[-1],
                                   "peakDriftCssPx": max(drifts), "finalDriftCssPx": drifts[-1]}
        else:
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("Invalid browser screenshot")
            path = dest / f"{index:02d}-{name}.png"
        path.write_bytes(data)
        receipts.append({"name": name, "file": path.relative_to(out).as_posix()})
    error_ok = ([headline(error) for error in errors] == [assertions[case]] and headline(primary) == assertions[case]
                if old else not errors and not primary)
    evidence_ok = True
    if case == pointer:
        wheel = record.get("wheel", {})
        evidence_ok = (len([a for a in receipts if a["name"] == "wheel-pointer-trajectory"]) == 1
                       and wheel.get("distinctScales", 0) > 2 and wheel["finalScale"] > 1.5 and wheel["finalDriftCssPx"] < 1
                       and (wheel["peakDriftCssPx"] >= 1 if old else wheel["peakDriftCssPx"] < 1))
    record["accepted"] = bool(error_ok and evidence_ok and result["retry"] == 0
                              and result["status"] == ("failed" if old else "passed"))
    return record


def browser(phase):
    old = phase == "baseline"
    cases = [*assertions] if old else [*assertions, *regressions]
    folder = temp / phase
    verify["run_browser"](phase, temp, cases)
    rows = {(project, file, title): {"project": project, "file": file, "title": title, "attempts": [], "accepted": False}
            for project, file, title in cases}
    receipt = {"product": os.environ["BASE" if old else "PRODUCT"], "testSource": os.environ["PRODUCT"],
               "cases": list(rows.values()), "extraOrDuplicate": [], "accepted": False}
    try:
        receipt["exit"] = int((folder / "exit").read_text())
        report = json.loads((folder / "results.json").read_bytes())
        receipt["errors"] = [details(e) for e in report["errors"]]
        receipt["stats"] = {k: report["stats"][k] for k in ("unexpected", "expected", "flaky", "skipped")}
        receipt["retries"] = {p["name"]: p["retries"] for p in report["config"]["projects"]
                              if p["name"] in {desktop, phone}}
        seen = set()
        for key, test in verify["report_cases"](report):
            if key not in rows or key in seen:
                receipt["extraOrDuplicate"].append(key)
                continue
            seen.add(key)
            row = rows[key]
            row.update(status=test["status"], expectedStatus=test["expectedStatus"])
            try:
                result, = test["results"]
                row["attempts"].append(retain_attempt(phase, cases.index(key) + 1, key, result, folder))
                row["accepted"] = (row["attempts"][0]["accepted"] and test["expectedStatus"] == "passed"
                                   and test["status"] == ("unexpected" if old else "expected"))
            except (OSError, KeyError, TypeError, ValueError) as error:
                row["observationError"] = type(error).__name__
        receipt["accepted"] = (receipt["exit"] == (1 if old else 0) and not receipt["errors"] and not receipt["extraOrDuplicate"]
                               and receipt["stats"] == {"unexpected": len(cases) if old else 0, "expected": 0 if old else len(cases),
                                                        "flaky": 0, "skipped": 0}
                               and receipt["retries"] == {desktop: 0, phone: 0} and all(r["accepted"] for r in rows.values()))
    except (OSError, KeyError, ValueError, TypeError) as error:
        receipt["reportError"] = type(error).__name__
        receipt["processError"] = helpers["process_error"](folder / "browser.log")
    write(out / f"{phase}.json", receipt)
    return receipt["accepted"]


def performance():
    source = Path("artifacts/perf")
    dest = out / "performance"
    dest.mkdir()
    for name in ("summary.json", "summary.md", "samples.ndjson"):
        if (source / name).is_file():
            shutil.copyfile(source / name, dest / name)
    report = json.loads((source / "results.json").read_bytes())
    attempt_report = [{"project": key[0], "file": key[1], "title": key[2],
                       "attempts": [{"status": r["status"], "retry": r["retry"], "errors": [details(e) for e in r["errors"]]}
                                    for r in t["results"]]} for key, t in verify["report_cases"](report)]
    write(dest / "browser.json", {"cases": attempt_report, "errors": [details(e) for e in report["errors"]]})
    data = json.loads((dest / "summary.json").read_bytes())
    samples = [json.loads(line) for line in (dest / "samples.ndjson").read_text().splitlines()]
    result, cold, budget = data["result"], data["cold"], data["budgets"]
    values = [
        ("coldLcpMs", cold["lcpMs"], budget["coldLcpMs"]),
        ("visualTransitionP95Ms", data["visualTransitionP95Ms"], budget["warmTransitionP95Ms"]),
        ("browserCpuMsPerTransition", result["browserCpuMsPerTransition"], budget["browserCpuMsPerTransition"]),
        ("rendererTaskMsPerTransition", result["rendererTaskMsPerTransition"], budget["rendererTaskMsPerTransition"]),
        ("peakJsHeapUsedMiB", result["memory"]["peakJsHeapUsedMiB"], budget["peakJsHeapMiB"]),
        ("coldPeakPssMiB", cold["memory"]["peakPssMiB"], budget["peakPssMiB"]),
        ("peakPssMiB", result["memory"]["peakPssMiB"], budget["peakPssMiB"]),
        ("retainedPssDeltaMiB", result["memory"]["pssDeltaMiB"], budget["retainedPssDeltaMiB"]),
        ("liveDomNodes", data["liveDomNodes"], budget["peakDomNodes"]),
        ("longTasksOver50Ms", sum(v > 50 for v in data["browserState"]["longTasks"]), 2),
    ]
    checks = [{"name": name, "value": value, "limit": limit,
               "passed": type(value) in (int, float) and math.isfinite(value) and value <= limit} for name, value, limit in values]
    counts = {phase: sum(s["phase"] == phase for s in samples) for phase in ("cold", "warm")}
    valid = (data["gitSha"] == os.environ["PRODUCT"] and data["environment"]["platform"] == "linux"
             and data["scenario"]["cycles"] == 20 and result["transitions"] == 40 and min(counts.values()) > 0
             and len(attempt_report) == 1 and attempt_report[0]["project"] == "performance"
             and attempt_report[0]["title"] == "scene slices stay within CPU and memory budgets"
             and len(attempt_report[0]["attempts"]) == 1 and attempt_report[0]["attempts"][0]["retry"] == 0)
    write(dest / "budgets.json", {"sha": data["gitSha"], "cycles": data["scenario"]["cycles"],
                                  "transitions": result["transitions"], "samples": counts, "checks": checks,
                                  "complete": valid, "withinBudgets": all(c["passed"] for c in checks)})
    return valid and all(c["passed"] for c in checks)


def summary():
    out.mkdir(parents=True, exist_ok=True)
    steps = json.loads(os.environ["RESULTS"])
    outcomes = {name: steps.get(name, {}).get("outcome", "missing") for name in gates}
    diagnostics = {}
    for gate, log in (("types", "types"), ("lint", "lint"), ("chromium", "chromium"), ("dependencies", "dependencies"),
                      ("build", "build"), ("build", "analyze"), ("performance", "performance")):
        path = temp / f"{log}.log"
        if outcomes[gate] == "failure" and path.exists():
            diagnostics[log] = helpers["process_error"](path)
    write(out / "summary.json", {"baseline": os.environ["BASE"], "baselineRun": 45808079102,
                                 "candidate": os.environ["PRODUCT"], "candidateRun": os.environ["GITHUB_RUN_ID"],
                                 "verificationCommit": os.environ["GITHUB_SHA"], "outcomes": outcomes,
                                 "diagnostics": diagnostics, "accepted": all(v == "success" for v in outcomes.values())})
    return True


if __name__ == "__main__":
    command = sys.argv[1]
    if command in ("baseline", "candidate"):
        ok = browser(command)
    elif command == "performance":
        ok = performance()
    elif command == "domain":
        ok = helpers["run_domain"](["camera"])
    elif command == "summary":
        ok = summary()
    else:
        raise SystemExit("Unknown verification command")
    sys.exit(0 if ok else 1)
