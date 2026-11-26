"""Compare the frozen production builds with one set of browser journeys."""
import base64
from collections import Counter
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys


OFFICE = "e2e/office-conference.spec.ts"
RETURN = "returning to the office restores the atrium photograph and its own object labels"
ENTRANCES = "zooming into the office counter and rear monitor follows the photographed entrances"
RACK = "phone can switch between the photographed rack and its light with a word card open"
APARTMENT = "zooming back out in the apartment keeps readable words in their clear slots"
ASSERTION = "the returned atrium gives its objects a closer view than the complete photograph"
PHONE = "mobile-chromium"
DESKTOP = "chromium"
PHONE_RETURN = (PHONE, OFFICE, RETURN)
CASES = {
    "baseline": [PHONE_RETURN],
    "candidate": [
        (DESKTOP, OFFICE, RETURN), PHONE_RETURN,
        (DESKTOP, OFFICE, ENTRANCES), (PHONE, OFFICE, ENTRANCES), (PHONE, OFFICE, RACK),
        (DESKTOP, "e2e/label-zoom-retention.spec.ts", APARTMENT),
    ],
}
OBJECTS = ("reception-counter", "rear-monitor", "wheel-caster", "chair-back")
ATRIUM_SHOTS = ["office-atrium-entry", "office-atrium-return"]
JSON_NAMES = {
    "office-portrait-framing", "office-return-words", "monitor-geometry", "monitor-dot-geometry",
    "server-rack-position", "rack-light-position", "apartment-outward-slot-changes",
    *(f"{obj}-gesture" for obj in OBJECTS),
}
PNG_NAMES = {
    *ATRIUM_SHOTS, "office-camera-lens-index", "office-camera-lens-card", "monitor-view",
    "monitor-painted-card", "monitor-dot-card", "server-rack-card", "rack-light-card",
    *(f"{obj}-end" for obj in OBJECTS),
}
GATES = {
    "baseline": ("dependencies", "chromium", "download", "baseline_manifest", "baseline_browser"),
    "candidate": ("dependencies", "chromium", "types", "lint", "domain", "build", "ssr",
                  "product_artifact", "candidate_browser"),
}


def verify_manifest(root, sha):
    dist = root / "dist"
    manifest = json.loads((root / "artifacts/build/dist-manifest.json").read_bytes())
    files = manifest["files"]
    paths = {file.relative_to(dist).as_posix() for file in dist.rglob("*") if file.is_file()}
    if (manifest["gitSha"] != sha or not files or len(paths) != len(files)
            or paths != {entry["path"] for entry in files}):
        raise ValueError("Production SHA or file inventory mismatch")
    for entry in files:
        data = (dist / entry["path"]).read_bytes()
        if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError("Production file size or digest mismatch")


def run_browser(phase, temp):
    folder = temp / phase
    folder.mkdir()
    case_list = folder / "cases.txt"
    case_list.write_text("".join(f"[{p}] > {f} > {t}\n" for p, f, t in CASES[phase]))
    with (folder / "browser.log").open("wb") as log:
        result = subprocess.run([
            "./node_modules/.bin/playwright", "test", "--test-list", str(case_list),
            "--retries=0", "--reporter=json", "--output", str(folder / "test-results"),
        ], env={**os.environ, "PLAYWRIGHT_JSON_OUTPUT_FILE": str(folder / "results.json")},
            stdout=log, stderr=subprocess.STDOUT, check=False)
    (folder / "exit").write_text(f"{result.returncode}\n")


def report_cases(suite):
    for spec in suite.get("specs", []):
        for test in spec["tests"]:
            yield (test["projectName"], spec["file"], spec["title"]), test
    for child in suite.get("suites", []):
        yield from report_cases(child)


def error_kind(error):
    # The reporter appends a source snippet and stack. Only the headline identifies the assertion.
    message = re.sub(r"\x1b\[[0-9;]*m", "", error.get("message", ""))
    first = message.lstrip().partition("\n")[0].removeprefix("Error: ").strip()
    if first == ASSERTION:
        return "office-portrait-framing"
    if "timeout" in first.lower() or "timed out" in first.lower():
        return "timeout"
    return "other-error"


def error_observation(error):
    entry = {"kind": error_kind(error)}
    location = error.get("location") or {}
    filename = Path(location.get("file", "")).name
    if filename in {"office-conference.spec.ts", "photo-journey.ts", "label-zoom-retention.spec.ts"}:
        entry.update(file=f"tests/e2e/{filename}", line=location.get("line"), column=location.get("column"))
    return entry


def required_attachments(phase, case):
    project, _, title = case
    if title == RETURN:
        names = ATRIUM_SHOTS.copy()
        if project == PHONE:
            names.append("office-portrait-framing")
        if phase == "candidate":
            names.extend(["office-return-words", "monitor-geometry", "monitor-view", "monitor-painted-card"])
        return names
    if title == ENTRANCES:
        return [f"{obj}-{suffix}" for obj in OBJECTS for suffix in ("gesture", "end")]
    if title == RACK:
        return [f"{obj}-{suffix}" for obj in ("server-rack", "rack-light", "server-rack")
                for suffix in ("position", "card")]
    return ["apartment-outward-slot-changes"]


def save_attachments(result, folder, out, record):
    out.mkdir(parents=True)
    counts = Counter()
    for item in result.get("attachments", []):
        name = item.get("name")
        if name not in JSON_NAMES and name not in PNG_NAMES:
            continue
        extension, mime = ("json", "application/json") if name in JSON_NAMES else ("png", "image/png")
        counts[name] += 1
        path = out / f"{name}-{counts[name]}.{extension}"
        try:
            if item.get("contentType") != mime:
                raise ValueError("invalid attachment type")
            if "body" in item:
                data = base64.b64decode(item["body"], validate=True)
            else:
                source = Path(item["path"]).resolve()
                if not source.is_relative_to(folder / "test-results"):
                    raise ValueError("unexpected attachment path")
                data = source.read_bytes()
            if extension == "json":
                body = json.loads(data)
                if not isinstance(body, dict):
                    raise ValueError("invalid JSON observation")
            elif not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("invalid screenshot")
            path.write_bytes(data)
            record["attachments"].append({"name": name, "file": path.name})
            if name == "office-portrait-framing":
                ratio = body.get("entryWidthRatio")
                if type(ratio) in (int, float) and math.isfinite(ratio):
                    record["entryWidthRatio"] = ratio
        except (KeyError, TypeError, ValueError, OSError):
            record["reasons"].append(f"Unreadable attachment: {name}")


def observe_test(phase, case, test, folder, output):
    baseline = phase == "baseline"
    reasons = []
    record = {"status": test.get("status"), "expectedStatus": test.get("expectedStatus"),
              "attempts": [], "reasons": reasons}
    attempts = test.get("results", [])
    if (record["expectedStatus"] != "passed" or record["status"] != ("unexpected" if baseline else "expected")
            or len(attempts) != 1):
        reasons.append("Unexpected test outcome or attempt count")
    for index, result in enumerate(attempts, 1):
        errors = [error_observation(error) for error in result["errors"]]
        attempt = {"status": result.get("status"), "retry": result.get("retry"), "errors": errors,
                   "directory": f"{output.parent.name}/{output.name}/attempt-{index}", "attachments": [], "reasons": []}
        record["attempts"].append(attempt)
        save_attachments(result, folder, output / f"attempt-{index}", attempt)
        seen = Counter(item["name"] for item in attempt["attachments"])
        missing = list((Counter(required_attachments(phase, case)) - seen).elements())
        if missing:
            attempt["reasons"].append(f"Missing attachments: {', '.join(missing)}")
        if attempt["retry"] != 0 or attempt["status"] != ("failed" if baseline else "passed"):
            attempt["reasons"].append("Unexpected browser status or retry")
        if baseline:
            if ([error["kind"] for error in errors] != ["office-portrait-framing"]
                    or error_kind(result.get("error") or {}) != "office-portrait-framing"):
                attempt["reasons"].append("The specified portrait assertion must be the sole error")
        elif errors or result.get("error"):
            attempt["reasons"].append("Candidate reported a browser error")
        if case == PHONE_RETURN:
            ratio = attempt.get("entryWidthRatio")
            if seen["office-portrait-framing"] != 1 or ratio is None or not (ratio < 1.15 if baseline else ratio > 1.15):
                attempt["reasons"].append("Missing or unexpected portrait width ratio")
        if attempt["reasons"]:
            reasons.append(f"Attempt {index} did not meet acceptance")
    return record


def write_evidence(phase, temp, steps):
    expected = CASES[phase]
    folder = temp / phase
    out = temp / "evidence"
    out.mkdir(exist_ok=True)
    reasons = []
    rows = {case: {"project": case[0], "file": case[1], "title": case[2],
                   "status": "missing", "observations": []} for case in expected}
    gates = {key: steps.get(key, {}).get("outcome", "missing") for key in GATES[phase]}
    summary = {"commit": os.environ["BASE" if phase == "baseline" else "PRODUCT"],
               "testCommit": os.environ["PRODUCT"], "exit": None, "checks": gates,
               "cases": list(rows.values()), "extraCases": [], "reasons": reasons}
    if phase == "baseline":
        summary["requiredAssertion"] = ASSERTION
    try:
        if (folder / "exit").is_file():
            summary["exit"] = int((folder / "exit").read_text())
        report = json.loads((folder / "results.json").read_bytes())
        summary["reportErrors"] = [error_observation(error) for error in report["errors"]]
        projects = {case[0] for case in expected}
        retries = {p["name"]: p["retries"] for p in report["config"]["projects"] if p["name"] in projects}
        summary["configuredRetries"] = retries
        if retries != {project: 0 for project in projects}:
            reasons.append("Missing or nonzero browser retry configuration")
        stats = {key: report["stats"][key] for key in ("expected", "unexpected", "flaky", "skipped")}
        summary["stats"] = stats
        baseline = phase == "baseline"
        if (summary["reportErrors"] or stats != {"expected": 0 if baseline else len(expected),
                "unexpected": 1 if baseline else 0, "flaky": 0, "skipped": 0}):
            reasons.append("Unexpected reporter errors or result counts")
        for case, test in report_cases(report):
            if case not in rows:
                summary["extraCases"].append({"project": case[0], "file": case[1], "title": case[2],
                                              "status": test.get("status"),
                                              "retries": [r.get("retry") for r in test.get("results", [])]})
                continue
            row = rows[case]
            number = len(row["observations"]) + 1
            path = out / phase / f"case-{expected.index(case) + 1}-observation-{number}"
            try:
                observation = observe_test(phase, case, test, folder, path)
            except (KeyError, TypeError, ValueError, OSError) as error:
                observation = {"reasons": [f"Incomplete browser record: {type(error).__name__}"]}
            row["observations"].append(observation)
            row["status"] = "duplicate" if number > 1 else test.get("status")
    except (KeyError, TypeError, ValueError, OSError) as error:
        reasons.append(f"Missing or invalid reporter output: {type(error).__name__}")
    if summary["exit"] != (1 if phase == "baseline" else 0):
        reasons.append("Unexpected or missing browser exit code")
    if summary["extraCases"]:
        reasons.append("Additional browser cases ran")
    if any(len(r["observations"]) != 1 or r["observations"][0]["reasons"] for r in rows.values()):
        reasons.append("One or more required cases were missing, duplicated or did not meet acceptance")
    if any(outcome != "success" for outcome in gates.values()):
        reasons.append("One or more prerequisite checks did not complete successfully")
    summary["accepted"] = not reasons
    (out / f"{phase}.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    command = sys.argv[1]
    if command == "manifest":
        verify_manifest(Path(sys.argv[2]), sys.argv[3])
    elif command == "run":
        run_browser(sys.argv[2], Path(os.environ["RUNNER_TEMP"]))
    elif command == "evidence":
        for side in CASES:
            write_evidence(side, Path(os.environ["RUNNER_TEMP"]), json.loads(os.environ["STEP_RESULTS"]))
    else:
        raise SystemExit("Unknown verification command")
