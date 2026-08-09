#!/usr/bin/env python3
"""Build the committed vocabulary atlas from pinned, local source artifacts.

The script intentionally does not download inputs. Regeneration is an explicit
data-maintenance operation: obtain the two pinned artifacts, verify where they
came from, then pass both paths here. Ordinary application CI should run the
JavaScript validator against the committed output instead.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.metadata
import json
import re
import shutil
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


WORD_COUNT = 10_000
CANDIDATE_COUNT = 30_000
SHARD_SIZE = 1_000
SCHEMA_VERSION = 1

WORDFREQ_VERSION = "3.1.1"
WORDFREQ_WHEEL_NAME = "wordfreq-3.1.1-py3-none-any.whl"
WORDFREQ_WHEEL_SHA256 = (
    "4b1c6ecffc6198be3396d5cf871c4423ca71c907c231348d352dd54d62b97473"
)
WORDFREQ_UPSTREAM = "https://github.com/rspeer/wordfreq"

ECDICT_COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
ECDICT_FILE_NAME = "ecdict.csv"
ECDICT_SIZE = 65_933_428
ECDICT_SHA256 = (
    "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
)
ECDICT_UPSTREAM = f"https://github.com/skywind3000/ECDICT/tree/{ECDICT_COMMIT}"

SOURCE_REFS = ("wordfreq-3.1.1", f"ecdict-{ECDICT_COMMIT[:12]}")
LICENSE_REFS = ("CC-BY-SA-4.0", "MIT-ECDICT")
POS_ORDER = (
    "noun",
    "verb",
    "adjective",
    "adverb",
    "pronoun",
    "preposition",
    "conjunction",
    "determiner",
    "numeral",
    "auxiliary",
    "interjection",
    "abbreviation",
    "phrase",
)
POS_LABELS = {
    "n": "noun",
    "noun": "noun",
    "v": "verb",
    "vi": "verb",
    "vt": "verb",
    "verb": "verb",
    "a": "adjective",
    "adj": "adjective",
    "adjective": "adjective",
    "ad": "adverb",
    "adv": "adverb",
    "adverb": "adverb",
    "pron": "pronoun",
    "pronoun": "pronoun",
    "prep": "preposition",
    "preposition": "preposition",
    "conj": "conjunction",
    "conjunction": "conjunction",
    "art": "determiner",
    "det": "determiner",
    "determiner": "determiner",
    "num": "numeral",
    "numeral": "numeral",
    "aux": "auxiliary",
    "auxiliary": "auxiliary",
    "int": "interjection",
    "interj": "interjection",
    "interjection": "interjection",
    "abbr": "abbreviation",
    "abbreviation": "abbreviation",
    "phr": "phrase",
    "phrase": "phrase",
}
POS_LABEL_PATTERN = re.compile(
    r"(?:(?<=^)|(?<=[\n;,；]))\s*"
    r"(?:\[[^\]\n]{1,24}\]\s*)?"
    r"(noun|verb|adjective|adverb|pronoun|preposition|conjunction|"
    r"determiner|numeral|auxiliary|interjection|abbreviation|phrase|"
    r"interj|abbr|prep|pron|conj|adj|adv|aux|art|det|num|phr|vt|vi|ad|n|v|a)"
    r"\.",
    re.IGNORECASE,
)
CJK_PATTERN = re.compile(r"[\u3400-\u9fff]")
SPACE_PATTERN = re.compile(r"\s+")
DOMAIN_LINE_PATTERN = re.compile(r"^(?:[A-Za-z]+\.\s*)?\[[^\]]+\]")


@dataclass(frozen=True)
class Candidate:
    display_word: str
    frequency_token: str
    normalized: str
    source_rank: int


@dataclass(frozen=True)
class EcdictRecord:
    phonetic: str | None
    meaning: str
    parts_of_speech: tuple[str, ...]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--wordfreq-wheel",
        type=Path,
        required=True,
        help=f"Path to the pinned {WORDFREQ_WHEEL_NAME} artifact.",
    )
    parser.add_argument(
        "--ecdict",
        type=Path,
        required=True,
        help="Path to the pinned ECDICT ecdict.csv artifact.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("public/data/vocabulary"),
        help="Generated-data directory (default: public/data/vocabulary).",
    )
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_file(
    path: Path, *, expected_name: str, expected_sha256: str, expected_size: int | None
) -> None:
    if not path.is_file():
        raise SystemExit(f"Missing source artifact: {path}")
    actual_size = path.stat().st_size
    if expected_size is not None and actual_size != expected_size:
        raise SystemExit(
            f"Unexpected size for {path}: {actual_size}; expected {expected_size}"
        )
    actual_sha256 = sha256_file(path)
    if actual_sha256 != expected_sha256:
        raise SystemExit(
            f"SHA-256 mismatch for {path}: {actual_sha256}; expected {expected_sha256}"
        )
    if path.name != expected_name:
        print(
            f"note: verified {path.name!r} as pinned artifact {expected_name!r}",
            file=sys.stderr,
        )


def require_wordfreq() -> tuple[Any, Any]:
    try:
        installed = importlib.metadata.version("wordfreq")
        from wordfreq import top_n_list, zipf_frequency
    except (importlib.metadata.PackageNotFoundError, ImportError) as error:
        raise SystemExit(
            "wordfreq 3.1.1 is required. Install the verified wheel into an "
            "isolated environment before running this script."
        ) from error
    if installed != WORDFREQ_VERSION:
        raise SystemExit(
            f"wordfreq {installed} is installed; expected exactly {WORDFREQ_VERSION}"
        )
    return top_n_list, zipf_frequency


def normalize_word(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip()


def normalized_key(value: str) -> str:
    return normalize_word(value).casefold()


def is_display_word(value: str) -> bool:
    """Allow letters with single internal apostrophes or hyphens."""

    if not value or not value[0].isalpha() or not value[-1].isalpha():
        return False
    previous_was_separator = False
    for character in value:
        if character.isalpha():
            previous_was_separator = False
            continue
        if character not in {"'", "’", "-"} or previous_was_separator:
            return False
        previous_was_separator = True
    return True


def ranked_candidates(top_n_list: Any) -> list[Candidate]:
    candidates: list[Candidate] = []
    seen: set[str] = set()
    for source_rank, raw_word in enumerate(
        top_n_list("en", CANDIDATE_COUNT, wordlist="best"), start=1
    ):
        raw_word = raw_word.strip()
        # Apply the lexical filter before NFKC as well as after it. Otherwise
        # symbols with compatibility decompositions (notably ™ -> TM) become
        # artificial vocabulary entries.
        if not is_display_word(raw_word):
            continue
        display_word = normalize_word(raw_word)
        key = display_word.casefold()
        if key in seen or not is_display_word(display_word):
            continue
        seen.add(key)
        candidates.append(Candidate(display_word, raw_word, key, source_rank))
    return candidates


def compact_text(value: str, *, limit: int) -> str | None:
    compact = SPACE_PATTERN.sub(" ", unicodedata.normalize("NFKC", value)).strip()
    if not compact:
        return None
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip(" ,，;；:：") + "…"


def compact_meaning(value: str) -> str | None:
    # ECDICT contains both real line endings and literal escaped line endings.
    normalized = (
        unicodedata.normalize("NFKC", value)
        .replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\r", "\n")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
    )
    lines: list[str] = []
    for raw_line in normalized.split("\n"):
        line = SPACE_PATTERN.sub(" ", raw_line).strip()
        if line and line not in lines:
            lines.append(line)
    if not lines:
        return None

    general_lines = [line for line in lines if not DOMAIN_LINE_PATTERN.match(line)]
    chosen = general_lines if general_lines else lines
    meaning = "\n".join(chosen[:3])
    if len(meaning) > 360:
        meaning = meaning[:359].rstrip(" ,，;；:：") + "…"
    return meaning if CJK_PATTERN.search(meaning) else None


def infer_parts_of_speech(translation: str) -> tuple[str, ...]:
    found: set[str] = set()
    # ECDICT's English definition column includes historical dictionary text
    # that can describe another spelling before the intended entry (for
    # example, "the" begins with "v. i. See Thee."). The compact Chinese
    # translation labels are much less ambiguous, so POS inference is limited
    # to explicit labels in that field.
    translation = (
        translation.replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\r", "\n")
    )
    for match in POS_LABEL_PATTERN.finditer(translation):
        mapped = POS_LABELS.get(match.group(1).lower())
        if mapped:
            found.add(mapped)
    return tuple(part for part in POS_ORDER if part in found)


def load_ecdict(path: Path, candidate_keys: set[str]) -> dict[str, EcdictRecord]:
    records: dict[str, EcdictRecord] = {}
    csv.field_size_limit(32 * 1024 * 1024)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"word", "phonetic", "translation"}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise SystemExit(
                f"ECDICT columns are invalid; required {sorted(required)}, got "
                f"{reader.fieldnames}"
            )
        for row in reader:
            key = normalized_key(row["word"])
            if key not in candidate_keys or key in records:
                continue
            meaning = compact_meaning(row["translation"])
            if meaning is None:
                continue
            records[key] = EcdictRecord(
                phonetic=compact_text(row["phonetic"], limit=120),
                meaning=meaning,
                parts_of_speech=infer_parts_of_speech(row["translation"]),
            )
    return records


def stable_id(normalized: str) -> str:
    suffix = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]
    return f"en-{suffix}"


def atlas_group(display_word: str) -> str:
    first = display_word.casefold()[0]
    return first if "a" <= first <= "z" else "other"


def make_entries(
    candidates: Iterable[Candidate], records: dict[str, EcdictRecord], zipf_frequency: Any
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for candidate in candidates:
        record = records.get(candidate.normalized)
        if record is None:
            continue
        rank = len(entries) + 1
        entries.append(
            {
                "atlasGroup": atlas_group(candidate.display_word),
                "displayWord": candidate.display_word,
                "id": stable_id(candidate.normalized),
                "licenseRefs": list(LICENSE_REFS),
                "meaning": record.meaning,
                "partsOfSpeech": list(record.parts_of_speech),
                "phonetic": record.phonetic,
                "rank": rank,
                "sourceRank": candidate.source_rank,
                "sourceRefs": list(SOURCE_REFS),
                "zipf": round(
                    float(
                        zipf_frequency(candidate.frequency_token, "en", wordlist="best")
                    ),
                    2,
                ),
            }
        )
        if len(entries) == WORD_COUNT:
            break
    if len(entries) != WORD_COUNT:
        raise SystemExit(
            f"Only {len(entries):,} eligible entries were found; expected {WORD_COUNT:,}"
        )
    return entries


def json_bytes(value: Any) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        + "\n"
    ).encode("utf-8")


def source_manifest(wheel_path: Path, ecdict_path: Path) -> list[dict[str, Any]]:
    return [
        {
            "artifact": {
                "bytes": wheel_path.stat().st_size,
                "name": WORDFREQ_WHEEL_NAME,
                "sha256": WORDFREQ_WHEEL_SHA256,
            },
            "dataLicense": "CC-BY-SA-4.0",
            "id": SOURCE_REFS[0],
            "kind": "frequency-ranking",
            "softwareLicense": "Apache-2.0",
            "upstream": WORDFREQ_UPSTREAM,
            "version": WORDFREQ_VERSION,
        },
        {
            "artifact": {
                "bytes": ecdict_path.stat().st_size,
                "name": ECDICT_FILE_NAME,
                "sha256": ECDICT_SHA256,
            },
            "dataLicense": "MIT",
            "id": SOURCE_REFS[1],
            "kind": "chinese-meaning-and-phonetic",
            "upstream": ECDICT_UPSTREAM,
            "version": ECDICT_COMMIT,
        },
    ]


def write_output(
    output: Path,
    entries: list[dict[str, Any]],
    wheel_path: Path,
    ecdict_path: Path,
) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    for old_shard in output.glob("rank-*.json"):
        old_shard.unlink()

    shards: list[dict[str, Any]] = []
    for offset in range(0, len(entries), SHARD_SIZE):
        shard_entries = entries[offset : offset + SHARD_SIZE]
        rank_start = shard_entries[0]["rank"]
        rank_end = shard_entries[-1]["rank"]
        filename = f"rank-{rank_start:05d}-{rank_end:05d}.json"
        payload = {
            "entries": shard_entries,
            "licenseRefs": list(LICENSE_REFS),
            "rankBand": {"end": rank_end, "start": rank_start},
            "schemaVersion": SCHEMA_VERSION,
            "sourceRefs": list(SOURCE_REFS),
        }
        encoded = json_bytes(payload)
        (output / filename).write_bytes(encoded)
        shards.append(
            {
                "bytes": len(encoded),
                "count": len(shard_entries),
                "path": filename,
                "rankEnd": rank_end,
                "rankStart": rank_start,
                "sha256": hashlib.sha256(encoded).hexdigest(),
                "sourceRankEnd": shard_entries[-1]["sourceRank"],
                "sourceRankStart": shard_entries[0]["sourceRank"],
            }
        )

    manifest = {
        "entryCount": len(entries),
        "generatedBy": "scripts/generate-vocabulary.py",
        "licenseRefs": list(LICENSE_REFS),
        "licenses": [
            {
                "id": "CC-BY-SA-4.0",
                "url": "https://creativecommons.org/licenses/by-sa/4.0/",
            },
            {
                "id": "MIT-ECDICT",
                "notice": "../THIRD_PARTY_NOTICES.md#ecdict",
            },
        ],
        "rankRange": {"end": entries[-1]["rank"], "start": entries[0]["rank"]},
        "schemaVersion": SCHEMA_VERSION,
        "shardCount": len(shards),
        "shards": shards,
        "sourceRankRange": {
            "end": entries[-1]["sourceRank"],
            "start": entries[0]["sourceRank"],
        },
        "sources": source_manifest(wheel_path, ecdict_path),
    }
    (output / "manifest.json").write_bytes(json_bytes(manifest))
    return manifest


def validate_output_path(output: Path) -> None:
    """Keep replacement confined to the generator's dedicated data directory."""

    resolved = output.resolve()
    if not (
        resolved.name == "vocabulary"
        and resolved.parent.name == "data"
        and resolved.parent.parent.name == "public"
    ):
        raise SystemExit(
            "Refusing to replace an output outside public/data/vocabulary: "
            f"{resolved}"
        )


def main() -> None:
    args = parse_args()
    validate_output_path(args.output)
    verify_file(
        args.wordfreq_wheel,
        expected_name=WORDFREQ_WHEEL_NAME,
        expected_sha256=WORDFREQ_WHEEL_SHA256,
        expected_size=56_834_549,
    )
    verify_file(
        args.ecdict,
        expected_name=ECDICT_FILE_NAME,
        expected_sha256=ECDICT_SHA256,
        expected_size=ECDICT_SIZE,
    )
    top_n_list, zipf_frequency = require_wordfreq()
    candidates = ranked_candidates(top_n_list)
    records = load_ecdict(args.ecdict, {candidate.normalized for candidate in candidates})
    entries = make_entries(candidates, records, zipf_frequency)

    temporary_output = args.output.with_name(f".{args.output.name}.generating")
    if temporary_output.exists():
        shutil.rmtree(temporary_output)
    try:
        manifest = write_output(
            temporary_output, entries, args.wordfreq_wheel, args.ecdict
        )
        if args.output.exists():
            shutil.rmtree(args.output)
        temporary_output.replace(args.output)
    finally:
        if temporary_output.exists():
            shutil.rmtree(temporary_output)

    print(
        json.dumps(
            {
                "entryCount": manifest["entryCount"],
                "output": str(args.output),
                "shardCount": manifest["shardCount"],
                "sourceRankEnd": manifest["sourceRankRange"]["end"],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
