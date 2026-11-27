"""Verify the observed refrigerator journey on the frozen baseline and candidate."""
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import sys

controls = Path(__file__).resolve().parent
browser = runpy.run_path(str(controls / "verify-office-phone.py"))
diagnostics = runpy.run_path(str(controls / "diagnose-office-phone.py"))
phase = sys.argv[1]
temp = Path(os.environ["RUNNER_TEMP"])
dest = temp / "refrigerator-evidence"
dest.mkdir(exist_ok=True)
room = "office-break-room"
fridge = "office-refrigerator-interior"
room_asset = f"/scenes/{room}-premium-v1.jpg"
fridge_asset = f"/scenes/{fridge}-premium-v1.jpg"
room_hash = "1fe63b2f3ca69e6a33f655c583c01655118ad4400b8b0d95342f04ab75f0f53d"
fridge_hash = "b4ea5c5e7306c5950adce3166de9acd8e917d67e78be2dc2788e402119664d6d"
entry = "refrigerator-ceiling-light"
object_point = (848, 375)
journey = "the office break room opens the refrigerator interior and returns to the break room by zoom"
cabin = "aircraft cabin opens the passenger seat row and meal tray, then restores both parent scenes"
projects = ("chromium", "mobile-chromium")
journeys = [("e2e/office-refrigerator.spec.ts", journey)]


def digest(asset):
    return hashlib.sha256((Path("dist/client") / asset.lstrip("/")).read_bytes()).hexdigest()


def summarize_error(error):
    return diagnostics["details"](error.get("message", ""), error.get("stack", ""), error.get("location"))


def retreated(items):
    if len(items) != 1 or not isinstance(items[0], list):
        return False
    scales = items[0]
    return (len(scales) >= 2 and all(type(value) in (int, float) for value in scales)
            and any(0.74 < value < scales[0] * 0.9 for value in scales[1:]))


def observed(gestures, shots, name, asset, destination, xy, inspect=False):
    evidence = gestures[f"{name}-gesture"]
    if len(evidence) != 1 or shots[f"{name}-end"] != 1:
        return False
    event = evidence[0]
    return (event["asset"] == asset and event["scene"] == destination
            and (event["x"], event["y"]) == xy and event["screen"]["visible"]
            and (not inspect or event["scale"] >= 3.4))


def tapped(shots, names):
    return all(shots[f"{name}-{stage}"] == 1 for name in names for stage in ("before", "dot", "word"))


if digest(room_asset) != room_hash:
    raise ValueError("The packaged break room photograph differs from the reviewed photograph")
if phase == "candidate":
    if digest(fridge_asset) != fridge_hash:
        raise ValueError("The packaged refrigerator photograph differs from the reviewed photograph")
    journeys.extend([
        ("e2e/office-conference.spec.ts", browser["RETURN"]),
        ("e2e/cabin-meal.spec.ts", cabin),
    ])
cases = [(project, file, title) for project in projects for file, title in journeys]
browser["run_browser"](phase, temp, cases)
folder = temp / phase
report = json.loads((folder / "results.json").read_bytes())
seen = []
rows = []
for suite in report["suites"]:
    for case, test in browser["report_cases"](suite):
        project, _, title = case
        seen.append(case)
        attempts = test["results"]
        row = {"project": project, "journey": title, "attempts": len(attempts), "accepted": False}
        rows.append(row)
        if len(attempts) != 1:
            continue
        result = attempts[0]
        items = defaultdict(list)
        shots = Counter()
        counts = Counter()
        for item in result["attachments"]:
            name, mime = item["name"], item["contentType"]
            if not re.fullmatch(r"[a-zA-Z0-9_-]+", name) or mime not in ("application/json", "image/png"):
                continue
            data = diagnostics["attachment_data"](item, folder)
            if mime == "image/png":
                if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("Invalid screenshot")
                shots[name] += 1
                extension = "png"
            else:
                items[name].append(json.loads(data))
                extension = "json"
            counts[name] += 1
            (dest / f"{phase}-{project}-{len(rows)}-{name}-{counts[name]}.{extension}").write_bytes(data)
        accepted = result["status"] == "passed" and not result["errors"]
        if phase == "baseline":
            errors = result["errors"]
            accepted = (result["status"] == "failed" and len(errors) == 1
                        and f"magnifying the photographed {entry} must leave {fridge} open" in errors[0].get("message", "")
                        and observed(items, shots, entry, room_asset, room, (372, 87), inspect=True))
        elif title == journey:
            accepted = (accepted and observed(items, shots, entry, room_asset, fridge, (372, 87))
                        and items["refrigerator-interior-photo"] == [{"asset": fridge_asset, "sha256": fridge_hash, "size": [1600, 900]}]
                        and observed(items, shots, "refrigerator-object", fridge_asset, fridge, object_point, inspect=True)
                        and tapped(shots, ("refrigerator-object-arrival", "break-room-object-return"))
                        and retreated(items["refrigerator-return"]))
        elif title == cabin:
            accepted = (accepted and observed(items, shots, "seat-back-panel", "/scenes/aircraft-cabin-premium-v1.jpg", "passenger-seat-row", (795, 452))
                        and observed(items, shots, "meal-tray-edge", "/scenes/passenger-seat-row-premium-v1.jpg", "inflight-meal-tray", (478, 550))
                        and observed(items, shots, "meal-food", "/scenes/inflight-meal-tray-premium-v1.jpg", "inflight-meal-tray", (798, 613), inspect=True)
                        and tapped(shots, ("neck-pillow-arrival", "foil-dish-fit", "meal-food-arrival", "neck-pillow-return", "cabin-aisle-return"))
                        and retreated(items["meal-tray-return"]) and retreated(items["seat-row-return"]))
        elif title == browser["RETURN"]:
            restored = items["office-return-words"]
            accepted = (accepted and all(counts[name] == 1 for name in browser["required_attachments"](phase, case))
                        and len(restored) == 1 and bool(restored[0]["returnedIds"])
                        and restored[0]["foreignIds"] == [] and restored[0]["cameraLensPinned"] is False)
        row.update(status=result["status"], retry=result["retry"], attachments=dict(counts),
                   accepted=bool(accepted and result["retry"] == 0), durationMs=result["duration"],
                   errors=[summarize_error(error) for error in result["errors"]],
                   steps=[{"title": diagnostics["text"](step["title"]), "durationMs": step["duration"]}
                          for step in result.get("steps", [])])
receipt = {
    "phase": phase, "product": os.environ["BASELINE" if phase == "baseline" else "PRODUCT"],
    "stats": report["stats"], "cases": rows, "globalErrors": [summarize_error(error) for error in report["errors"]],
    "accepted": sorted(seen) == sorted(cases) and all(row["accepted"] for row in rows)
                and not report["errors"] and (folder / "exit").read_text().strip() == ("1" if phase == "baseline" else "0"),
}
(dest / f"{phase}.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, ensure_ascii=False))
raise SystemExit(0 if receipt["accepted"] else 1)
