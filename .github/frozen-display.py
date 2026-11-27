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
GATES = ("integrity", "dependencies", "browser", "baseline", "spatial", "misplaced", "build", "product_artifact", "journeys",
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
    scene_root = root / "client/data/scenes"
    scene_ids = {scene["id"] for scene in json.loads((scene_root / "manifest.json").read_bytes())["scenes"]}
    scene_images = {scene: json.loads((scene_root / f"{scene}.json").read_bytes())["asset"] for scene in scene_ids}
    image_files = {e["path"]: e["sha256"] for e in files if e["path"].startswith("client/scenes/")}
    if not baseline:
        old_root = TEMP / "frozen/dist/client/data/scenes"
        old_ids = {entry["id"] for entry in json.loads((old_root / "manifest.json").read_bytes())["scenes"]}
        old_images = {scene: json.loads((old_root / f"{scene}.json").read_bytes())["asset"] for scene in old_ids}
        old_manifest = json.loads((TEMP / "frozen/artifacts/build/dist-manifest.json").read_bytes())
        old_files = {e["path"]: e["sha256"] for e in old_manifest["files"] if e["path"].startswith("client/scenes/")}
        airport, apron, cart = [json.loads((scene_root / f"{scene}.json").read_bytes())
                                for scene in ("airport", "airport-apron", "airport-baggage-cart")]
        photo_path = "client/scenes/airport-apron-v1.jpg"
        cart_photo_path = "client/scenes/airport-baggage-cart-v1.jpg"
        if (len(old_ids) != 113 or scene_ids - old_ids != {"airport-apron", "airport-baggage-cart"} or old_ids - scene_ids
                or not old_images.items() <= scene_images.items() or not old_files.items() <= image_files.items()
                or image_files.keys() - old_files.keys() != {photo_path, cart_photo_path} or "client" + apron["asset"] != photo_path
                or "client" + cart["asset"] != cart_photo_path
                or any((scene["width"], scene["height"]) != (1600, 900) for scene in (apron, cart))
                or len(set(scene_images.values())) != len(set(old_images.values())) + 2):
            raise ValueError("The airport expansion must retain the previous scenes and photographs and add only the apron and cart images")
        for parent, child in ((airport, apron), (apron, cart)):
            if child["parentId"] != parent["id"] or sum(p["childSceneId"] == child["id"] for p in parent["portals"]) != 1:
                raise ValueError("The airport must link to the apron and the apron to the cart")
    name = "baseline-integrity.json" if baseline else "candidate-integrity.json"
    save(name, {"sourceRun": os.environ["ARTIFACT_RUN" if baseline else "GITHUB_RUN_ID"], "gitSha": sha,
                "manifestSha256": digest, "verifiedFiles": len(files), "scenes": len(scene_ids),
                "images": len(set(scene_images.values())), "packagedSceneFiles": len(image_files)})


def run(stage, command, env=None):
    with (TEMP / f"{stage}.out").open("wb") as stdout, (TEMP / f"{stage}.err").open("wb") as stderr:
        return subprocess.run(command, stdout=stdout, stderr=stderr, env=env, check=False).returncode


def diagnostics(stage, code):
    digests = {}
    for stream in ("out", "err"):
        raw = TEMP / f"{stage}.{stream}"
        digests[stream] = hashlib.sha256(raw.read_bytes()).hexdigest()
        subprocess.run(["openssl", "cms", "-encrypt", "-binary", "-aes-256-cbc", "-outform", "DER",
                        "-in", str(raw), "-out", str(OUT / f"{stage}.{stream}.cms"),
                        str(Path(__file__).with_name("evidence-recipient.crt"))], check=True)
    error = (TEMP / f"{stage}.err").read_text(errors="replace")
    if code == 0:
        cause = "passed"
    elif "Error: Spatial realm index is stale;" in error:
        cause = "stale-spatial-vocabulary-index"
    elif "Error: Human review required before release:" in error:
        cause = "outstanding-human-image-reviews"
    elif "Error: Invalid scene graph:" in error:
        cause = "invalid-scene-graph"
    elif re.search(r"^Error: (?:Premium scene|Scene|Label|Portal|Manifest|Asset|World)\b", error, re.M):
        cause = "invalid-scene-content"
    else:
        cause = "unclassified-command-failure"
    details = {"exit": code, "reason": cause, "streamSha256": digests}
    # Only publish identifiers from the scene manifest. All free-form diagnostic
    # text, machine paths and runtime stacks remain in the encrypted streams.
    if code:
        scene_error = re.search(r"^Error: (?:Premium scene|Scene|Label|Portal) ([a-z0-9-]+)(?:/|\s)", error, re.M)
        if scene_error:
            known = json.loads(Path("public/data/scenes/manifest.json").read_bytes())["scenes"]
            if any(scene["id"] == scene_error.group(1) for scene in known):
                details["scene"] = scene_error.group(1)
        location = re.search(r"(?m)^\s*at .*?/(scripts/validate-scenes\.ts|app/domain/sceneGraph\.ts):(\d+):\d+", error)
        if location:
            details["source"] = f"{location.group(1)}:{location.group(2)}"
    return details


def spatial():
    old = TEMP / "frozen-spatial-index"
    old.mkdir()
    old_public = TEMP / "frozen/dist/client"
    (old / "public").symlink_to(old_public, target_is_directory=True)
    generator = Path("scripts/generate-spatial-realm-index.mjs")
    generated = Path("app/domain/spatialLexemeRealms.generated.ts")
    for relative in (generator, generated):
        target = old / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(subprocess.check_output(["git", "show", f"{os.environ['BASELINE']}:{relative}"]))
    def references(public):
        root = public / "data/scenes"
        scenes = json.loads((root / "manifest.json").read_bytes())["scenes"]
        return {(scene["id"], label["id"], label["word"], label["lexemeId"])
                for scene in scenes for label in json.loads((root / f"{scene['id']}.json").read_bytes())["labels"]
                if label.get("lexemeId")}

    old_refs = references(old_public)
    current_refs = references(Path("public"))
    old_ids = {entry[3] for entry in old_refs}
    added = sorted(current_refs - old_refs)
    cart_words = {"handle": "en-c2a116aa910d147b", "pocket": "en-62f5d588fd39c2bb", "fabric": "en-ad2a542c84c7060f",
                  "canvas": "en-a457e8f04aa796dc", "blanket": "en-7cd0fc6ee61e2a57", "strap": "en-833a63294a4cb1fc",
                  "tire": "en-c91e5b2418a7d741"}
    expected_additions = {("airport-baggage-cart", word, word, lexeme) for word, lexeme in cart_words.items()}
    # Read the exported constant through the same TS runtime as the project's domain tests.
    exported = int(subprocess.check_output(
        ["./node_modules/.bin/tsx", "-e",
         "console.log(require(process.argv[1]).SPATIAL_LEXEME_LINK_COUNT)", str(old / generated)], text=True))
    old_code = run("spatial-baseline", ["node", str(old / generator), "--check"])
    baseline = diagnostics("spatial-baseline", old_code)
    if old_code == 0:
        baseline["report"] = json.loads((TEMP / "spatial-baseline.out").read_bytes())
    green = run("spatial-candidate", ["npm", "run", "--silent", "validate:spatial-realms"])
    candidate = diagnostics("spatial-candidate", green)
    if green == 0:
        candidate["report"] = json.loads((TEMP / "spatial-candidate.out").read_bytes())
    save("spatial-index.json", {"baseline": {**baseline, "authored": len(old_refs), "indexed": exported},
                                "candidate": {**candidate, "authored": len(current_refs),
                                              "addedReferences": added, "removedReferences": sorted(old_refs - current_refs)}})
    current_ids = {entry[3] for entry in current_refs}
    return 0 if (old_code == 0 and green == 0 and len(old_refs) == exported == 397 and len(old_ids) == 239
                 and old_refs <= current_refs and set(added) == expected_additions and old_ids == current_ids
                 and all(result["report"].get("status") == "current"
                         and result["report"].get("linkedLabelCount") == len(refs)
                         and result["report"].get("uniqueLexemeCount") == len(current_ids)
                         for result, refs in ((baseline, old_refs), (candidate, current_refs)))) else 1


def baseline_performance():
    root = TEMP / "original-evidence"
    digests = {
        "summary.json": "49a69d284dc2aea7a498ef0d362246b257209826c83fb06cd549b1bc469416a7",
        "navigation-result.json": "a4bc88969759f576850e67592fdfded9f2fed26595498ae33ad32733f7e7abf5",
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
            or metrics["transitions"] != 40 or report["exit"] != 1 or len(report["cases"]) != 1
            or report["cases"][0]["status"] != "failed" or report["cases"][0]["retry"] != 0
            or exceeded != ["rendererTaskMsPerTransition"]):
        raise ValueError("The frozen measurements do not match the original rendering budget failure")
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
                                                    "cityStreetBrightV4", "radiologySuite", "spatialLexemeRealms")
    })
    code = run("domain", ["./node_modules/.bin/tsx", "--test", "--test-reporter=tap", *files])
    text = (TEMP / "domain.out").read_text()
    counts = {key: int(value) for key, value in
              re.findall(r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$", text, re.M)}
    save("domain.json", {**diagnostics("domain", code), "counts": counts, "files": files})
    return code or (0 if counts.get("tests") and counts.get("fail") == 0 else 1)


def structure():
    code = run("structure", ["npm", "run", "validate:data", "--", "--allow-image-reviewed"])
    report = Path("artifacts/correctness/scene-integrity.json")
    save("structure-result.json", {**diagnostics("structure", code), "reportProduced": not code and report.is_file()})
    if not code and report.is_file():
        shutil.copyfile(report, OUT / "structural-scene-integrity.json")
        return 0
    return code or 1


def strict():
    code = run("strict", ["npm", "run", "--silent", "validate:data"])
    status = diagnostics("strict", code)
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
    save("strict-data.json", {**status, "reports": reports,
                              "pendingHumanReview": pending.group(1).split(", ") if pending else None})
    return code or (0 if len(reports) == 3 else 1)


def record():
    steps = json.loads(os.environ["STEPS"])
    gates = {gate: steps.get(gate, {}).get("outcome", "missing") for gate in GATES}
    save("result.json", {"gitSha": PRODUCT, "sourceRun": os.environ["ARTIFACT_RUN"],
                         "run": os.environ["GITHUB_RUN_ID"], "controlSha": os.environ["GITHUB_SHA"],
                         "scope": "airport-apron", "outcomes": gates,
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
elif stage == "spatial":
    sys.exit(spatial())
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
