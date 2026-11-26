"""Keep each browser observation, even if another case fails."""
import base64
import json
import os
from pathlib import Path

temp = Path(os.environ["RUNNER_TEMP"])
out = temp / "evidence"
out.mkdir()
words = {"refrigerator-door", "shelf-board"}
red_assertion = "readable words must stay in their clear object-relative slots"


def cases(node):
    for spec in node.get("specs", []):
        for test in spec["tests"]:
            yield spec["title"], test
    for child in node.get("suites", []):
        yield from cases(child)


def attachment(result, name, file_type):
    item, = (a for a in result["attachments"] if a["name"] == name and a["contentType"] == file_type)
    return base64.b64decode(item["body"], validate=True) if "body" in item else Path(item["path"]).read_bytes()


def outward(label, result):
    data = attachment(result, "apartment-outward-slot-changes", "application/json")
    (out / f"{label}.json").write_bytes(data)
    body = json.loads(data)
    changes, counts, frames = (body[k] for k in ("changes", "clearFrameCounts", "frames"))
    valid = set(counts) == words and min(counts.values()) > 1 and len(frames) > 2
    valid = valid and all(c["word"] in words and 0 < c["frameIndex"] < len(frames)
                          and (c["shiftPx"] is None or c["shiftPx"] > 1) for c in changes)
    errors = result.get("errors", [])
    if label == "baseline":
        expected = result["status"] == "failed" and len(errors) == 1 and red_assertion in errors[0].get("message", "")
        expected = expected and any(c["shiftPx"] is not None for c in changes)
    else:
        expected = result["status"] == "passed" and not errors and not changes
    return dict(accepted=valid and expected, frames=len(frames), clearFrameCounts=counts, changes=changes)


def office(project, result):
    prefix = f"office-{project}"
    data = attachment(result, "office-return-words", "application/json")
    (out / f"{prefix}.json").write_bytes(data)
    (out / f"{prefix}.png").write_bytes(attachment(result, "office-atrium-return", "image/png"))
    body = json.loads(data)
    accepted = (result["status"] == "passed" and not result.get("errors") and body["returnedIds"]
                and body["foreignIds"] == [] and body["cameraLensPinned"] is False and body["spatialId"] is None)
    return dict(accepted=bool(accepted), returnedWords=len(body["returnedIds"]), foreignIds=body["foreignIds"])


summary = {}
for label in ("baseline", "candidate"):
    item = summary[label] = {"accepted": False, "cases": {}}
    try:
        folder = temp / label
        report = json.loads((folder / "report/results.json").read_bytes())
        item["exit"] = int((folder / "exit").read_text())
        seen = []
        for title, test in cases(report):
            project = test["projectName"]
            key = f"{project}/{title}"
            seen.append(key)
            try:
                result, = test["results"]
                if title == os.environ["OUTWARD"]:
                    record = outward(label, result)
                elif title == os.environ["OFFICE"]:
                    record = office(project, result)
                else:
                    raise ValueError("Unexpected test")
                record["accepted"] = record["accepted"] and result["retry"] == 0
                item["cases"][key] = record
            except (KeyError, OSError, ValueError, TypeError) as error:
                item["cases"][key] = {"accepted": False, "evidenceError": type(error).__name__}
        expected = ["chromium/" + os.environ["OUTWARD"]]
        if label == "candidate":
            expected.extend(p + "/" + os.environ["OFFICE"] for p in ("chromium", "mobile-chromium"))
        item["accepted"] = (not report["errors"] and item["exit"] == (1 if label == "baseline" else 0)
                            and sorted(seen) == sorted(expected) and all(v["accepted"] for v in item["cases"].values()))
    except (KeyError, OSError, ValueError, TypeError) as error:
        item["evidenceError"] = type(error).__name__

(out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
