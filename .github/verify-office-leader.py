"""Compare a single office return journey and retain its public observations."""
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
cases = {"baseline": [phone], "candidate": [phone, desktop]}
screenshots = {"office-atrium-entry", "office-atrium-return", "monitor-view", "monitor-painted-card", "screenshot"}
gate_names = ("source", "equivalent", "dependencies", "chromium", "download", "baseline_manifest",
              "red", "build", "production", "green", "domain", "data")

workstation = "open-plan-workstation"
assertion = f"the painted monitor leader clears the {workstation} button"
geometry_name = "office-portrait-framing"
entrances = {"conference-room", "office-break-room", "office-reception-lobby", workstation, "service-core"}


def crossed_entrances(geometry):
    start = geometry["leader"]["start"]
    end = geometry["leader"]["end"]
    dx, dy = end["x"] - start["x"], end["y"] - start["y"]
    length = math.hypot(dx, dy)
    if not math.isfinite(length) or length <= 5:
        raise ValueError("Missing painted leader")
    clearances = {}
    for entry in geometry["entrances"]:
        target = entry["target"]
        if target not in entrances or target in clearances:
            raise ValueError("Unexpected or duplicate entrance")
        center = entry["center"]
        x, y = center["x"] - start["x"], center["y"] - start["y"]
        t = max(0, min(1, (x * dx + y * dy) / (length * length)))
        clearance = math.hypot(x - dx * t, y - dy * t) - entry["radius"] - 1.5
        if entry["radius"] <= 0 or not math.isclose(clearance, entry["monitorInkClearance"], abs_tol=1e-6):
            raise ValueError("Invalid painted clearance")
        clearances[target] = clearance
    if clearances.keys() != entrances:
        raise ValueError("Incomplete entrance geometry")
    return [target for target, clearance in clearances.items() if clearance < -0.5]


def missing_record(phase):
    return {
        "phase": phase,
        "productSource": os.environ["BASE" if phase == "baseline" else "PRODUCT"],
        "productionArtifact": os.environ["FROZEN" if phase == "baseline" else "PRODUCT"],
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


def retain_attachments(result, folder, destination, observation):
    destination.mkdir(parents=True)
    for item in result.get("attachments", []):
        name = item.get("name")
        if name not in screenshots and name not in {geometry_name, "monitor-geometry"}:
            continue
        try:
            data = diagnostics["attachment_data"](item, folder)
            if name in {geometry_name, "monitor-geometry"}:
                if item["contentType"] != "application/json":
                    raise ValueError("Expected JSON")
                geometry = json.loads(data)
                path = destination / f"{name}.json"
                diagnostics["save"](path, geometry)
                if name == geometry_name:
                    observation["crossedEntrances"] = crossed_entrances(geometry)
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
                destination = out / phase / key[0] / f"result-{len(row['observations'])}-{index}"
                retain_attachments(result, folder, destination, observation)
                required = {"office-atrium-entry", "office-atrium-return"}
                if not old:
                    required.update(("monitor-view", "monitor-painted-card", "monitor-geometry"))
                if key == phone:
                    required.add(geometry_name)
                observation["missingAttachments"] = sorted(required - observation["attachments"].keys())
                error_ok = ([headline(e) for e in errors] == [assertion] and headline(primary) == assertion
                            if old else not errors and not primary)
                crossed = observation.get("crossedEntrances", [])
                geometry_ok = key != phone or (workstation in crossed if old else not crossed)
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
        "baseline": os.environ["BASE"], "baselineArtifact": os.environ["FROZEN"], "candidate": os.environ["PRODUCT"],
        "requiredAssertion": assertion, "gates": gates, "acceptedPhases": phases,
        "accepted": all(phases.values()) and all(value == "success" for value in gates.values()),
    })


if __name__ == "__main__":
    command = sys.argv[1]
    if command == "evidence":
        write_evidence()
    elif command == "domain":
        sys.exit(0 if diagnostics["run_domain"](("labelPlacement", "labelLayout", "screenSpaceLabels", "labelCanvasHit")) else 1)
    else:
        verify["run_browser"](command, temp, cases[command])
