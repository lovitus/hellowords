"""Compare two bedside objects on the same photograph and check the prior navigation routes."""
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


BED = ("e2e/hospital-bedspace.spec.ts",
       "the inpatient bedspace opens the photographed table leg and foot caster and zooms back to emergency")
COFFEE = ("e2e/office-drinks.spec.ts",
          "the office break room opens the coffee station and returns to the break room by zoom")
BEDSIDE = {
    "Bedspace bedside water jug": {
        "point": [1218, 332], "old": [1191.387560, 329.968119],
        "assertion": "the water-jug dot lands on the clear jug body on the bedside cabinet",
    },
    "Bedspace nurse-call handset": {
        "point": [1101, 235], "old": [1148.325359, 234.325186],
        "assertion": "the nurse-call dot lands on the white handset with the coiled cord",
    },
}
TITLE_TO_WORD = {f"the inpatient bedspace places the {word} dot on the photographed object": word
                 for word in BEDSIDE}
OBJECTS = {
    "table-leg": ([864, 652], ["Bedspace table support leg", "床位区床旁桌支腿"]),
    "foot-caster": ([1346, 755], ["Bedspace foot-end caster", "床位区床尾脚轮"]),
}
PHOTO = "/scenes/hospital-inpatient-bedspace-premium-v1.jpg"
PHOTO_SHA = "237730a426a5b8406f6b152f1fd719e98c619685e28616eac4731c71fb4df54f"
PROJECTS = ("chromium", "mobile-chromium")
phase = sys.argv[1]
assert phase in ("baseline", "candidate")
out = Path(os.environ["RUNNER_TEMP"]) / "frozen-display-evidence" / phase
out.mkdir(parents=True)
temp = Path(os.environ["RUNNER_TEMP"]) / f"browser-{phase}"
temp.mkdir()
cases = [(p, BED[0], title) for p in PROJECTS for title in TITLE_TO_WORD]
if phase == "candidate":
    cases += [(p, *journey) for p in PROJECTS for journey in (BED, COFFEE)]


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


def business_error(message, word):
    first = re.sub(r"\x1b\[[0-9;]*m", "", message).strip().split("\n")[0].removeprefix("Error: ").strip()
    return word if word and first == BEDSIDE[word]["assertion"] else None


def read_bedside(word, names, observed, baseline):
    key = word.replace(" ", "-")
    gesture = observed.get(f"{word}-gesture", [])
    geometry = observed.get(f"{key}-geometry", [])
    if len(gesture) != 1 or len(geometry) != 1:
        return False
    attempt, anchor = gesture[0], geometry[0]
    if (attempt["asset"] != PHOTO or attempt["scene"] != "hospital-inpatient-bedspace"
            or [attempt["x"], attempt["y"]] != BEDSIDE[word]["point"] or not attempt["screen"]["visible"]
            or attempt["scale"] < 3.4 or anchor["word"] != word or anchor["sha256"] != PHOTO_SHA
            or not anchor["visible"] or f"{word}-end" not in names or f"{key}-view" not in names):
        return False
    if baseline:
        # The original photographic probes and the verified source agree on both
        # misplaced coordinates. A vanished word or a setup failure cannot count.
        return anchor["inside"] is False and math.dist([anchor["x"], anchor["y"]], BEDSIDE[word]["old"]) <= 2
    dots = observed.get(f"{key}-dot-geometry", [])
    return (anchor["inside"] is True and len(dots) == 1 and dots[0]["dotExposed"] is True
            and f"{key}-painted-card" in names and f"{key}-dot-card" in names)


def read_bedspace(project, observed):
    overview = observed.get("bedspace-overview-words", [])
    if len(overview) != 1 or (overview[0].get("asset"), overview[0].get("sha256")) != (PHOTO, PHOTO_SHA):
        return False
    pointer_type = "mouse" if project == "chromium" else "touch"
    for name, (photo, word) in OBJECTS.items():
        dot = observed.get(f"{name}-dot-hit", [])
        if len(dot) != 1 or dot[0]["photo"] != photo:
            return False
        pointer, point = dot[0].get("pointer") or {}, dot[0]["photoPoint"]
        if (pointer.get("type") != pointer_type or not point["visible"]
                or math.hypot(pointer["x"] - point["x"], pointer["y"] - point["y"]) > 2):
            return False
        pill = observed.get(f"{name}-word-hit", [])
        if (dot[0]["actual"] != word or len(pill) != 1 or pill[0]["actual"] != word
                or (pill[0].get("pointer") or {}).get("type") != pointer_type):
            return False
    return True


if hashlib.sha256((Path("dist/client") / PHOTO.lstrip("/")).read_bytes()).hexdigest() != PHOTO_SHA:
    raise ValueError("The real bedspace photograph differs")
selection = temp / "cases.txt"
selection.write_text("".join(f"[{p}] > {f} > {title}\n" for p, f, title in cases))
reporter = temp / "results.json"
with (temp / "command.log").open("wb") as log:
    code = subprocess.run([
        "./node_modules/.bin/playwright", "test", "--test-list", str(selection),
        "--workers=1", "--retries=0", "--reporter=json", "--output", str(temp / "test-results"),
    ], env={**os.environ, "PLAYWRIGHT_JSON_OUTPUT_FILE": str(reporter)}, stdout=log, stderr=subprocess.STDOUT).returncode

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
        word = TITLE_TO_WORD.get(title)
        tags = [business_error(error.get("message", ""), word) for error in errors]
        source_lines = [{"file": Path(location["file"]).name, "line": location.get("line")}
                        for error in errors if (location := error.get("location"))
                        and Path(location.get("file", "")).name in {Path(case[1]).name, "photo-journey.ts"}]
        row.update(status=result["status"], errorCount=len(errors), errorObjects=tags,
                   assertionLocations=source_lines, attachments=names)
        if phase == "baseline":
            row["accepted"] = (result["status"] == "failed" and word is not None and tags == [word]
                               and read_bedside(word, names, observed, True))
        elif not errors and result["status"] == "passed":
            if word is not None:
                row["accepted"] = read_bedside(word, names, observed, False)
            elif title == BED[1]:
                row["accepted"] = (read_bedspace(project, observed)
                                   and "emergency-return-words" in observed and "emergency-return" in names)
            elif title == COFFEE[1]:
                row["accepted"] = all(f"break-room-{object_name}-return-{hit}" in names
                                      for object_name in ("object", "brewer") for hit in ("dot", "word"))

accepted = (not report.get("errors") and Counter(seen) == Counter(cases) and all(row["accepted"] for row in rows)
            and (code == 1 if phase == "baseline" else code == 0))
(out / "result.json").write_text(json.dumps({"phase": phase, "exit": code, "accepted": accepted,
                                           "cases": rows}, indent=2) + "\n")
sys.exit(0 if accepted else 1)
