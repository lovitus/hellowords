"""Verify photo gestures in the aircraft cabin across frozen production bundles."""
from collections import Counter, defaultdict
import json
import os
from pathlib import Path
import re
import runpy
import sys

controls = Path(__file__).resolve().parent
helpers = runpy.run_path(str(controls / "verify-office-phone.py"))
diagnostics = runpy.run_path(str(controls / "diagnose-office-phone.py"))
attachment_bytes = diagnostics["attachment_data"]
phase = sys.argv[1]
temp = Path(os.environ["RUNNER_TEMP"])
output = temp / ("baggage-diagnostic" if phase in ("prior", "mobile-baggage") else "cabin-evidence")
output.mkdir(exist_ok=True)
cabin = "aircraft cabin opens the passenger seat row and meal tray, then restores both parent scenes"
airport = "baggage services opens the wooden counter and the open suitcase, then restores both parent scenes"
seat_gesture = "seat-back-panel"
cabin_photo = "/scenes/aircraft-cabin-premium-v1.jpg"
row_photo = "/scenes/passenger-seat-row-premium-v1.jpg"
meal_photo = "/scenes/inflight-meal-tray-premium-v1.jpg"
claim_photo = "/scenes/baggage-claim-premium-v1.jpg"
desk_photo = "/scenes/baggage-service-desk-premium-v1.jpg"
table_photo = "/scenes/suitcase-packing-table-premium-v1.jpg"
contracts = {
    cabin: {
        "gestures": (
            (seat_gesture, cabin_photo, (795, 452), "passenger-seat-row", False),
            ("meal-tray-edge", row_photo, (478, 550), "inflight-meal-tray", False),
            ("meal-food", meal_photo, (798, 613), "inflight-meal-tray", True),
        ),
        "words": (),
        "taps": ("neck-pillow-arrival", "foil-dish-fit", "meal-food-arrival", "neck-pillow-return", "cabin-aisle-return"),
        "tap_shots": ("before", "dot", "word"),
        "returns": ("meal-tray-return", "seat-row-return"),
    },
    airport: {
        "gestures": (
            ("service-desk-counter", claim_photo, (260, 340), "baggage-service-desk", False),
            ("open-suitcase-shell", desk_photo, (1260, 744), "suitcase-packing-table", False),
            ("folded-shirt-fabric", table_photo, (813, 667), "suitcase-packing-table", True),
        ),
        "words": (
            ("desk bell", "e6960ee5da74727d72647a1483f2ccc58794a636778c82ba316b7df30c987f13"),
            ("T-shirt", "bb673805d31f21009b73821a8ecb78cab84b5982fe2f7d0b4665c9b0171d4f38"),
            ("baggage services desk", "867f17349b32d7c2802e2710a9b765117e50480301c30e0dea5ee7a4f10457c0"),
        ),
        "taps": ("desk-bell-arrival", "desk-bell-return", "shirt-arrival", "claim-counter-return"),
        "tap_shots": ("before", "card"),
        "returns": ("packing-table-return", "baggage-service-desk-return"),
    },
}
projects = ("chromium", "mobile-chromium")
if phase == "prior":
    prior = output / "history" / "45950843653"
    baseline = json.loads((prior / "baseline.json").read_bytes())
    previous = json.loads((prior / "candidate.json").read_bytes())
    diagnosis = json.loads((output / "history" / "45952337921" / "mobile-baggage.json").read_bytes())
    target = ("mobile-chromium", airport)
    expected = {(project, journey) for project in projects for journey in (cabin, airport, helpers["RETURN"])}
    previous_results = {(r["project"], r["journey"]): r for r in previous["cases"]}
    if (baseline["phase"] != "baseline" or baseline["product"] != os.environ["BASELINE"] or baseline["accepted"] is not True
            or sorted((r["project"], r["journey"]) for r in baseline["cases"]) != [(p, cabin) for p in projects]
            or any(r["accepted"] is not True or r["status"] != "failed" or r["attempts"] != 1 or r["retry"] != 0
                   for r in baseline["cases"])):
        raise ValueError("The original dual-viewport baseline was not observed")
    if (previous["phase"] != "candidate" or previous["product"] != os.environ["PRODUCT"] or previous["accepted"] is not False
            or set(previous_results) != expected or len(previous["cases"]) != len(expected)
            or any(r["attempts"] != 1 or r["retry"] != 0 or r["accepted"] != (key != target)
                   or r["status"] != ("failed" if key == target else "passed") for key, r in previous_results.items())):
        raise ValueError("The pinned prior run must have five accepted rows and the one original mobile baggage failure")
    if (diagnosis["product"] != os.environ["PRODUCT"] or diagnosis["phase"] != "mobile-baggage"
            or diagnosis["accepted"] is not False or len(diagnosis["cases"]) != 1):
        raise ValueError("The previous single mobile failure must be preserved")
    failure = diagnosis["cases"][0]
    if ((failure["project"], failure["journey"]) != target or failure["status"] != "failed"
            or failure["attempts"] != 1 or failure["retry"] != 0 or failure["steps"][-1]["durationMs"] != 8003):
        raise ValueError("Original mobile return timeout observation differs from the diagnostic run")
    for name in ("baseline.json", "candidate.json"):
        (output / f"original-{name}").write_bytes((prior / name).read_bytes())
    print("Verified both baseline observations, five accepted candidate journeys and the original mobile baggage failure.")
    sys.exit(0)

journeys = [("e2e/cabin-meal.spec.ts", cabin)]
if phase == "mobile-baggage":
    projects = ("mobile-chromium",)
    journeys = [("e2e/baggage-services.spec.ts", airport)]
elif phase == "candidate":
    journeys.extend([
        ("e2e/baggage-services.spec.ts", airport),
        ("e2e/office-conference.spec.ts", helpers["RETURN"]),
    ])
cases = [(project, file, title) for project in projects for file, title in journeys]


def summarize_error(error):
    return diagnostics["details"](error.get("message", ""), error.get("stack", ""), error.get("location"))


def summarize_steps(steps):
    return [{
        "title": diagnostics["text"](step["title"]),
        "durationMs": step["duration"],
        **({"error": summarize_error(step["error"])} if step.get("error") else {}),
        **({"steps": summarize_steps(step["steps"])} if step.get("steps") else {}),
    } for step in steps]


helpers["run_browser"](phase, temp, cases)
folder = temp / phase
report = json.loads((folder / "results.json").read_bytes())
seen = []
rows = []
for suite in report["suites"]:
    for case, test in helpers["report_cases"](suite):
        seen.append(case)
        project, _, title = case
        attempts = test["results"]
        row = {"project": project, "journey": title, "attempts": len(attempts), "accepted": False}
        rows.append(row)
        if len(attempts) != 1:
            continue
        result = attempts[0]
        if phase == "mobile-baggage":
            row.update(durationMs=result["duration"], steps=summarize_steps(result.get("steps", [])),
                       errors=[summarize_error(error) for error in result["errors"]])
        json_items = defaultdict(list)
        screenshots = Counter()
        attachments = Counter()
        for item in result["attachments"]:
            name = item["name"]
            mime = item["contentType"]
            if not re.fullmatch(r"[a-zA-Z0-9_-]+", name) or mime not in ("image/png", "application/json"):
                continue
            data = attachment_bytes(item, folder)
            extension = "json" if mime == "application/json" else "png"
            if extension == "json":
                json_items[name].append(json.loads(data))
            else:
                if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("Invalid image evidence")
                screenshots[name] += 1
            attachments[name] += 1
            (output / f"{phase}-{project}-{len(rows)}-{name}-{attachments[name]}.{extension}").write_bytes(data)
        accepted = result["status"] == "passed" and not result["errors"]
        if phase == "baseline":
            errors = result["errors"]
            seat = json_items[f"{seat_gesture}-gesture"]
            accepted = (
                result["status"] == "failed" and len(errors) == 1
                and f"magnifying the photographed {seat_gesture} must leave passenger-seat-row open" in errors[0].get("message", "")
                and len(seat) == 1 and seat[0]["scene"] == "aircraft-cabin"
                and seat[0]["asset"] == cabin_photo and seat[0]["screen"]["visible"]
                and (seat[0]["x"], seat[0]["y"]) == (795, 452)
                and seat[0]["scale"] >= 3.4 and screenshots[f"{seat_gesture}-end"] == 1
            )
        elif title in contracts:
            contract = contracts[title]
            for name, asset, xy, destination, stays in contract["gestures"]:
                gestures = json_items[f"{name}-gesture"]
                accepted = accepted and len(gestures) == 1 and screenshots[f"{name}-end"] == 1
                if len(gestures) == 1:
                    gesture = gestures[0]
                    accepted = accepted and (gesture["asset"], gesture["scene"]) == (asset, destination)
                    accepted = accepted and (gesture["x"], gesture["y"]) == xy and gesture["screen"]["visible"]
                    if stays:
                        accepted = accepted and gesture["scale"] >= 3.4
            for word, digest in contract["words"]:
                prefix = word.replace(" ", "-")
                readings = json_items[f"{prefix}-geometry"]
                dots = json_items[f"{prefix}-dot-geometry"]
                accepted = accepted and len(readings) == len(dots) == 1
                accepted = accepted and all(r["inside"] and r["visible"] and r["word"] == word
                                            and r["sha256"] == digest for r in readings)
                accepted = accepted and all(dot["dotExposed"] for dot in dots)
                accepted = accepted and all(screenshots[f"{prefix}-{suffix}"] == 1
                                            for suffix in ("view", "painted-card", "dot-card"))
            for name in contract["taps"]:
                accepted = accepted and all(screenshots[f"{name}-{suffix}"] == 1 for suffix in contract["tap_shots"])
            for name in contract["returns"]:
                returns = json_items[name]
                accepted = accepted and len(returns) == 1 and isinstance(returns[0], list) and len(returns[0]) >= 2
                if accepted:
                    scales = returns[0]
                    accepted = all(type(value) in (int, float) for value in scales)
                    accepted = accepted and any(0.74 < value < scales[0] * 0.9 for value in scales[1:])
        row.update(status=result["status"], retry=result["retry"], attachments=dict(attachments),
                   accepted=bool(accepted and result["retry"] == 0))

receipt = {
    "phase": phase, "product": os.environ["BASELINE" if phase == "baseline" else "PRODUCT"],
    "stats": report["stats"], "cases": rows,
    "accepted": sorted(seen) == sorted(cases) and all(row["accepted"] for row in rows)
                and not report["errors"] and (folder / "exit").read_text().strip() == ("1" if phase == "baseline" else "0"),
}
if phase == "mobile-baggage":
    before = json.loads((output / "original-candidate.json").read_bytes())
    receipt["historyRuns"] = ["45949933105", "45950843653", "45952337921"]
    receipt["carriedForward"] = [{"project": row["project"], "journey": row["journey"]}
                                 for row in before["cases"] if row["accepted"]]
    receipt["globalErrors"] = [summarize_error(error) for error in report["errors"]]
(output / f"{phase}.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, ensure_ascii=False))
raise SystemExit(0 if receipt["accepted"] else 1)
