"""Verify airport terminal photo reading on both frozen builds and exercise the adjoining journeys."""
import base64
from collections import Counter
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import subprocess
import sys


MINIMAP = ("e2e/scene-minimap.spec.ts",
           "the photograph and minimap open their own destinations where their buttons overlap")
OFFICE = ("e2e/office-conference.spec.ts", "returning to the office restores the atrium photograph and its own object labels")
HANDOFF = ("e2e/continuous-semantic-zoom.spec.ts",
           "Apartment handoff settles to the complete child before a fresh outward gesture can exit")
BAGGAGE = ("e2e/baggage-services.spec.ts",
           "baggage services opens the wooden counter and the open suitcase, then restores both parent scenes")
CHECKIN = ("e2e/airport-bag-drop.spec.ts",
           "airport check-in opens the nearest self-service kiosk from its dot and reads the card reader without moving the photograph")
SECURITY = ("e2e/airport-bag-drop.spec.ts",
            "airport security checkpoint reads the front stanchion pole, looks up its collar and returns from both child scenes")
TERMINAL = ("e2e/airport-terminal.spec.ts",
            "the airport terminal reads the suitcase shell and carousel island and restores its words after baggage claim")
SHELL_ASSERTION = "the luggage shell dot lands on the photographed navy suitcase shell"
PHOTO_SHA = "428e5f9dbcca0f19e8fcedc540a9715362bc55b9b2e51e31d39a4659133f31e1"
PROJECTS = ("chromium", "mobile-chromium")
phase = sys.argv[1]
assert phase in ("baseline", "candidate")
out = Path(os.environ["RUNNER_TEMP"]) / "frozen-display-evidence" / phase
out.mkdir(parents=True)
temp = Path(os.environ["RUNNER_TEMP"]) / f"browser-{phase}"
temp.mkdir()
cases = [(project, *TERMINAL) for project in PROJECTS]
if phase == "candidate":
    cases.extend((project, *journey) for project in PROJECTS
                 for journey in (BAGGAGE, CHECKIN, SECURITY, OFFICE, MINIMAP, HANDOFF))


def visit(suite):
    yield from suite.get("specs", [])
    for child in suite.get("suites", []):
        yield from visit(child)


def terminal_inventory():
    root = Path("dist/client")
    photo = root / "scenes/airport-terminal-premium-v1.jpg"
    scene_file = root / "data/scenes/airport.json"
    baseline_file = (scene_file if phase == "baseline"
                     else Path(os.environ["RUNNER_TEMP"]) / "frozen/dist/client/data/scenes/airport.json")
    original = baseline_file.read_bytes()
    if (hashlib.sha256(photo.read_bytes()).hexdigest() != PHOTO_SHA
            or hashlib.sha256(original).hexdigest() != "7164dc60566ba91924f64fdbe27d9ad784452c19d920a1a6ef985144e8d441fa"):
        raise ValueError("The terminal photograph or original vocabulary differs from the frozen input")
    scene = json.loads(scene_file.read_bytes())
    labels = scene["labels"]
    index = scene.get("relatedWords", [])
    originals = [(entry["id"], entry["word"], entry["translation"]) for entry in json.loads(original)["labels"]]
    current = [(entry["id"], entry["word"], entry["translation"]) for entry in labels + index]
    if Counter(originals) - Counter(current):
        raise ValueError("The terminal lost an existing bilingual vocabulary entry")
    coordinates = Counter((entry["x"], entry["y"]) for entry in labels)
    return {"photoSha256": PHOTO_SHA, "sceneSha256": hashlib.sha256(scene_file.read_bytes()).hexdigest(),
            "photoWords": len(labels), "indexWords": len(index),
            "sharedCoordinates": sum(count > 1 for count in coordinates.values())}


def keep_attachments(items, prefix):
    names, observations, images = [], {}, {}
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
            images[name] = struct.unpack(">II", data[16:24])
            extension = "png"
        names.append(name)
        filename = name.replace(" ", "_")
        (out / f"{prefix}-{filename}-{names.count(name)}.{extension}").write_bytes(data)
    return names, observations, images


def misplaced_shell(errors):
    if len(errors) != 1:
        return False
    message = re.sub(r"\x1b\[[0-9;]*m", "", errors[0].get("message", "")).strip()
    return (message and message.splitlines()[0].removeprefix("Error: ").strip() == SHELL_ASSERTION
            and re.search(r"(?m)^Expected:\s*true\s*$", message)
            and re.search(r"(?m)^Received:\s*false\s*$", message)
            and not re.search(r"\b(?:timed out|test timeout|timeout \d+ms)\b", message, re.I))


def terminal_readings(observed, images, result):
    words = ("luggage shell",) if phase == "baseline" else ("luggage shell", "carousel island")
    for word in words:
        name = word.replace(" ", "-")
        readings = observed.get(name + "-geometry", [])
        if len(readings) != 1 or name + "-view" not in images:
            return False
        reading = readings[0]
        if reading.get("word") != word or reading.get("sha256") != PHOTO_SHA or reading.get("visible") is not True:
            return False
        if phase == "baseline":
            return bool(result["status"] == "failed" and misplaced_shell(result["errors"])
                        and reading.get("inside") is False
                        and abs(reading["x"] - 1442.5) < 1 and abs(reading["y"] - 510) < 1)
        dots = observed.get(name + "-dot-geometry", [])
        if (reading.get("inside") is not True or len(dots) != 1 or dots[0].get("dotExposed") is not True
                or not all(name + suffix in images for suffix in ("-dot-card", "-painted-card", "-photo-reading"))):
            return False
    return result["status"] == "passed" and not result["errors"] and "returned-terminal-shell-reading" in images


inventory = terminal_inventory()
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
        names, observed, images = keep_attachments(result["attachments"], f"{project}-{len(rows)}")
        errors = result["errors"]
        source_lines = [{"file": Path(location["file"]).name, "line": location.get("line")}
                        for error in errors if (location := error.get("location"))
                        and Path(location.get("file", "")).name == Path(case[1]).name]
        row.update(status=result["status"], errorCount=len(errors),
                   assertionLocations=source_lines, attachments=names, imageSizes=images)
        passed = result["status"] == "passed" and not errors
        if title == TERMINAL[1]:
            row["accepted"] = terminal_readings(observed, images, result)
            continue
        if title == OFFICE[1] and phase == "candidate" and passed:
            office = observed.get("office-return-words", [])
            row["accepted"] = (len(office) == 1 and bool(office[0]["returnedIds"]) and office[0]["foreignIds"] == []
                               and office[0]["cameraLensPinned"] is False and "office-atrium-return" in images)
            continue
        if title != MINIMAP[1]:
            row["accepted"] = phase == "candidate" and passed
            continue
        entries = observed.get("minimap-destination", [])
        if len(entries) != 1 or not isinstance(entries[0], dict):
            continue
        reading = entries[0]
        if not all(isinstance(reading.get(k), (int, float)) and math.isfinite(reading[k]) for k in ("x", "y")):
            continue
        row["click"] = {k: reading.get(k) for k in ("x", "y", "destination")}
        row["accepted"] = phase == "candidate" and passed and row["click"]["destination"] == "apartment"

accepted = (code == (1 if phase == "baseline" else 0) and not report.get("errors")
            and Counter(seen) == Counter(cases) and all(row["accepted"] for row in rows))
(out / "result.json").write_text(json.dumps({"phase": phase, "exit": code, "accepted": accepted,
                                           "terminal": inventory,
                                           "reportSha256": hashlib.sha256(reporter.read_bytes()).hexdigest(),
                                           "cases": rows}, indent=2) + "\n")
sys.exit(0 if accepted else 1)
