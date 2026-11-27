"""Compare photographed bus and rail objects and retain the existing city journeys."""
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
DISTRICT_ZONES = ("e2e/world.spec.ts", "urban services exposes hospital, airport and office vocabulary through the transit path")
BAGGAGE = ("e2e/baggage-services.spec.ts",
           "baggage services opens the wooden counter and the open suitcase, then restores both parent scenes")
CHECKIN = ("e2e/airport-bag-drop.spec.ts",
           "airport check-in opens the nearest self-service kiosk from its dot and reads the card reader without moving the photograph")
SECURITY = ("e2e/airport-bag-drop.spec.ts",
            "airport security checkpoint reads the front stanchion pole, looks up its collar and returns from both child scenes")
TERMINAL = ("e2e/airport-terminal.spec.ts",
            "the airport terminal reads the suitcase shell and carousel island and restores its words after baggage claim")
OVERVIEW = ("e2e/urban-services-overview.spec.ts",
            "urban services reads the photographed terminal roof and returns from all three destinations")
NARROW = ("e2e/urban-services-overview.spec.ts",
          "the bilingual phone reads the silver terminal roof after returning through the photographed airport entrance")
STREET_TRANSIT = ("e2e/street-transit-photo-reading.spec.ts",
                  "the street and transit round trip reads the museum column shaft and silver escalator side panel and keeps the pediment in the word index")
BUS_PLATFORM = ("e2e/bus-platform-photo-reading.spec.ts",
                "the transit hub journey reads bus seat upholstery and a platform tactile tile and keeps the emergency hammer in the index")
STREET_PHOTO = "/scenes/city-street-bright-v4.jpg"
TRANSIT_PHOTO = "/scenes/transit-hub-premium-v2.jpg"
BUS_PHOTO = "/scenes/electric-bus-premium-v2.jpg"
PLATFORM_PHOTO = "/scenes/railway-platform-premium-v2.jpg"
TERMINAL_SHA = "428e5f9dbcca0f19e8fcedc540a9715362bc55b9b2e51e31d39a4659133f31e1"
OVERVIEW_SHA = "0cc4d2fc02d402b2f5b215711e72d7d93635e889064891bf42477d42e063a19d"
PROJECTS = ("chromium", "mobile-chromium")
phase = sys.argv[1]
assert phase in ("baseline", "candidate")
out = Path(os.environ["RUNNER_TEMP"]) / "frozen-display-evidence" / phase
out.mkdir(parents=True)
temp = Path(os.environ["RUNNER_TEMP"]) / f"browser-{phase}"
temp.mkdir()
cases = [("chromium", *BUS_PLATFORM)]
if phase == "candidate":
    cases.append(("chromium", *STREET_TRANSIT))
    cases.append(("mobile-chromium", *NARROW))
    cases.extend((project, *journey) for project in PROJECTS
                 for journey in (OVERVIEW, DISTRICT_ZONES, TERMINAL, OFFICE, BAGGAGE, CHECKIN, SECURITY, MINIMAP))


def visit(suite):
    yield from suite.get("specs", [])
    for child in suite.get("suites", []):
        yield from visit(child)


def inventory(scene_id, asset, photo_sha, source_sha, count):
    root = Path("dist/client")
    photo = root / asset.lstrip("/")
    relative = Path("data/scenes") / f"{scene_id}.json"
    scene_file = root / relative
    baseline_file = (scene_file if phase == "baseline"
                     else Path(os.environ["RUNNER_TEMP"]) / "frozen/dist/client" / relative)
    original = baseline_file.read_bytes()
    if hashlib.sha256(photo.read_bytes()).hexdigest() != photo_sha or hashlib.sha256(original).hexdigest() != source_sha:
        raise ValueError(f"The {scene_id} photograph or original vocabulary differs from the frozen input")
    scene = json.loads(scene_file.read_bytes())
    labels = scene["labels"]
    index = scene.get("relatedWords", [])
    previous = json.loads(original)
    originals = [(entry["id"], entry["word"], entry["translation"], entry.get("lexemeId"))
                 for entry in previous["labels"] + previous.get("relatedWords", [])]
    current = [(entry["id"], entry["word"], entry["translation"], entry.get("lexemeId")) for entry in labels + index]
    if len(current) != count or Counter(originals) != Counter(current):
        raise ValueError(f"The {count} original bilingual entries must remain in {scene_id}")
    coordinates = Counter((entry["x"], entry["y"]) for entry in labels)
    shared = sum(count > 1 for count in coordinates.values())
    if phase == "candidate" and (shared or any({"x", "y", "priority"} & entry.keys() for entry in index)):
        raise ValueError(f"{scene_id} has shared coordinates or a spatial field on a related word")
    return {"photoSha256": photo_sha, "sceneSha256": hashlib.sha256(scene_file.read_bytes()).hexdigest(),
            "photoWords": len(labels), "indexWords": len(index),
            "sharedCoordinates": shared, "linkedPhotoWords": sum(bool(entry.get("lexemeId")) for entry in labels)}


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


def narrow_reading(observed, images, result):
    entries = observed.get("bilingual-roof-reading", [])
    if len(entries) != 1 or not all(name in images for name in ("bilingual-roof-before-tap", "bilingual-roof-card")):
        return False
    reading = entries[0]
    point = reading.get("point", {})
    if (reading.get("scene") != "urban-services" or point.get("visible") is not True
            or not all(isinstance(point.get(axis), (int, float)) and 0 <= point[axis] < limit
                       for axis, limit in (("x", 385), ("y", 705)))):
        return False
    return (result["status"] == "passed" and not result["errors"]
            and reading.get("word") == "terminal roof" and reading.get("meaning") == "航站楼屋顶")


def overview_reading(observed, images, result):
    entries = observed.get("terminal-roof-geometry", [])
    if len(entries) != 1 or "terminal-roof-view" not in images:
        return False
    reading = entries[0]
    if reading.get("word") != "terminal roof" or reading.get("sha256") != OVERVIEW_SHA or reading.get("visible") is not True:
        return False
    dots = observed.get("terminal-roof-dot-geometry", [])
    return (result["status"] == "passed" and not result["errors"] and reading.get("inside") is True
            and len(dots) == 1 and dots[0].get("dotExposed") is True
            and all(name in images for name in ("terminal-roof-painted-card", "terminal-roof-dot-card",
                                                "silver-roof-reading", "silver-roof-after-airport",
                                                "urban-services-related-seal")))


def terminal_readings(observed, images, result):
    for word in ("luggage shell", "carousel island"):
        name = word.replace(" ", "-")
        readings = observed.get(name + "-geometry", [])
        if len(readings) != 1 or name + "-view" not in images:
            return False
        reading = readings[0]
        if reading.get("word") != word or reading.get("sha256") != TERMINAL_SHA or reading.get("visible") is not True:
            return False
        dots = observed.get(name + "-dot-geometry", [])
        if (reading.get("inside") is not True or len(dots) != 1 or dots[0].get("dotExposed") is not True
                or not all(name + suffix in images for suffix in ("-dot-card", "-painted-card", "-photo-reading"))):
            return False
    return (result["status"] == "passed" and not result["errors"]
            and all(name in images for name in ("returned-terminal-shell-reading", "returned-terminal-suitcase-lining")))


def photographed_word(observed, images, name, scene, photo, coordinates, card):
    entries = observed.get(name + "-result", [])
    if len(entries) != 1 or images.get(name) != (1440, 900):
        return False
    reading = entries[0]
    if not {"point", "word", "meaning"} <= reading.keys():
        return False
    point = reading["point"]
    return (reading.get("scene") == scene and reading.get("photo") == photo
            and (reading.get("x"), reading.get("y")) == coordinates
            and (reading["word"], reading["meaning"]) == card
            and point.get("visible") is True
            and all(isinstance(point.get(axis), (int, float)) and 0 <= point[axis] < limit
                    for axis, limit in (("x", 1440), ("y", 900))))


def street_transit_readings(observed, images, result):
    for visits, scene, photo, coordinates, card in (
        (("street-arrival", "street-return"), "city-street", STREET_PHOTO, (361, 422), ("column shaft", "柱身")),
        (("transit-arrival", "transit-reentry"), "transit-hub", TRANSIT_PHOTO, (1051, 510), ("escalator side panel", "扶梯侧板")),
    ):
        for visit in visits:
            if not photographed_word(observed, images, visit, scene, photo, coordinates, card):
                return False
    return images.get("pediment-search-card") == (1440, 900) and result["status"] == "passed" and not result["errors"]


def bus_platform_readings(observed, images, result):
    cards = (("seat upholstery", "座椅面料", "electric-bus", BUS_PHOTO, (777, 465)),
             ("tactile tile", "盲道砖", "railway-platform", PLATFORM_PHOTO, (743, 839)))
    for word, meaning, scene, photo, point in cards:
        card = (None, None) if phase == "baseline" else (word, meaning)
        if not photographed_word(observed, images, word.replace(" ", "-"), scene, photo, point, card):
            return False
    hammer = observed.get("emergency-hammer-index-result", [])
    if len(hammer) != 1 or images.get("emergency-hammer-index") != (1440, 900):
        return False
    reading = hammer[0]
    before, after = reading.get("before"), reading.get("after")
    if (reading.get("scene") != "electric-bus" or not all(isinstance(v, str) and v for v in (before, after))
            or type(reading.get("paintedMarkers")) is not int):
        return False
    if phase == "candidate":
        return (result["status"] == "passed" and not result["errors"]
                and reading.get("indexName") == "emergency hammer，安全锤，图中未标注" and reading.get("related") is True
                and reading["paintedMarkers"] == 0 and before == after)
    expected = {f"clicking the photographed {word} opens its word card" for word, *_ in cards}
    expected.add("the emergency hammer is index-only and preserves the bus framing")
    headings = [re.sub(r"\x1b\[[0-9;]*m", "", err.get("message", "")).partition("\n")[0].removeprefix("Error: ").strip()
                for err in result["errors"]]
    return (result["status"] == "failed" and Counter(headings) == Counter(expected)
            and reading.get("indexName") == "emergency hammer，安全锤" and reading.get("related") is False
            and reading["paintedMarkers"] > 0 and before != after)


scenes = {
    "city-street": inventory("city-street", STREET_PHOTO, "e280b0047e7bf0dbcf7f1ff392c38d5b88f06e11bb6304f3d998f47f37438fdf",
                             "c7a161b33a84d256719168a40eff7c84b096be98ab8d610e485686182fe7965b", 179),
    "transit-hub": inventory("transit-hub", TRANSIT_PHOTO, "0404f4a4fcfef1cba37b54231530085b708e498b1e21dd94e5585477f68652f9",
                             "c737033542f712314d9fc0f3b0dc474370fe540a930c46fed24e694cb39bd199", 175),
    "electric-bus": inventory("electric-bus", BUS_PHOTO, "71fd16eaad65c46a9aa9ea0c85cb87b788337e44c57b76f0365449dda38a9a63",
                              "f0c26cf80d1d3895e083f0998bdbf42a341e9a375bad201488f8f96ff06fa6fa", 85),
    "railway-platform": inventory("railway-platform", PLATFORM_PHOTO, "85250ba12bfa202f5f9d43b690d44d32118647620f0fe1c39ce3830baa682fb0",
                                  "77f1bee182e52d92f83dbcab72cff7877f2f169cadcd3a8e7dbef6d6c761a9d5", 126),
}
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
        if title == BUS_PLATFORM[1]:
            row["accepted"] = bus_platform_readings(observed, images, result)
            continue
        if title == STREET_TRANSIT[1]:
            row["accepted"] = street_transit_readings(observed, images, result)
            continue
        if title == NARROW[1]:
            row["accepted"] = narrow_reading(observed, images, result)
            continue
        if title == OVERVIEW[1]:
            row["accepted"] = overview_reading(observed, images, result)
            continue
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
                                           "scenes": scenes,
                                           "reportSha256": hashlib.sha256(reporter.read_bytes()).hexdigest(),
                                           "cases": rows}, indent=2) + "\n")
sys.exit(0 if accepted else 1)
