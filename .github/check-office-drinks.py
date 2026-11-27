"""Compare both photographed drink station journeys on the baseline and candidate."""
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
dest = temp / "office-drinks-evidence"
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
stations = {
    "the office break room opens the coffee station and returns to the break room by zoom": {
        "scene": "office-coffee-station", "entry": "coffee-maker-housing", "entry_point": (550, 246),
        "asset": "/scenes/office-coffee-station-premium-v1.jpg", "object_point": (758, 367),
        "hash": "9bac4f9ebef7c21d37e2c1bec3f1d2652c9741482862eae17fad1939b7e9fff0",
    },
    "the office break room opens the tea station and returns to the break room by zoom": {
        "scene": "office-tea-station", "entry": "tea-packet", "entry_point": (752, 312),
        "asset": "/scenes/office-tea-station-premium-v1.jpg", "object_point": (807, 714),
        "hash": "f4c375d1de6f57b65aa1ceee0dede02e702f60eb5841a8bf086c5130f98358ff",
    },
}
projects = ("chromium", "mobile-chromium")
journeys = [("e2e/office-drinks.spec.ts", title) for title in stations]


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
    for station in stations.values():
        if digest(station["asset"]) != station["hash"]:
            raise ValueError(f"The packaged photograph differs for {station['scene']}")
    journeys.extend([
        ("e2e/office-conference.spec.ts", browser["RETURN"]),
        ("e2e/office-refrigerator.spec.ts", journey),
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
            station = stations[title]
            expected_error = f"magnifying the photographed {station['entry']} must leave {station['scene']} open"
            accepted = (result["status"] == "failed" and len(errors) == 1
                        and expected_error in errors[0].get("message", "")
                        and observed(items, shots, station["entry"], room_asset, room, station["entry_point"], inspect=True))
        elif title in stations:
            station = stations[title]
            asset, destination = station["asset"], station["scene"]
            accepted = (accepted and observed(items, shots, station["entry"], room_asset, destination, station["entry_point"])
                        and items["station-photo"] == [{"asset": asset, "sha256": station["hash"], "size": [1600, 900]}]
                        and observed(items, shots, "station-object", asset, destination, station["object_point"], inspect=True)
                        and tapped(shots, ("station-object-arrival", "break-room-object-return"))
                        and retreated(items["station-return"]))
        elif title == journey:
            accepted = (accepted and observed(items, shots, entry, room_asset, fridge, (372, 87))
                        and items["refrigerator-interior-photo"] == [{"asset": fridge_asset, "sha256": fridge_hash, "size": [1600, 900]}]
                        and observed(items, shots, "refrigerator-object", fridge_asset, fridge, object_point, inspect=True)
                        and tapped(shots, ("refrigerator-object-arrival", "break-room-object-return"))
                        and retreated(items["refrigerator-return"]))
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
