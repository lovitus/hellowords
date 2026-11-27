"""Compare the rendered apartment photograph on the frozen and candidate builds."""
import base64
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


BED = ("e2e/hospital-bedspace.spec.ts",
       "the inpatient bedspace opens the photographed table leg and foot caster and zooms back to emergency")
OFFICE = ("e2e/office-conference.spec.ts", "returning to the office restores the atrium photograph and its own object labels")
ZOOM_FILE = "e2e/continuous-semantic-zoom.spec.ts"
APARTMENT = (ZOOM_FILE, "the fitted apartment photograph stays aligned with its words after handoff")
HANDOFF = (ZOOM_FILE, "Apartment handoff settles to the complete child before a fresh outward gesture can exit")
PHOTO = "/scenes/apartment-bright-v2.jpg"
PHOTO_SHA = "90b90990ed24ec4324aa0b9345a0db650baf1a8bd03267ab6f53d5984d8c5ff2"
PROJECTS = ("chromium", "mobile-chromium")
phase = sys.argv[1]
assert phase in ("baseline", "candidate")
out = Path(os.environ["RUNNER_TEMP"]) / "frozen-display-evidence" / phase
out.mkdir(parents=True)
temp = Path(os.environ["RUNNER_TEMP"]) / f"browser-{phase}"
temp.mkdir()
cases = [("chromium", *APARTMENT)]
if phase == "candidate":
    cases += [(p, *journey) for p in PROJECTS for journey in (HANDOFF, OFFICE, BED)]


def visit(suite):
    yield from suite.get("specs", [])
    for child in suite.get("suites", []):
        yield from visit(child)


def keep_attachments(items, prefix):
    names, observations = [], {}
    for item in items:
        name, mime = item["name"], item["contentType"]
        if not re.fullmatch(r"[a-zA-Z0-9_ -]+", name) or mime not in ("application/json", "image/png"):
            continue
        if "body" in item:
            data = base64.b64decode(item["body"], validate=True)
        else:
            source = Path(item["path"]).resolve()
            if not source.is_relative_to(temp / "test-results"):
                raise ValueError("Unexpected attachment location")
            data = source.read_bytes()
        if mime == "application/json":
            observations.setdefault(name, []).append(json.loads(data))
            extension = "json"
        else:
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("Invalid PNG attachment")
            extension = "png"
        names.append(name)
        filename = name.replace(" ", "_")
        (out / f"{prefix}-{filename}-{names.count(name)}.{extension}").write_bytes(data)
    return names, observations


def apartment_frames(observed):
    entries = observed.get("apartment-photo-frames", [])
    if len(entries) != 1 or entries[0].get("scene") != "apartment" or entries[0].get("photo") != PHOTO:
        return []
    frames = entries[0].get("frames") or []
    dimensions = ("width", "height", "viewportWidth", "viewportHeight")
    if not all(all(isinstance(f.get(k), (int, float)) and f[k] > 0 for k in dimensions)
               and isinstance(f.get("overflow"), (int, float))
               and isinstance(f.get("readable"), (int, float)) for f in frames):
        return []
    return frames


if hashlib.sha256((Path("dist/client") / PHOTO.lstrip("/")).read_bytes()).hexdigest() != PHOTO_SHA:
    raise ValueError("The real apartment photograph differs")
selection = temp / "cases.txt"
selection.write_text("".join(f"[{p}] > {f} > {title}\n" for p, f, title in cases))
reporter = temp / "results.json"
with (temp / "command.log").open("wb") as log:
    code = subprocess.run([
        "./node_modules/.bin/playwright", "test", "--test-list", str(selection),
        "--workers=1", "--retries=0", "--reporter=json", "--output", str(temp / "test-results"),
    ], env={**os.environ, "PLAYWRIGHT_JSON_OUTPUT_FILE": str(reporter)}, stdout=log, stderr=subprocess.STDOUT).returncode

subprocess.run(["openssl", "cms", "-encrypt", "-binary", "-aes-256-cbc", "-outform", "DER",
                "-in", str(reporter), "-out", str(out / "playwright.json.cms"),
                str(Path(__file__).with_name("evidence-recipient.crt"))], check=True)
rows, seen = [], []
report = json.loads(reporter.read_bytes())
for spec in visit(report):
    for test in spec["tests"]:
        project, title = test["projectName"], spec["title"]
        case = project, spec["file"], title
        seen.append(case)
        attempts = test["results"]
        row = {"project": project, "title": title, "attempts": len(attempts), "accepted": False}
        rows.append(row)
        if case not in cases or len(attempts) != 1 or attempts[0]["retry"] != 0:
            continue
        result = attempts[0]
        names, observed = keep_attachments(result["attachments"], f"{project}-{len(rows)}")
        errors = result["errors"]
        tags = [re.sub(r"\x1b\[[0-9;]*m", "", error.get("message", "")).strip()
                .split("\n")[0].removeprefix("Error: ").strip() for error in errors]
        source_lines = [{"file": Path(location["file"]).name, "line": location.get("line")}
                        for error in errors if (location := error.get("location"))
                        and Path(location.get("file", "")).name in {Path(case[1]).name, "photo-journey.ts"}]
        row.update(status=result["status"], errorCount=len(errors),
                   assertionLocations=source_lines, attachments=names)
        frames = apartment_frames(observed) if title == APARTMENT[1] else []
        if frames:
            row["observedFrames"] = len(frames)
            row["maxOverflowPx"] = max(f["overflow"] for f in frames)
            row["maxReadable"] = max(f["readable"] for f in frames)
        if phase == "baseline":
            row["accepted"] = (result["status"] == "failed" and title == APARTMENT[1]
                               and tags == ["the four-room photograph stays inside the viewport on every unfrozen frame"]
                               and any(f["overflow"] > 1 and (f["width"] > f["viewportWidth"] + 1
                                       or f["height"] > f["viewportHeight"] + 1) for f in frames))
        elif not errors and result["status"] == "passed":
            if title == APARTMENT[1]:
                row["accepted"] = bool(frames) and row["maxReadable"] > 0 and row["maxOverflowPx"] <= 1
            elif title == HANDOFF[1]:
                row["accepted"] = True
            elif title == OFFICE[1]:
                office = observed.get("office-return-words", [])
                row["accepted"] = (len(office) == 1 and bool(office[0]["returnedIds"])
                                   and office[0]["foreignIds"] == [] and "office-atrium-return" in names)
            elif title == BED[1]:
                bed = observed.get("emergency-return-words", [])
                row["accepted"] = (len(bed) == 1 and bool(bed[0]["words"]) and "emergency-return" in names)

accepted = (not report.get("errors") and Counter(seen) == Counter(cases) and all(row["accepted"] for row in rows)
            and (code == 1 if phase == "baseline" else code == 0))
(out / "result.json").write_text(json.dumps({"phase": phase, "exit": code, "accepted": accepted,
                                           "reportSha256": hashlib.sha256(reporter.read_bytes()).hexdigest(),
                                           "cases": rows}, indent=2) + "\n")
sys.exit(0 if accepted else 1)
