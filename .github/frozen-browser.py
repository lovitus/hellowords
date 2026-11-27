"""Compare one photographed bedspace route, then run representative candidate journeys."""
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
ENTRANCE = ("e2e/hospital-radiology.spec.ts",
            "hospital console and couch stay in the hospital while magnifying the scanner enters radiology")
RETURN = ("e2e/hospital-radiology.spec.ts",
          "hospital radiology keeps ultrasound words on the photograph through Fit, continuous zoom and hospital return")
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
cases = [(p, *BED) for p in PROJECTS]
if phase == "candidate":
    cases += [(p, *COFFEE) for p in PROJECTS] + [(PROJECTS[0], *ENTRANCE), (PROJECTS[1], *RETURN)]


def visit(suite):
    yield from suite.get("specs", [])
    for child in suite.get("suites", []):
        yield from visit(child)


def keep_attachments(items, prefix):
    names, observations = [], {}
    for item in items:
        name, mime = item["name"], item["contentType"]
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", name) or mime not in ("application/json", "image/png"):
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
        (out / f"{prefix}-{name}-{names.count(name)}.{extension}").write_bytes(data)
    return names, observations


def business_error(message):
    first = re.sub(r"\x1b\[[0-9;]*m", "", message).strip().split("\n")[0].removeprefix("Error: ").strip()
    for object_name, (_, word) in OBJECTS.items():
        if first == f"{word[0]} has a visible interactive word pill in the bilingual 1× overview":
            return object_name
        for hit in ("dot", "word"):
            if first in (f"{object_name}-{hit} opens a word card",
                         f"{object_name}-{hit} opens the photographed object's bilingual card"):
                return object_name
    return None


def read_bedspace(project, observed, baseline):
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
        # A missing painted term and a card for a different physical object are
        # both observable regressions. The declaration alone cannot establish red.
        if baseline:
            visible = any(label["word"] == word[0] for label in overview[0]["labels"])
            if dot[0]["actual"] == word and visible:
                return False
        else:
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
        tags = [business_error(error.get("message", "")) for error in errors]
        row.update(status=result["status"], errorCount=len(errors), errorObjects=tags, attachments=names)
        if phase == "baseline":
            row["accepted"] = (result["status"] == "failed" and set(tags) == set(OBJECTS)
                               and read_bedspace(project, observed, True))
        elif not errors and result["status"] == "passed":
            if title == BED[1]:
                row["accepted"] = (read_bedspace(project, observed, False)
                                   and "emergency-return-words" in observed and "emergency-return" in names)
            elif title == COFFEE[1]:
                row["accepted"] = all(f"break-room-{object_name}-return-{hit}" in names
                                      for object_name in ("object", "brewer") for hit in ("dot", "word"))
            elif title == ENTRANCE[1]:
                row["accepted"] = "scanner-bore-gesture" in observed and "scanner-bore-end" in names
            else:
                row["accepted"] = "hospital-return" in names and "radiology-couch-magnified" in names

accepted = (not report.get("errors") and Counter(seen) == Counter(cases) and all(row["accepted"] for row in rows)
            and (code == 1 if phase == "baseline" else code == 0))
(out / "result.json").write_text(json.dumps({"phase": phase, "exit": code, "accepted": accepted,
                                           "cases": rows}, indent=2) + "\n")
sys.exit(0 if accepted else 1)
