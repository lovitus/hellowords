"""Run the frozen project's own checks and retain structured evidence only."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


TEMP = Path(os.environ["RUNNER_TEMP"])
OUT = TEMP / "frozen-display-evidence"
OUT.mkdir(exist_ok=True)
PRODUCT = os.environ["PRODUCT"]
GATES = ("integrity", "dependencies", "browser", "baseline", "misplaced", "build", "product_artifact", "journeys",
         "navigation", "lint", "types", "domain", "strict", "structure")


def save(name, body):
    (OUT / name).write_text(json.dumps(body, indent=2) + "\n")


def integrity(baseline):
    if baseline:
        # Both builds use the very same sampler, real navigation route and budgets.
        subprocess.run(["git", "diff", "--quiet", os.environ["BASELINE"], PRODUCT, "--", "tests/perf",
                        "playwright.config.ts", "package.json", "package-lock.json"], check=True)
    frozen = TEMP / "frozen" if baseline else Path(".")
    sha = os.environ["BASELINE"] if baseline else PRODUCT
    raw = (frozen / "artifacts/build/dist-manifest.json").read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if baseline and digest != os.environ["MANIFEST_SHA256"]:
        raise ValueError("Frozen manifest digest differs")
    manifest = json.loads(raw)
    root = frozen / "dist"
    files = manifest["files"]
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
    if (manifest["gitSha"] != sha or not files or len(actual) != len(files)
            or actual != {entry["path"] for entry in files}):
        raise ValueError("Frozen file inventory or candidate differs")
    for entry in files:
        data = (root / entry["path"]).read_bytes()
        if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError("Frozen file digest or length differs")
        # The data validators read public/ while the browser reads dist/client/.
        if not baseline and entry["path"].startswith(("client/data/", "client/scenes/")):
            source = Path("public") / entry["path"].removeprefix("client/")
            if source.read_bytes() != data:
                raise ValueError("The checked-out data differs from the frozen build")
    name = "baseline-integrity.json" if baseline else "candidate-integrity.json"
    save(name, {"sourceRun": os.environ["ARTIFACT_RUN" if baseline else "GITHUB_RUN_ID"], "gitSha": sha,
                "manifestSha256": digest, "verifiedFiles": len(files)})


def run(stage, command, env=None):
    with (TEMP / f"{stage}.out").open("wb") as stdout, (TEMP / f"{stage}.err").open("wb") as stderr:
        return subprocess.run(command, stdout=stdout, stderr=stderr, env=env, check=False).returncode


def baseline_performance():
    root = TEMP / "original-evidence"
    digests = {
        "summary.json": "0c95701421824c52337f07d1b612972c3de7525846de1d7d8f19fe22dfd9face",
        "navigation-result.json": "032f80d1042bdac6be383ef3d94a533af45977e528810d2bf80ec878e602c24e",
    }
    for name, expected in digests.items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
            raise ValueError("The original navigation evidence differs")
    summary = json.loads((root / "summary.json").read_bytes())
    report = json.loads((root / "navigation-result.json").read_bytes())
    metrics = summary["result"]
    readings = {"rendererTaskMsPerTransition": metrics["rendererTaskMsPerTransition"],
                "peakPssMiB": metrics["memory"]["peakPssMiB"],
                "retainedPssDeltaMiB": metrics["memory"]["pssDeltaMiB"]}
    exceeded = sorted(name for name, value in readings.items() if value > summary["budgets"][name])
    if (summary["gitSha"] != os.environ["BASELINE"] or summary["scenario"]["cycles"] != 20
            or metrics["transitions"] != 40 or report["exit"] != 0 or len(report["cases"]) != 1
            or report["cases"][0]["status"] != "passed" or report["cases"][0]["retry"] != 0 or exceeded):
        raise ValueError("The frozen measurements do not match the completed baseline pass")
    save("baseline-performance.json", {"gitSha": summary["gitSha"], "run": os.environ["ARTIFACT_RUN"],
                                      "cycles": 20, "transitions": 40, "measurements": readings,
                                      "budgets": summary["budgets"], "exceeded": exceeded, "sourceDigests": digests})


def navigation():
    title = "scene slices stay within CPU and memory budgets"
    env = {**os.environ, "PERF_RUN": "1", "PERF_SOURCE_SHA": PRODUCT, "PERF_SCENE_CYCLES": "20"}
    env.pop("GITHUB_STEP_SUMMARY", None)
    code = run("navigation", ["npm", "run", "test:perf", "--", "--grep", title, "--workers=1", "--retries=0"], env)
    perf = Path("artifacts/perf")
    for name in ("summary.json", "samples.ndjson"):
        if (perf / name).is_file():
            shutil.copyfile(perf / name, OUT / name)
    reporter = perf / "results.json"
    if not reporter.is_file():
        return code or 1
    subprocess.run(["openssl", "cms", "-encrypt", "-binary", "-aes-256-cbc", "-outform", "DER",
                    "-in", str(reporter), "-out", str(OUT / "navigation-playwright.json.cms"),
                    str(Path(__file__).with_name("evidence-recipient.crt"))], check=True)
    original = reporter.read_bytes()
    report = json.loads(original)
    cases = []
    def visit(suite):
        for spec in suite.get("specs", []):
            for test in spec["tests"]:
                for result in test["results"]:
                    lines = [location["line"] for error in result.get("errors", [])
                             if (location := error.get("location")) and "line" in location
                             and Path(location.get("file", "")).name == "world-performance.spec.ts"]
                    cases.append({"title": spec["title"], "project": test["projectName"], "status": result["status"],
                                  "retry": result["retry"], "durationMs": result["duration"], "assertionLines": lines})
        for child in suite.get("suites", []):
            visit(child)
    visit(report)
    save("navigation-result.json", {"exit": code, "cases": cases, "stats": report["stats"],
                                    "reportSha256": hashlib.sha256(original).hexdigest()})
    measurements = OUT / "summary.json"
    summary = json.loads(measurements.read_bytes()) if measurements.is_file() else {}
    passed = (len(cases) == 1 and cases[0]["title"] == title and cases[0]["project"] == "performance"
              and cases[0]["retry"] == 0 and cases[0]["status"] == "passed"
              and summary.get("gitSha") == PRODUCT and summary.get("scenario", {}).get("cycles") == 20
              and summary.get("result", {}).get("transitions") == 40 and (OUT / "samples.ndjson").is_file())
    return code or (0 if passed else 1)


def code_check(stage):
    locations = []
    if stage == "lint":
        target = TEMP / "eslint-report.json"
        code = run(stage, ["npm", "run", "lint", "--", "--format", "json", "--output-file", str(target)])
        if target.is_file():
            for entry in json.loads(target.read_bytes()):
                file = Path(entry["filePath"]).resolve().relative_to(Path.cwd())
                for error in entry["messages"]:
                    if error.get("severity") == 2:
                        locations.append({"file": str(file), "line": error.get("line"), "rule": error.get("ruleId")})
    else:
        code = run(stage, ["npm", "run", "typecheck", "--", "--pretty", "false"])
        for file, line, rule in re.findall(r"^([\w./-]+)\((\d+),\d+\): error (TS\d+):",
                                           (TEMP / "types.out").read_text(), re.M):
            if not Path(file).is_absolute() and ".." not in Path(file).parts:
                locations.append({"file": file, "line": int(line), "rule": rule})
    save(stage + ".json", {"exit": code, "errors": locations})
    return code


def domain():
    changed = subprocess.check_output(["git", "diff", "--diff-filter=ACMR", "--name-only", os.environ["BASELINE"],
                                       PRODUCT, "--", "tests/domain/*.test.ts"], text=True).splitlines()
    files = sorted(set(changed) | {
        f"tests/domain/{name}.test.ts" for name in ("camera", "navigation", "semanticZoom", "semanticZoomBoundary",
                                                    "newFacilityScenes", "worldContent", "sceneVisualQuality",
                                                    "airportSecurityGate", "baggageClaim", "checkInCounter", "labelCanvasHit",
                                                    "cityStreetBrightV4")
    })
    code = run("domain", ["./node_modules/.bin/tsx", "--test", "--test-reporter=tap", *files])
    text = (TEMP / "domain.out").read_text()
    counts = {key: int(value) for key, value in
              re.findall(r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$", text, re.M)}
    save("domain.json", {"exit": code, "counts": counts, "files": files})
    return code or (0 if counts.get("tests") and counts.get("fail") == 0 else 1)


def structure():
    code = run("structure", ["npm", "run", "validate:data", "--", "--allow-image-reviewed"])
    report = Path("artifacts/correctness/scene-integrity.json")
    if not code and report.is_file():
        shutil.copyfile(report, OUT / "structural-scene-integrity.json")
        return 0
    return code or 1


def strict():
    code = run("strict", ["npm", "run", "--silent", "validate:data"])
    stdout = (TEMP / "strict.out").read_text()
    reports = []
    for match in re.finditer(r"(?m)^\{", stdout):
        data, length = json.JSONDecoder().raw_decode(stdout[match.start():])
        for marker, name in (("atlasGroups", "vocabulary"), ("wordNetCoveragePercent", "semantic"),
                             ("duplicateReachability", "lexical-world")):
            if marker in data:
                (OUT / f"{name}.json").write_text(stdout[match.start():match.start() + length] + "\n")
                reports.append(name)
                break
    pending = re.search(r"^Error: Human review required before release: ([a-z0-9,-]+(?: [a-z0-9,-]+)*)$",
                        (TEMP / "strict.err").read_text(), re.M)
    save("strict-data.json", {"exit": code, "reports": reports,
                              "pendingHumanReview": pending.group(1).split(", ") if pending else None})
    return code or (0 if len(reports) == 3 else 1)


def record():
    steps = json.loads(os.environ["STEPS"])
    gates = {gate: steps.get(gate, {}).get("outcome", "missing") for gate in GATES}
    save("result.json", {"gitSha": PRODUCT, "sourceRun": os.environ["ARTIFACT_RUN"],
                         "run": os.environ["GITHUB_RUN_ID"], "controlSha": os.environ["GITHUB_SHA"],
                         "scope": "street-transit-photo-reading", "outcomes": gates,
                         "passed": all(v == "success" for v in gates.values())})
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write("| Check | Outcome |\n|---|---|\n")
        for gate, outcome in gates.items():
            summary.write(f"| {gate} | {outcome} |\n")


stage = sys.argv[1]
if stage in ("baseline-integrity", "candidate-integrity"):
    integrity(stage == "baseline-integrity")
elif stage == "baseline-performance":
    baseline_performance()
elif stage == "record":
    record()
elif stage == "domain":
    sys.exit(domain())
elif stage == "navigation":
    sys.exit(navigation())
elif stage == "strict":
    sys.exit(strict())
elif stage in ("lint", "types"):
    sys.exit(code_check(stage))
elif stage == "structure":
    sys.exit(structure())
else:
    raise ValueError("Unknown verification stage")
