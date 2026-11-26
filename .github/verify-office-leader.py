"""Compare the returned office and preserve the adjacent photographed zoom checks."""
import json
import math
import os
from pathlib import Path
import runpy
import sys


diagnostics = runpy.run_path(str(Path(__file__).with_name("diagnose-office-phone.py")))
verify = diagnostics["VERIFY"]
temp = diagnostics["TEMP"]
out = diagnostics["OUT"]
phone = verify["PHONE_RETURN"]
desktop = (verify["DESKTOP"], verify["OFFICE"], verify["RETURN"])
zoom_cases = [(project, verify["OFFICE"], verify["ENTRANCES"]) for project in (verify["PHONE"], verify["DESKTOP"])]
cases = {"baseline": [phone], "candidate": [phone, desktop, *zoom_cases]}
gestures = {f"{object_id}-gesture" for object_id in verify["OBJECTS"]}
zoom_shots = {f"{object_id}-end" for object_id in verify["OBJECTS"]}
screenshots = {"office-atrium-entry", "office-atrium-return", "monitor-view", "monitor-painted-card", "screenshot", *zoom_shots}
gate_names = ("source", "changes", "dependencies", "chromium", "download", "baseline_manifest",
              "red", "build", "production", "green", "types", "lint", "domain", "data")

reception = "office-reception-lobby"
counter = "counter-edge"
assertion = "the painted counter-edge leader clears the office-reception-lobby button"
geometry_name = "office-portrait-framing"
entrances = {"conference-room", "office-break-room", reception, "open-plan-workstation", "service-core"}
office_words = {
    "reception-counter", counter, "wall-panel", "monitor", "conference-chair", "glass-wall",
    "break-room", "refrigerator", "elevator", "server-rack", "air-duct", "chair-caster-pro-7",
}


def ink_clearance(leader, entry):
    start, end = leader["start"], leader["end"]
    dx, dy = end["x"] - start["x"], end["y"] - start["y"]
    length = math.hypot(dx, dy)
    if not math.isfinite(length) or length <= 5:
        raise ValueError("Missing painted leader")
    center = entry["center"]
    x, y = center["x"] - start["x"], center["y"] - start["y"]
    t = max(0, min(1, (x * dx + y * dy) / (length * length)))
    clearance = math.hypot(x - dx * t, y - dy * t) - entry["radius"] - 1.5
    if (entry["radius"] <= 0 or not math.isfinite(clearance)
            or not math.isclose(clearance, entry["inkClearances"][leader["id"]], abs_tol=1e-6)):
        raise ValueError("Painted clearance does not match its segment and circle")
    return clearance


def measure_geometry(geometry):
    buttons = geometry["entrances"]
    leaders = [leader for leader in geometry["leaders"] if leader["id"] in office_words]
    if len(buttons) != len(entrances) or {button["target"] for button in buttons} != entrances:
        raise ValueError("Incomplete entrance inventory")
    if not all(button["fullyVisible"] is True and button["tappable"] is True for button in buttons):
        raise ValueError("Entrance not visible or tappable")
    if (set(geometry["readableLandmarks"]) != office_words
            or len(leaders) != len(office_words) or {leader["id"] for leader in leaders} != office_words):
        raise ValueError("Incomplete painted leader inventory")
    pairs = [{"word": leader["id"], "target": button["target"], "inkClearance": ink_clearance(leader, button)}
             for leader in leaders for button in buttons]
    worst = min(pairs, key=lambda pair: pair["inkClearance"])
    return {"leaders": len(leaders), "allPainted": len(geometry["leaders"]), "buttons": len(buttons),
            "pairCount": len(pairs), "worst": worst,
            "counterEdgeReception": next(pair["inkClearance"] for pair in pairs
                                         if pair["word"] == counter and pair["target"] == reception)}


def missing_record(phase):
    return {
        "phase": phase,
        "productSource": os.environ["BASE" if phase == "baseline" else "PRODUCT"],
        "productionArtifact": os.environ["BASE" if phase == "baseline" else "PRODUCT"],
        "testCommit": os.environ["PRODUCT"],
        "exit": None,
        "cases": [{"project": project, "file": file, "title": title, "observations": []} for project, file, title in cases[phase]],
        "extraCases": [],
        "accepted": False,
    }


def headline(error):
    line = diagnostics["ANSI"].sub("", error.get("message", "")).lstrip().partition("\n")[0]
    return line.removeprefix("Error: ").strip()


def error_details(error):
    return diagnostics["details"](error.get("message", ""), error.get("stack", ""), error.get("location"))


def required_attachments(key, old):
    if key in zoom_cases:
        return gestures | zoom_shots
    required = {"office-atrium-entry", "office-atrium-return"}
    if not old:
        required.update(("monitor-view", "monitor-painted-card", "monitor-geometry"))
    if key == phone:
        required.add(geometry_name)
    return required


def retain_attachments(result, folder, destination, observation):
    destination.mkdir(parents=True)
    for item in result.get("attachments", []):
        name = item.get("name")
        if name not in screenshots and name not in {geometry_name, "monitor-geometry", *gestures}:
            continue
        try:
            data = diagnostics["attachment_data"](item, folder)
            if name not in screenshots:
                if item["contentType"] != "application/json":
                    raise ValueError("Expected JSON")
                geometry = json.loads(data)
                path = destination / f"{name}.json"
                diagnostics["save"](path, geometry)
                if name == geometry_name:
                    observation["geometry"] = measure_geometry(geometry)
            else:
                if item["contentType"] != "image/png" or not data.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("Expected PNG")
                path = destination / f"{name}.png"
                path.write_bytes(data)
            if name in observation["attachments"]:
                raise ValueError("Duplicate attachment")
            observation["attachments"][name] = str(path.relative_to(out))
        except (KeyError, TypeError, ValueError, OSError) as error:
            observation["attachmentErrors"].append({"name": name, "reason": type(error).__name__})


def read_phase(phase):
    old = phase == "baseline"
    folder = temp / phase
    summary = missing_record(phase)
    rows = dict(zip(cases[phase], summary["cases"]))
    try:
        summary["exit"] = int((folder / "exit").read_text())
        report = json.loads((folder / "results.json").read_bytes())
        summary["reportErrors"] = [error_details(e) for e in report["errors"]]
        summary["stats"] = {key: report["stats"][key] for key in ("expected", "unexpected", "flaky", "skipped")}
        projects = {key[0] for key in rows}
        summary["retries"] = {p["name"]: p["retries"] for p in report["config"]["projects"] if p["name"] in projects}
        for key, test in verify["report_cases"](report):
            if key not in rows:
                summary["extraCases"].append([diagnostics["text"](s) for s in key])
                continue
            row = rows[key]
            attempts = []
            row["observations"].append({"status": test["status"], "expectedStatus": test["expectedStatus"], "attempts": attempts})
            for index, result in enumerate(test["results"], 1):
                errors = result["errors"]
                primary = result.get("error") or {}
                observation = {"status": result["status"], "retry": result["retry"],
                               "errors": [error_details(e) for e in errors], "primaryError": error_details(primary) if primary else None,
                               "attachments": {}, "attachmentErrors": []}
                attempts.append(observation)
                journey = "zoom" if key in zoom_cases else "return"
                destination = out / phase / key[0] / journey / f"result-{len(row['observations'])}-{index}"
                retain_attachments(result, folder, destination, observation)
                observation["missingAttachments"] = sorted(required_attachments(key, old) - observation["attachments"].keys())
                error_ok = ([headline(e) for e in errors] == [assertion] and headline(primary) == assertion
                            if old else not errors and not primary)
                geometry_ok = key != phone
                if key == phone and "geometry" in observation:
                    worst = observation["geometry"]["worst"]
                    geometry_ok = (worst["word"] == counter and worst["target"] == reception and worst["inkClearance"] < -0.5
                                   if old else worst["inkClearance"] >= -0.5)
                observation["accepted"] = (result["retry"] == 0 and result["status"] == ("failed" if old else "passed")
                                           and error_ok and not observation["missingAttachments"] and not observation["attachmentErrors"]
                                           and geometry_ok)
            row["accepted"] = (len(row["observations"]) == 1 and test["expectedStatus"] == "passed"
                               and test["status"] == ("unexpected" if old else "expected") and len(attempts) == 1 and attempts[0]["accepted"])
        summary["accepted"] = (
            summary["exit"] == (1 if old else 0) and not summary["reportErrors"] and not summary["extraCases"]
            and summary["stats"] == {"expected": 0 if old else len(rows), "unexpected": 1 if old else 0, "flaky": 0, "skipped": 0}
            and summary["retries"] == dict.fromkeys(projects, 0) and all(row.get("accepted") for row in rows.values())
        )
    except (KeyError, TypeError, ValueError, OSError) as error:
        summary["reportError"] = type(error).__name__
        if (folder / "browser.log").is_file():
            summary["processError"] = diagnostics["process_error"](folder / "browser.log")
    return summary


def write_evidence():
    out.mkdir(exist_ok=True)
    if Path("product/tests").is_dir():
        os.chdir("product")
    steps = json.loads(os.environ["RESULTS"])
    gates = {name: steps.get(name, {}).get("outcome", "missing") for name in gate_names}
    phases = {}
    for phase in cases:
        record = read_phase(phase)
        diagnostics["save"](out / f"{phase}.json", record)
        phases[phase] = record["accepted"]
    diagnostics["save"](out / "summary.json", {
        "baseline": os.environ["BASE"], "baselineRun": 45796779488, "candidate": os.environ["PRODUCT"],
        "requiredAssertion": assertion, "gates": gates, "acceptedPhases": phases,
        "accepted": all(phases.values()) and all(value == "success" for value in gates.values()),
    })


if __name__ == "__main__":
    command = sys.argv[1]
    if command == "evidence":
        write_evidence()
    elif command == "domain":
        files = ("openPlanWorkstation", "sceneGraph", "navigation", "labelLayout", "labelPlacement", "screenSpaceLabels", "labelCanvasHit")
        sys.exit(0 if diagnostics["run_domain"](files) else 1)
    elif command in {"types", "lint"}:
        log = temp / f"{command}.log"
        if command == "types":
            args = ["npm", "run", "typecheck"]
        else:
            files = [os.fsdecode(name) for name in (temp / "lint-files").read_bytes().split(b"\0") if name]
            args = ["./node_modules/.bin/eslint", "--", *files] if files else []
        code = diagnostics["execute"](args, log) if args else 0
        diagnostics["save"](out / f"{command}.json", {"exit": code, "error": diagnostics["process_error"](log) if code else None})
        sys.exit(code)
    else:
        verify["run_browser"](command, temp, cases[command])
