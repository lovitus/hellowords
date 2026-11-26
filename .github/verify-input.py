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
index_title = "keyboard selection from the scene word index keeps the next action on the selected card"
index_cases = [(project, "e2e/world.spec.ts", index_title) for project in (desktop, phone)]
prefix = "home atlas district journey "
atlas_screenshots = {
    prefix + "photo anchors open the preparation room and the school gate enters campus": (
        (desktop, phone), "preparation-room-on-map",
    ),
    prefix + "search paints the selected tractor and keeps district navigation available": (
        (desktop, phone), "tractor-on-map",
    ),
    prefix + "pointer opens a Campus word drawn over Science": (
        (desktop,), "campus-word-open",
    ),
    prefix + "keyboard tabs from the Campus title to a drawn word and back": (
        (desktop, phone), "focused-campus-word",
    ),
}
bus_case = (phone, "e2e/world.spec.ts", prefix + "mobile reads the city bus photo and enters and returns from the city street")
bus_screenshots = ("city-bus-on-map", "city-street-from-atlas")
office_case = (desktop, verify["OFFICE"], "a gradual second wheel gesture returns from the conference room to the office photograph")
office_screenshot = "office-after-gradual-return"
home = "e2e/home-kitchen.spec.ts"
apartment_title = "apartment search distinguishes the photographed shower hinge from the unpictured remote control"
hinge_capture = "apartment-shower-hinge-focus-frames"
apartment_screenshot = "apartment-shower-hinge"
apartment_cases = [(project, home, apartment_title) for project in (desktop, phone)]
phone_hinge = (phone, home, apartment_title)
kitchen_title = "kitchen object anchor stays on each photographed object from home entry through card selection and apartment return"
kitchen_cases = [(project, home, kitchen_title) for project in (desktop, phone)]
phone_coffee = (phone, home, kitchen_title)
coffee_assertion = "tapping the coffee machine word dot must keep the kitchen open"
district_titles = (
    "starts as a calm target-language world and persists the meaning toggle",
    "the home atlas keeps its artwork clear and reveals only the hovered district words",
)
regressions = [
    *((project, "e2e/world.spec.ts", title) for title, (projects, _) in atlas_screenshots.items() for project in projects),
    *index_cases, reverse_tab, pointer,
    (desktop, motion, "continuous wheel input advances in monotonic animation frames without a scale jump"),
    (desktop, "e2e/label-zoom-retention.spec.ts", verify["APARTMENT"]),
    *((project, "e2e/label-zoom-retention.spec.ts", "ordinary scenes hide the progress hint while the canvas counts only the current crop")
      for project in (desktop, phone)),
    (desktop, "e2e/continuous-semantic-zoom.spec.ts", "Apartment handoff settles to the complete child before a fresh outward gesture can exit"),
    (desktop, motion, "root portal click settles apartment before a deliberate third-step exit"),
    (desktop, verify["OFFICE"], verify["RETURN"]), verify["PHONE_RETURN"],
    (desktop, motion, "a decoded parent stays hot when entering a child and zooming back out"),
    (desktop, motion, "a warm adjacent transition avoids the loader, while outrunning the neighbor cache reveals it"),
    (phone, motion, "mobile keeps its warmed child and parent transitions free of a loader flash"),
    (desktop, motion, "reduced motion and keyboard navigation preserve the warm parent path"),
    *((project, "e2e/world.spec.ts", title) for title in district_titles for project in (desktop, phone)),
    (desktop, "e2e/scene-minimap.spec.ts", "the home atlas keeps words hover-scoped to one district"),
    (desktop, "e2e/spatial-semantic-bridge.spec.ts", "a reviewed spatial word enters its exact semantic realm without search fanout"),
]
gates = ("source", "dependencies", "chromium", "download", "baseline_manifest", "red", "build",
         "production", "green", "performance", "samples", "types", "lint", "data", "domain")


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
        if name == "error-context" and old:
            context = helpers["attachment_data"](item, folder).decode(errors="replace")
            record["activeInFailureSnapshot"] = [helpers["text"](line) for line in context.splitlines() if "[active]" in line][:5]
        if mime not in {"image/png", "application/json"} or not re.fullmatch(r"[\w .-]{1,100}", name):
            continue
        data = helpers["attachment_data"](item, folder)
        if mime == "application/json":
            body = json.loads(data)
            path = dest / f"{index:02d}-{name}.json"
            if name == "coffee-machine-tap-state":
                record["coffeeTap"] = body
            if name == hinge_capture:
                drift = [math.dist(s["photographedHinge"], s["paintedDot"]) for s in body["misplaced"]]
                record["hinge"] = {"frames": len(body["frames"]), "misplaced": len(drift),
                                   "peakMisplacedCssPx": max(drift, default=0)}
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
    names = {a["name"] for a in receipts}
    pngs = {a["name"] for a in receipts if a["file"].endswith(".png")}
    if old:
        record["accepted"] = (result["status"] == "failed" and result["retry"] == 0
                              and case == phone_coffee and [headline(e) for e in errors] == [coffee_assertion]
                              and headline(primary) == coffee_assertion
                              and {"coffee-machine-before-tap", "coffee-machine-dot-result"}.issubset(pngs)
                              and record.get("coffeeTap") == {"scene": "coffee-machine", "word": None}
                              and any(frame["file"] == f"tests/{case[1]}" for frame in details(primary)["source"]))
        return record
    evidence_ok = True
    if case == phone_coffee:
        evidence_ok = ({"coffee-machine-before-tap", "coffee-machine-dot-result", "coffee-machine-entry-result"}.issubset(pngs)
                       and record.get("coffeeTap") == {"scene": "kitchen", "word": "coffee machine"})
    if case in apartment_cases:
        evidence_ok = apartment_screenshot in pngs
        if case == phone_hinge:
            hinge = record.get("hinge", {})
            evidence_ok = evidence_ok and hinge.get("frames", 0) > 2 and hinge.get("misplaced") == 0
    if case == office_case:
        evidence_ok = office_screenshot in pngs
    if case == bus_case:
        evidence_ok = set(bus_screenshots).issubset(pngs)
    if case[2] in atlas_screenshots:
        evidence_ok = atlas_screenshots[case[2]][1] in pngs
    if case in index_cases:
        evidence_ok = "basin-index-keyboard-focus" in names
    if case[2] == verify["RETURN"]:
        evidence_ok = {"office-atrium-return", "office-return-words"}.issubset(names)
    if case == pointer:
        wheel = record.get("wheel", {})
        evidence_ok = (len([a for a in receipts if a["name"] == "wheel-pointer-trajectory"]) == 1
                       and wheel.get("distinctScales", 0) > 2 and wheel["finalScale"] > 1.5 and wheel["finalDriftCssPx"] < 1
                       and wheel["peakDriftCssPx"] < 1)
    record["accepted"] = bool(not errors and not primary and evidence_ok
                              and result["retry"] == 0 and result["status"] == "passed")
    return record


def browser(phase):
    old = phase == "baseline"
    cases = [phone_coffee] if old else [*apartment_cases, *kitchen_cases, bus_case, *regressions, office_case]
    projects = {project for project, _, _ in cases}
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
                              if p["name"] in projects}
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
                               and receipt["retries"] == {project: 0 for project in projects} and all(r["accepted"] for r in rows.values()))
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
    write(out / "summary.json", {"baseline": os.environ["BASE"], "baselineRun": int(os.environ["BASE_RUN"]),
                                 "requiredOldKitchenFailure": {"project": phone, "file": home, "title": kitchen_title,
                                                              "assertion": coffee_assertion},
                                 "requiredApartmentScreenshot": apartment_screenshot,
                                 "requiredOfficeScreenshot": office_screenshot,
                                 "requiredBusScreenshots": bus_screenshots,
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
    elif command == "data":
        ok = helpers["validate_data"]()
    elif command == "domain":
        ok = helpers["run_domain"](["worldContent", "spatialLexemeRealms", "camera", "navigation", "worldMapDensity", "schoolCampus"], {
            "worldMapDensity": "world atlas keeps six exact, non-overlapping spatial entrances",
            "schoolCampus": "the world atlas exposes the school campus through one reviewed portal",
        })
    elif command == "summary":
        ok = summary()
    else:
        raise SystemExit("Unknown verification command")
    sys.exit(0 if ok else 1)
