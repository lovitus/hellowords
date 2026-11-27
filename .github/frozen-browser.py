"""Read fixtures on the frozen bathroom photograph and verify the existing scene journeys."""
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
FURNITURE = ("e2e/home-kitchen.spec.ts", "apartment furniture and its parts open separate word cards on the photograph")
KITCHEN = ("e2e/home-kitchen.spec.ts", "kitchen object anchor stays on each photographed object from home entry through card selection and apartment return")
BOWLS = ("e2e/home-kitchen.spec.ts", "the two photographed kitchen sink bowls open their own words")
BATHROOM = ("e2e/home-bathroom.spec.ts", "bathroom fixtures open their own words on the photograph and return to the apartment")
SLOTS = ("e2e/label-zoom-retention.spec.ts", "zooming back out in the apartment keeps readable words in their clear slots")
WORDS = ("bed", "duvet", "wardrobe", "wardrobe door", "wardrobe handle", "refrigerator", "refrigerator door", "refrigerator handle")
BATHROOM_ASSERTION = "the toilet base is on the photographed ceramic pedestal"
BATHROOM_PHOTO = "/scenes/bathroom-premium-v1.jpg"
BATHROOM_PHOTO_SHA = "8b5e929be4f6fec90630342e9c31d1d40e4dfd4f7b207a1fb1c6108f5eb82f22"
KITCHEN_PHOTO = "/scenes/kitchen-premium-v3.jpg"
KITCHEN_PHOTO_SHA = "7623db6c6b87f6f386f6201d5a913de9f31eb016f0894b0a33eec52dc94a7f2e"
PHOTO = "/scenes/apartment-bright-v2.jpg"
PHOTO_SHA = "90b90990ed24ec4324aa0b9345a0db650baf1a8bd03267ab6f53d5984d8c5ff2"
PROJECTS = ("chromium", "mobile-chromium")
phase = sys.argv[1]
assert phase in ("baseline", "candidate")
out = Path(os.environ["RUNNER_TEMP"]) / "frozen-display-evidence" / phase
out.mkdir(parents=True)
temp = Path(os.environ["RUNNER_TEMP"]) / f"browser-{phase}"
temp.mkdir()
cases = [(project, *BATHROOM) for project in PROJECTS]
if phase == "candidate":
    cases += [("chromium", *APARTMENT), ("chromium", *SLOTS)]
    cases += [(p, *journey) for p in PROJECTS for journey in (BOWLS, KITCHEN, FURNITURE, HANDOFF, OFFICE, BED)]


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


def confirmed_furniture(observed, names):
    for word in WORDS:
        key = word.replace(" ", "-")
        geometry = observed.get(key + "-geometry", [])
        dot = observed.get(key + "-dot-geometry", [])
        if (len(geometry) != 1 or len(dot) != 1 or geometry[0].get("word") != word
                or geometry[0].get("sha256") != PHOTO_SHA or geometry[0].get("inside") is not True
                or geometry[0].get("visible") is not True or dot[0].get("dotExposed") is not True
                or key + "-painted-card" not in names or key + "-dot-card" not in names):
            return False
    return True


def right_bowl_reading(observed, names):
    readings = observed.get("right-bowl-reading", [])
    if (len(readings) != 1 or names.count("right-bowl-result") != 1 or "right-bowl-result" in observed
            or not isinstance(readings[0], dict) or not {"scene", "word"} <= readings[0].keys()):
        return None
    return {key: readings[0][key] for key in ("scene", "word")}


def failed_bathroom_assertion(errors):
    if len(errors) != 1:
        return False
    message = re.sub(r"\x1b\[[0-9;]*m", "", errors[0].get("message", "")).strip()
    return bool(message and message.splitlines()[0].removeprefix("Error: ").strip() == BATHROOM_ASSERTION
                and "Expected" in message and "Received" in message
                and not re.search(r"\b(?:timed out|test timeout|timeout \d+ms)\b", message, re.I))


for image, expected_sha in ((PHOTO, PHOTO_SHA), (KITCHEN_PHOTO, KITCHEN_PHOTO_SHA),
                            (BATHROOM_PHOTO, BATHROOM_PHOTO_SHA)):
    if hashlib.sha256((Path("dist/client") / image.lstrip("/")).read_bytes()).hexdigest() != expected_sha:
        raise ValueError(f"Frozen photograph differs: {image}")
if phase == "baseline":
    bathroom = json.loads(Path("dist/client/data/scenes/bathroom.json").read_bytes())
    locations = {a["id"]: [a["x"], a["y"]] for a in bathroom["labels"]}
    if locations.get("toilet-base-pro-2") != [1382.5, 588]:
        raise ValueError("The old toilet base is no longer marked in the shower")
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
        if title == BOWLS[1]:
            row["rightBowlReading"] = right_bowl_reading(observed, names)
        if title == BATHROOM[1]:
            readings = observed.get("toilet-base-geometry", [])
            pedestal = readings[0] if len(readings) == 1 else {}
            row["pedestal"] = {key: pedestal.get(key) for key in ("word", "x", "y", "inside", "sha256")}
        if phase == "baseline":
            row["accepted"] = (title == BATHROOM[1] and result["status"] == "failed"
                               and failed_bathroom_assertion(errors) and "toilet-base-view" in names
                               and pedestal.get("sha256") == BATHROOM_PHOTO_SHA and pedestal.get("inside") is False
                               and abs(pedestal["x"] - 1382.5) < 1 and abs(pedestal["y"] - 588) < 1)
        elif not errors and result["status"] == "passed":
            if title == BATHROOM[1]:
                row["accepted"] = (pedestal.get("sha256") == BATHROOM_PHOTO_SHA and pedestal.get("inside") is True
                                   and all(f"{word}-{kind}-card" in names
                                           for word in ("toilet-base", "cabinet-door", "cabinet-handle")
                                           for kind in ("dot", "painted")))
            elif title == BOWLS[1]:
                row["accepted"] = row["rightBowlReading"] == {"scene": "kitchen", "word": "sink basin"}
            elif title == KITCHEN[1]:
                row["accepted"] = (all(word + "-geometry" in observed and word + "-view" in names
                                       for word in ("sink", "faucet", "refrigerator"))
                                   and "refrigerator-card" in names
                                   and (project != "mobile-chromium" or "coffee-machine-entry-result" in names))
            elif title == FURNITURE[1]:
                row["accepted"] = "apartment-bed-dot-result" in names and confirmed_furniture(observed, names)
            elif title == SLOTS[1]:
                trace = observed.get("apartment-outward-slot-changes", [])
                row["accepted"] = (len(trace) == 1 and trace[0]["changes"] == []
                                   and all(trace[0]["clearFrameCounts"].get(key, 0) > 1
                                           for key in ("refrigerator-door", "shelf-board")))
            elif title == APARTMENT[1]:
                row["accepted"] = bool(frames) and row["maxReadable"] > 0 and row["maxOverflowPx"] <= 1
            elif title == OFFICE[1]:
                office = observed.get("office-return-words", [])
                row["accepted"] = (len(office) == 1 and bool(office[0]["returnedIds"])
                                   and office[0]["foreignIds"] == [] and "office-atrium-return" in names)
            elif title == BED[1]:
                bed = observed.get("emergency-return-words", [])
                row["accepted"] = (len(bed) == 1 and bool(bed[0]["words"]) and "emergency-return" in names)
            else:
                row["accepted"] = True

accepted = (code == (1 if phase == "baseline" else 0) and not report.get("errors")
            and Counter(seen) == Counter(cases) and all(row["accepted"] for row in rows))
(out / "result.json").write_text(json.dumps({"phase": phase, "exit": code, "accepted": accepted,
                                           "reportSha256": hashlib.sha256(reporter.read_bytes()).hexdigest(),
                                           "cases": rows}, indent=2) + "\n")
sys.exit(0 if accepted else 1)
