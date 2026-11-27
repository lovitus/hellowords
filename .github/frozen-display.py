"""Run the frozen project's own checks and retain structured evidence only."""
import glob
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
PERF = Path("artifacts/perf")
SCENARIOS = {
    "navigation": ("scene slices stay within CPU and memory budgets", "summary.json"),
    "search": ("the lexical world searches 44 shards without duplicate requests or an unbounded DOM",
               "semantic-summary.json"),
}
GATES = ("integrity", "dependencies", "browser", "baseline", "build", "product_artifact", "journeys",
         *SCENARIOS, "ssr", "domain", "lexicon", "strict", "structure")


def save(name, body):
    (OUT / name).write_text(json.dumps(body, indent=2) + "\n")


def integrity(baseline):
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


def specs(suite):
    yield from suite.get("specs", [])
    for child in suite.get("suites", []):
        yield from specs(child)


def performance(stage):
    title, filename = SCENARIOS[stage]
    env = {**os.environ, "PERF_RUN": "1", "PERF_SOURCE_SHA": PRODUCT, "PERF_SCENE_CYCLES": "20"}
    env.pop("GITHUB_STEP_SUMMARY", None)
    reporter = PERF / "results.json"
    if reporter.exists():
        reporter.unlink()  # Each independent invocation must produce its own result.
    code = run(stage, ["npm", "run", "test:perf", "--", "--grep", title, "--workers=1", "--retries=0"], env)
    # Measurements and original numeric samples are copied byte-for-byte.
    for name in ([filename, "samples.ndjson"] if stage == "navigation" else [filename]):
        if (PERF / name).is_file():
            shutil.copyfile(PERF / name, OUT / name)
    if not reporter.is_file():
        return code or 1
    original = reporter.read_bytes()
    # Native reports contain captured console output and source locations. Only
    # the private recipient can retrieve the unmodified Playwright JSON.
    subprocess.run(["openssl", "cms", "-encrypt", "-binary", "-aes-256-cbc", "-outform", "DER",
                    "-in", str(reporter), "-out", str(OUT / f"{stage}-playwright.json.cms"),
                    str(Path(__file__).with_name("evidence-recipient.crt"))], check=True)
    report = json.loads(original)
    cases = []
    for spec in specs(report):
        for test in spec["tests"]:
            for result in test["results"]:
                assertion_lines = []
                for error in result.get("errors", []):
                    location = error.get("location") or {}
                    if Path(location.get("file", "")).name == "world-performance.spec.ts":
                        assertion_lines.append(location.get("line"))
                cases.append({"title": spec["title"], "project": test["projectName"], "status": result["status"],
                              "retry": result["retry"], "durationMs": result["duration"],
                              "assertionLines": assertion_lines})
    save(stage + "-result.json", {"exit": code, "cases": cases, "stats": report["stats"],
                                 "reportSha256": hashlib.sha256(original).hexdigest()})
    correct = (len(cases) == 1 and cases[0]["title"] == title and cases[0]["project"] == "performance"
               and cases[0]["retry"] == 0 and cases[0]["status"] == "passed" and (OUT / filename).is_file())
    return code or (0 if correct else 1)


def tap(stage):
    commands = {
        "ssr": ["node", "--test", "--test-reporter=tap", "tests/rendered-html.test.mjs"],
        "domain": ["./node_modules/.bin/tsx", "--test", "--test-reporter=tap", *sorted(glob.glob("tests/domain/*.test.ts"))],
        "lexicon": ["node", "--test", "--test-reporter=tap", *sorted(glob.glob("tests/semantic/*.test.mjs")),
                    *sorted(glob.glob("tests/lexical-world/*.test.mjs"))],
    }
    code = run(stage, commands[stage])
    text = (TEMP / f"{stage}.out").read_text()
    counts = {key: int(value) for key, value in
              re.findall(r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$", text, re.M)}
    save(stage + ".json", {"exit": code, "counts": counts})
    return code or (0 if counts.get("tests") and counts.get("fail") == 0 else 1)


def strict_data():
    code = run("strict", ["npm", "run", "--silent", "validate:data"])
    stdout = (TEMP / "strict.out").read_text()
    stderr = (TEMP / "strict.err").read_text()
    # Each of the three upstream lexicon validators emits a standalone JSON report.
    # Keep the exact bytes (including formatting), even when the later scene audit fails.
    reports = []
    for match in re.finditer(r"(?m)^\{", stdout):
        data, length = json.JSONDecoder().raw_decode(stdout[match.start():])
        marker = next((key for key in ("atlasGroups", "wordNetCoveragePercent", "duplicateReachability")
                       if key in data), None)
        if marker:
            name = {"atlasGroups": "vocabulary", "wordNetCoveragePercent": "semantic",
                    "duplicateReachability": "lexical-world"}[marker]
            (OUT / f"{name}.json").write_text(stdout[match.start():match.start() + length] + "\n")
            reports.append(name)
    scene_report = Path("artifacts/correctness/scene-integrity.json")
    if scene_report.exists():
        shutil.copyfile(scene_report, OUT / scene_report.name)
    pending = re.search(r"^Error: Human review required before release: ([a-z0-9,-]+(?: [a-z0-9,-]+)*)$",
                        stderr, re.M)
    save("strict-data.json", {"exit": code, "reports": reports,
                              "pendingHumanReview": pending.group(1).split(", ") if pending else None})
    return code or (0 if len(reports) == 3 and scene_report.is_file() else 1)


def structure():
    code = run("structure", ["npm", "run", "validate:data", "--", "--allow-image-reviewed"])
    report = Path("artifacts/correctness/scene-integrity.json")
    if not code and report.is_file():
        shutil.copyfile(report, OUT / "structural-scene-integrity.json")
        return 0
    return code or 1


def record():
    steps = json.loads(os.environ["STEPS"])
    gates = {gate: steps.get(gate, {}).get("outcome", "missing") for gate in GATES}
    save("result.json", {"gitSha": PRODUCT, "sourceRun": os.environ["ARTIFACT_RUN"],
                         "run": os.environ["GITHUB_RUN_ID"], "controlSha": os.environ["GITHUB_SHA"],
                         "outcomes": gates, "passed": all(v == "success" for v in gates.values())})
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write("| Check | Outcome |\n|---|---|\n")
        for gate, outcome in gates.items():
            summary.write(f"| {gate} | {outcome} |\n")


stage = sys.argv[1]
if stage in ("baseline-integrity", "candidate-integrity"):
    integrity(stage == "baseline-integrity")
elif stage == "record":
    record()
elif stage == "strict":
    sys.exit(strict_data())
elif stage == "structure":
    sys.exit(structure())
elif stage in SCENARIOS:
    sys.exit(performance(stage))
else:
    sys.exit(tap(stage))
