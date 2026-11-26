"""Publish compact failure evidence. Full subprocess reports stay in RUNNER_TEMP."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET


CONTROL = Path(__file__).resolve().parent
VERIFY = runpy.run_path(str(CONTROL / "verify-office-phone.py"))
TEMP = Path(os.environ["RUNNER_TEMP"])
OUT = TEMP / "diagnosis"
DOMAIN = ("camera", "screenSpaceLabels", "labelLayout", "labelPlacement", "labelCanvasHit")
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
PROJECT_LINE = re.compile(r"\b((?:app|tests|scripts)/[\w./-]+\.[cm]?[jt]sx?):(\d+)(?::(\d+))?")


def save(path, record):
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")


def text(value):
    line = ANSI.sub("", str(value)).replace(f"file://{Path.cwd()}/", "").replace(f"{Path.cwd()}/", "")
    line = re.sub(r"https?://\S+|file://\S+", "[url]", line)
    line = re.sub(r"(?<![\w/])(?:[A-Za-z]:[\\/]|/)[\w./\\~%-]+", "[path]", line)
    line = re.sub(r"(?i)\b(?:bearer|basic)\s+\S+|(?:token|password|secret|cookie|authorization)\s*[:=].*", "[redacted]", line)
    line = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:gh[pousr]_|github_pat_|sk-)\S+|\b[A-Za-z0-9_=-]{45,}\b", "[redacted]", line)
    return line.strip()[:280]


def frames(raw, location=None):
    location = location or {}
    start = f"{location.get('file', '')}:{location.get('line', '')}:{location.get('column', '')}"
    result = []
    for match in PROJECT_LINE.finditer(f"{start}\n{raw}"):
        path, line, column = match.groups()
        if ".." in Path(path).parts or not Path(path).is_file():
            continue
        item = {"file": path, "line": int(line), "column": int(column) if column else None}
        if item not in result:
            result.append(item)
    return result[:8]


def details(message, stack="", location=None):
    lines = [line.strip() for line in ANSI.sub("", message).splitlines() if line.strip()]
    headlines = [line for line in lines if "|" not in line and not line.startswith(("at ", "> ", "^", "Call log:"))][:3]
    useful = [line for line in lines if re.search(
        r"Expected|Received|Locator:|intercepts pointer events|waiting for |Timeout|not found|actual:|expected:", line, re.I
    ) and "|" not in line and not line.startswith("at ")]
    excerpts = list(dict.fromkeys(text(line) for line in headlines + useful))[:8]
    return {"message": excerpts, "source": frames(stack + "\n" + message, location),
            "pointerInterceptionReported": any("intercepts pointer events" in line for line in lines)}


def execute(args, log, **env):
    with log.open("wb") as stream:
        return subprocess.run(args, env={**os.environ, **env}, stdout=stream, stderr=subprocess.STDOUT, check=False).returncode


def process_error(log):
    raw = log.read_text(errors="replace")
    lines = [line.strip() for line in ANSI.sub("", raw).splitlines() if line.strip()]
    errors = [line for line in lines if re.search(r"^(?:[\w.]*Error\b|[\w -]+ validation failed:|npm (?:ERR!|error)\b)", line, re.I)]
    if not errors:
        errors = [line for line in lines if not line.startswith(("at ", ">", "{", "}", "Node.js", "^"))][-2:]
    return {"message": [text(line) for line in errors[:5]], "source": frames(raw)}


def validate_data():
    log = TEMP / "data.log"
    code = execute(["npm", "run", "validate:data", "--", "--allow-image-reviewed"], log)
    save(OUT / "validate-data.json", {"command": "npm run validate:data -- --allow-image-reviewed",
         "exit": code, "error": process_error(log) if code else None})
    return code == 0


def run_domain(names=DOMAIN):
    records = []
    for name in names:
        source = f"tests/domain/{name}.test.ts"
        report, log = TEMP / f"{name}.xml", TEMP / f"{name}.log"
        code = execute(["node", "--import", "tsx", "--test", "--test-reporter=junit",
                        "--test-reporter-destination", str(report), source], log)
        row = {"file": source, "exit": code, "passed": 0, "skipped": 0, "failures": []}
        try:
            tests = ET.parse(report).findall(".//testcase")
            for case in tests:
                failure = case.find("failure")
                if failure is not None:
                    raw = "".join(failure.itertext())
                    fields = {key: text(value) for key, value in re.findall(
                        r"\b(actual|expected|operator|code):\s*('[^'\r\n]{1,160}'|-?\d+(?:\.\d+)?|true|false|null)",
                        raw)}
                    row["failures"].append({"title": text(case.get("name", "")),
                        "assertionFields": fields, **details(failure.get("message") or raw, raw)})
                elif case.find("skipped") is not None:
                    row["skipped"] += 1
                else:
                    row["passed"] += 1
            row["total"] = len(tests)
        except (ET.ParseError, OSError) as error:
            row["reportError"] = type(error).__name__
        if code and not row["failures"]:
            row["processError"] = process_error(log)
        row["passedFile"] = code == 0 and bool(row.get("total")) and not (row["skipped"] or row["failures"])
        records.append(row)
        save(OUT / "domain.json", records)
    return all(row["passedFile"] for row in records)


def diagnostic_steps(folder):
    steps = json.loads((folder / "steps.json").read_bytes())
    def observation(step):
        error = step.get("error") or ""
        return {"action": text(step["action"]), "category": step["category"],
                **details(error, location=step.get("location"))}
    return {key: [observation(step) for step in steps[key]] for key in ("recent", "failures")}


def attachment_data(item, folder):
    if "body" in item:
        return base64.b64decode(item["body"], validate=True)
    source = Path(item["path"]).resolve()
    if not source.is_relative_to(folder / "test-results"):
        raise ValueError("Attachment outside this run")
    return source.read_bytes()


def save_attachments(result, folder, dest):
    saved = []
    for item in result["attachments"]:
        name, mime = item["name"], item["contentType"]
        if name in {"screenshot", "office-atrium-return"} and mime == "image/png":
            data = attachment_data(item, folder)
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("Invalid screenshot")
            path = dest / f"{name}.png"
            path.write_bytes(data)
        elif name in {"office-input-events", "office-portrait-framing", "office-return-words", "monitor-geometry"} and mime == "application/json":
            path = dest / f"{name}.json"
            save(path, json.loads(attachment_data(item, folder)))
        else:
            continue
        saved.append(path.name)
    return saved


def diagnose_phone(side):
    folder, dest = TEMP / f"phone-{side}", OUT / side
    folder.mkdir()
    dest.mkdir()
    spec = Path("tests/e2e/office-conference.spec.ts")
    original = spec.read_bytes()
    row = {"buildSha": os.environ["PRODUCT"], "testFileSHA256": hashlib.sha256(original).hexdigest(),
           "title": VERIFY["RETURN"], "project": VERIFY["PHONE"], "status": "incomplete", "errors": []}
    shutil.copyfile(CONTROL / "office-phone-probe.ts", spec.with_name("office-phone-probe.ts"))
    # Register passive input listeners before navigation; no extra awaits in the measured test body.
    hooks = b'''
import { startOfficeProbe, attachOfficeProbe } from "./office-phone-probe";
test.beforeEach(async ({ page }) => { await startOfficeProbe(page); });
test.afterEach(async ({ page }, info) => { await attachOfficeProbe(page, info); });
'''
    selected = folder / "cases.txt"
    selected.write_text(f"[{VERIFY['PHONE']}] > {VERIFY['OFFICE']} > {VERIFY['RETURN']}\n")
    try:
        spec.write_bytes(original + hooks)
        log = folder / "browser.log"
        row["exit"] = execute(["./node_modules/.bin/playwright", "test", "--test-list", str(selected),
            "--project=mobile-chromium", "--retries=0", "--reporter=json,./tests/e2e/office-phone-probe.ts",
            "--output", str(folder / "test-results")], log, PLAYWRIGHT_JSON_OUTPUT_FILE=str(folder / "results.json"),
            OFFICE_REPORT_DIR=str(folder))
        try:
            row["steps"] = diagnostic_steps(folder)
        except (OSError, ValueError, KeyError, TypeError) as error:
            row["stepReportError"] = type(error).__name__
        report = json.loads((folder / "results.json").read_bytes())
        row["reportErrors"] = [details(e.get("message", ""), e.get("stack", ""), e.get("location")) for e in report["errors"]]
        (identity, case), = VERIFY["report_cases"](report)
        result, = case["results"]
        primary = result.get("error") or {}
        row["errors"] = [details(e.get("message", ""), primary.get("stack", ""), e.get("location"))
                         for e in result["errors"]]
        row.update(status=result["status"], retry=result["retry"], attachments=save_attachments(result, folder, dest))
        valid = identity == VERIFY["PHONE_RETURN"] and case["expectedStatus"] == "passed" and row["retry"] == 0 and not row["reportErrors"]
        if valid and row["exit"] == 0 and row["status"] == "passed" and not row["errors"]:
            row["observation"] = "passed"
        elif (valid and side == "original" and row["status"] == "failed" and row["exit"] == 1 and len(row["errors"]) == 1
              and primary.get("message", "").splitlines()[0].removeprefix("Error: ") == "word monitor must be painted on the label canvas"
              and any(f["file"] == "tests/e2e/canvas-words.ts" for f in row["errors"][0]["source"])
              and "screenshot.png" in row["attachments"]):
            row["observation"] = "original monitor race reproduced"
        else:
            row["observation"] = "unexpected result"
    except (AttributeError, IndexError, KeyError, ValueError, TypeError, OSError) as error:
        row["reportError"] = type(error).__name__
        if (folder / "browser.log").is_file():
            row["processError"] = process_error(folder / "browser.log")
    finally:
        spec.write_bytes(original)
        save(dest / "phone.json", row)
    return row.get("observation") in {"passed", "original monitor race reproduced"}


if __name__ == "__main__":
    command = sys.argv[1]
    if command == "data":
        ok = validate_data()
    elif command == "domain":
        ok = run_domain()
    elif command == "screen-space-labels":
        ok = run_domain(["screenSpaceLabels"])
    elif command in {"original", "revised"}:
        ok = diagnose_phone(command)
    else:
        raise SystemExit("Unknown diagnostic")
    sys.exit(0 if ok else 1)
