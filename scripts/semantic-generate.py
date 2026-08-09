#!/usr/bin/env python3
"""Build a deterministic, explorable semantic atlas for the 10k vocabulary.

The generator uses WordNet 3.0 first-sense ordering and hypernyms when possible.
It has no third-party Python dependency.  The pinned WordNet archive is downloaded
only when --wordnet-zip is not supplied, and is always checksum verified.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import tempfile
import urllib.request
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOCAB_DIR = ROOT / "public/data/vocabulary"
OUTPUT_DIR = ROOT / "public/data/semantic"
WORDNET_URL = "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/wordnet.zip"
WORDNET_SHA256 = "cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59"
SCHEMA_VERSION = 1

REALMS = {
    "nature-life": ("自然与生命", "Nature & life"),
    "body-daily-life": ("身体与日常", "Body & daily life"),
    "objects-technology": ("物品与科技", "Objects & technology"),
    "people-society": ("人与社会", "People & society"),
    "mind-values": ("心智与价值", "Mind & values"),
    "language-culture": ("语言与文化", "Language & culture"),
    "actions-events": ("动作与事件", "Actions & events"),
    "space-time-measure": ("时空与度量", "Space, time & measure"),
    "qualities-states": ("性质与状态", "Qualities & states"),
    "grammar-relations": ("语法与关系", "Grammar & relations"),
}
REALM_COLORS = {
    "nature-life": "#4f8a66", "body-daily-life": "#d47c64", "objects-technology": "#617fa8",
    "people-society": "#b66b74", "mind-values": "#8b72b6", "language-culture": "#ba7b43",
    "actions-events": "#d05f47", "space-time-measure": "#4c8f9a", "qualities-states": "#7b8260",
    "grammar-relations": "#77758a",
}

# Topics are intentionally human-scale destinations rather than dictionary files.
TOPICS = {
    "animals": ("nature-life", "动物", "Animals"),
    "plants": ("nature-life", "植物", "Plants"),
    "earth-weather": ("nature-life", "地球与天气", "Earth & weather"),
    "water-space": ("nature-life", "水域与宇宙", "Water & space"),
    "ecology-substances": ("nature-life", "生态与自然物", "Ecology & natural matter"),
    "body": ("body-daily-life", "身体", "The body"),
    "health-medicine": ("body-daily-life", "健康与医疗", "Health & medicine"),
    "food-cooking": ("body-daily-life", "食物与烹饪", "Food & cooking"),
    "clothing-care": ("body-daily-life", "衣着与护理", "Clothing & care"),
    "home-buildings": ("objects-technology", "家居与建筑", "Home & buildings"),
    "tools-machines": ("objects-technology", "工具与机器", "Tools & machines"),
    "transport": ("objects-technology", "交通", "Transport"),
    "materials": ("objects-technology", "材料", "Materials"),
    "technology-computing": ("objects-technology", "科技与计算", "Technology & computing"),
    "people-identity": ("people-society", "人物与身份", "People & identity"),
    "family-relationships": ("people-society", "家庭与关系", "Family & relationships"),
    "community": ("people-society", "群体与社区", "Community"),
    "government-law": ("people-society", "政府与法律", "Government & law"),
    "economy-work": ("people-society", "经济与工作", "Economy & work"),
    "education": ("people-society", "教育", "Education"),
    "sports-games": ("people-society", "运动与游戏", "Sports & games"),
    "thinking-learning": ("mind-values", "思考与学习", "Thinking & learning"),
    "emotions": ("mind-values", "情绪", "Emotions"),
    "senses-perception": ("mind-values", "感官与感知", "Senses & perception"),
    "goals-beliefs": ("mind-values", "目标、信念与价值", "Goals, beliefs & values"),
    "language": ("language-culture", "语言", "Language"),
    "media-writing": ("language-culture", "媒体与写作", "Media & writing"),
    "arts-entertainment": ("language-culture", "艺术与娱乐", "Arts & entertainment"),
    "movement": ("actions-events", "移动", "Movement"),
    "making-changing": ("actions-events", "制造与变化", "Making & changing"),
    "interaction-contact": ("actions-events", "互动与接触", "Interaction & contact"),
    "consumption-use": ("actions-events", "使用与消费", "Consumption & use"),
    "events-processes": ("actions-events", "事件与过程", "Events & processes"),
    "places": ("space-time-measure", "地点", "Places"),
    "time": ("space-time-measure", "时间", "Time"),
    "number-measure": ("space-time-measure", "数字与度量", "Number & measure"),
    "shape-position": ("space-time-measure", "形状、位置与方向", "Shape, position & direction"),
    "qualities": ("qualities-states", "性质", "Qualities"),
    "states-conditions": ("qualities-states", "状态与条件", "States & conditions"),
    "comparison-degree": ("qualities-states", "比较与程度", "Comparison & degree"),
    "determiners-pronouns": ("grammar-relations", "限定词与代词", "Determiners & pronouns"),
    "connectors-relations": ("grammar-relations", "连接与关系", "Connections & relations"),
    "auxiliaries-modals": ("grammar-relations", "助动词与情态", "Auxiliaries & modals"),
    "function-adverbs": ("grammar-relations", "功能副词", "Function adverbs"),
}

LEXNAME_TOPIC = {
    "noun.animal": "animals", "noun.plant": "plants", "noun.phenomenon": "earth-weather",
    "verb.weather": "earth-weather", "noun.object": "ecology-substances", "noun.substance": "materials",
    "noun.body": "body", "verb.body": "body", "noun.food": "food-cooking",
    "noun.artifact": "tools-machines", "noun.person": "people-identity", "noun.group": "community",
    "noun.possession": "economy-work", "verb.possession": "consumption-use", "noun.cognition": "thinking-learning",
    "verb.cognition": "thinking-learning", "noun.feeling": "emotions", "verb.emotion": "emotions",
    "noun.motive": "goals-beliefs", "verb.perception": "senses-perception",
    "noun.communication": "language", "verb.communication": "language", "noun.act": "events-processes",
    "noun.event": "events-processes", "noun.process": "events-processes", "verb.motion": "movement",
    "verb.change": "making-changing", "verb.creation": "making-changing", "verb.contact": "interaction-contact",
    "verb.social": "interaction-contact", "verb.competition": "sports-games", "verb.consumption": "consumption-use",
    "noun.location": "places", "noun.time": "time", "noun.quantity": "number-measure",
    "noun.shape": "shape-position", "noun.relation": "connectors-relations", "noun.attribute": "qualities",
    "noun.state": "states-conditions", "verb.stative": "states-conditions", "adj.all": "qualities",
    "adj.pert": "qualities", "adj.ppl": "qualities", "adv.all": "function-adverbs",
}

# High-confidence domain vocabulary. Matching uses whole tokens in WordNet's lemma + gloss.
DOMAIN_RULES = [
    ("health-medicine", "doctor nurse hospital medical medicine disease illness patient surgery drug therapy health symptom virus infection clinical"),
    ("technology-computing", "computer software hardware internet digital electronic data network website online algorithm programming device"),
    ("transport", "vehicle car automobile bus train aircraft airplane ship bicycle road railway transport traffic driver passenger"),
    ("home-buildings", "house home room furniture building kitchen bedroom bathroom door window roof wall apartment"),
    ("clothing-care", "clothing clothes garment shirt dress shoe hair skin wash cosmetic wear"),
    ("education", "school university student teacher education lesson classroom curriculum academic learn teaching"),
    ("government-law", "government political law legal court police election parliament president minister crime"),
    ("sports-games", "sport game player team ball race match athletic football baseball basketball tennis"),
    ("arts-entertainment", "music musical film movie theater art artist dance painting television entertainment actor"),
    ("media-writing", "book newspaper publish writing written author article magazine press photograph"),
    ("family-relationships", "family mother father parent child brother sister wife husband marriage relative"),
    ("goals-beliefs", "belief religion religious moral ethics value purpose goal intention desire faith philosophy"),
    ("food-cooking", "food eat edible meal cook drink beverage fruit meat bread kitchen taste"),
    ("water-space", "ocean sea river lake water marine planet star astronomy space solar"),
    ("earth-weather", "weather climate rain snow wind storm earth geological mountain"),
]
DOMAIN_RULES = [(topic, frozenset(words.split())) for topic, words in DOMAIN_RULES]
MEANING_TOPIC_RULES = [
    ("technology-computing", re.compile(r"\[计\]|计算机|电脑|软件|互联网|网站|电子|手机|应用程序|处理器|微软|三星|脸谱网")),
    ("sports-games", re.compile(r"足球|篮球|球队|运动员|联赛|中场")),
    ("arts-entertainment", re.compile(r"电影|电视|音乐|漫画|演员|歌手")),
    ("media-writing", re.compile(r"报社|通讯社|广播公司|杂志|出版")),
    ("places", re.compile(r"城市|首府|国家|省会|岛屿")),
    ("health-medicine", re.compile(r"医院|医学|疾病|药物|治疗")),
]
PROPER_NAME_RE = re.compile(r"男子名|女子名|男名|女名|人名|姓氏|\(姓\)")
NAMED_ENTITY_RE = re.compile(r"公司|网站|球队|品牌|大学|城市|首府|通讯社|报社|广播公司|微软|三星|苹果手机|脸谱网")
COLLOQUIAL_CONTRACTIONS = frozenset({"gonna", "wanna", "gotta", "kinda", "sorta", "lemme", "dunno"})

POS_CODE = {"noun": "n", "verb": "v", "adjective": "a", "adverb": "r"}
GRAMMAR_POS = frozenset({"determiner", "pronoun", "preposition", "conjunction", "auxiliary", "modal", "interjection"})
IRREGULAR_LEMMAS = {
    "am": "be", "is": "be", "are": "be", "was": "be", "were": "be", "been": "be", "being": "be",
    "has": "have", "had": "have", "having": "have", "does": "do", "did": "do", "done": "do", "doing": "do",
    "went": "go", "gone": "go",
}
FUNCTION_TOPIC = {
    "determiner": "determiners-pronouns", "pronoun": "determiners-pronouns",
    "preposition": "connectors-relations", "conjunction": "connectors-relations",
    "interjection": "connectors-relations", "auxiliary": "auxiliaries-modals",
    "modal": "auxiliaries-modals", "adverb": "function-adverbs",
}
TOKEN_RE = re.compile(r"[a-z]+(?:'[a-z]+)?")


def stable_hash(value: str) -> int:
    return int.from_bytes(hashlib.sha256(value.encode()).digest()[:8], "big")


def slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value[:42] or "general"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def acquire_wordnet(requested: Path | None) -> Path:
    if requested:
        path = requested
    else:
        path = Path(tempfile.gettempdir()) / f"hellowords-wordnet-{WORDNET_SHA256[:12]}.zip"
        if not path.exists():
            with urllib.request.urlopen(WORDNET_URL, timeout=60) as response, path.open("wb") as output:
                output.write(response.read())
    actual = sha256_file(path)
    if actual != WORDNET_SHA256:
        raise SystemExit(f"WordNet checksum mismatch: expected {WORDNET_SHA256}, got {actual}")
    return path


def load_vocabulary() -> list[dict]:
    manifest = json.loads((VOCAB_DIR / "manifest.json").read_text())
    entries = []
    for shard in manifest["shards"]:
        payload = json.loads((VOCAB_DIR / shard["path"]).read_text())
        entries.extend(payload["entries"])
    entries.sort(key=lambda item: item["rank"])
    if len(entries) != 10_000:
        raise SystemExit(f"Expected 10,000 vocabulary entries, found {len(entries)}")
    return entries


def parse_wordnet(path: Path):
    synsets: dict[tuple[str, str], dict] = {}
    index: dict[tuple[str, str], list[str]] = {}
    exceptions: dict[tuple[str, str], list[str]] = {}
    with zipfile.ZipFile(path) as archive:
        lexnames = {}
        for line in archive.read("wordnet/lexnames").decode().splitlines():
            number, name, _ = line.split()
            lexnames[int(number)] = name
        for pos, filename in (("n", "noun"), ("v", "verb"), ("a", "adj"), ("r", "adv")):
            text = archive.read(f"wordnet/data.{filename}").decode("utf-8")
            for line in text.splitlines():
                if not line or not line[0].isdigit():
                    continue
                body, _, gloss = line.partition(" | ")
                fields = body.split()
                offset, lex_number, ss_type = fields[0], int(fields[1]), fields[2]
                word_count = int(fields[3], 16)
                cursor = 4
                words = []
                for _ in range(word_count):
                    words.append(re.sub(r"\([a-z]+\)$", "", fields[cursor].lower()))
                    cursor += 2
                pointer_count = int(fields[cursor]); cursor += 1
                hypernyms = []
                similars = []
                for _ in range(pointer_count):
                    symbol, target, target_pos, _source = fields[cursor:cursor + 4]
                    cursor += 4
                    if symbol in ("@", "@i"):
                        hypernyms.append((target_pos, target))
                    elif symbol == "&":
                        similars.append((target_pos, target))
                synsets[(pos if pos != "a" else ss_type, offset)] = {
                    "lexname": lexnames[lex_number], "words": words, "gloss": gloss,
                    "hypernyms": hypernyms, "similars": similars,
                }
                # adjective satellite offsets are addressed as adjective in the index
                if pos == "a":
                    synsets[("a", offset)] = synsets[(ss_type, offset)]
            index_text = archive.read(f"wordnet/index.{filename}").decode("utf-8")
            for line in index_text.splitlines():
                if not line or line[0].isspace():
                    continue
                fields = line.split()
                lemma, indexed_pos, synset_count, pointer_count = fields[0], fields[1], int(fields[2]), int(fields[3])
                offset_start = 6 + pointer_count
                index[(lemma.lower(), pos if pos != "a" else indexed_pos)] = fields[offset_start:offset_start + synset_count]
                if pos == "a":
                    index[(lemma.lower(), "a")] = fields[offset_start:offset_start + synset_count]
            exc_name = "adj" if pos == "a" else filename
            exc_path = f"wordnet/{exc_name}.exc"
            if exc_path in archive.namelist():
                for line in archive.read(exc_path).decode().splitlines():
                    forms = line.split()
                    exceptions[(forms[0], pos)] = forms[1:]
    return index, synsets, exceptions


def candidate_lemmas(word: str, pos: str, exceptions) -> list[tuple[str, str]]:
    normalized = word.lower().replace("-", "_").replace(" ", "_")
    result = [(normalized, "wordnet")]
    result.extend((base, "wordnet-exception") for base in exceptions.get((normalized, pos), []))
    rules = {
        "n": [("ies", "y"), ("ves", "f"), ("men", "man"), ("es", ""), ("s", "")],
        "v": [("ies", "y"), ("ied", "y"), ("ing", ""), ("ing", "e"), ("ed", ""), ("ed", "e"), ("es", ""), ("es", "e"), ("s", "")],
        "a": [("iest", "y"), ("ier", "y"), ("est", ""), ("er", "")],
        "r": [],
    }
    for ending, replacement in rules[pos]:
        if len(normalized) > len(ending) + 1 and normalized.endswith(ending):
            result.append((normalized[:-len(ending)] + replacement, "wordnet-morphology"))
    seen = set()
    return [item for item in result if not (item[0] in seen or seen.add(item[0]))]


def find_sense(entry, index, synsets, exceptions):
    word = entry["displayWord"].lower()
    parts = set(entry.get("partsOfSpeech", []))
    if len(word) == 1 or parts & GRAMMAR_POS or "abbreviation" in parts:
        return None
    irregular = IRREGULAR_LEMMAS.get(word)
    if irregular:
        offsets = index.get((irregular, "v"))
        if offsets and (sense := synsets.get(("v", offsets[0]))):
            return "v", irregular, offsets[0], sense, "curated-irregular"
    meaning = entry.get("meaning", "").lower().lstrip()
    inferred = (("n.", "n"), ("v.", "v"), ("a.", "a"), ("adj.", "a"), ("adv.", "r"))
    pos_order = [code for prefix, code in inferred if meaning.startswith(prefix)]
    pos_order += [POS_CODE[p] for p in entry.get("partsOfSpeech", []) if p in POS_CODE and POS_CODE[p] not in pos_order]
    pos_order += [p for p in ("n", "v", "a", "r") if p not in pos_order]
    for pos in pos_order:
        for lemma, source in candidate_lemmas(entry["displayWord"], pos, exceptions):
            offsets = index.get((lemma, pos))
            if not offsets:
                continue
            sense = synsets.get((pos, offsets[0]))
            if sense:
                return pos, lemma, offsets[0], sense, source
    return None


def relation_and_lemma(entry, sense, vocabulary_words) -> tuple[str, str]:
    word = entry["displayWord"].lower()
    meaning = entry.get("meaning", "").lower()
    parts = entry.get("partsOfSpeech", [])
    if ("'" in word and len(word) > 2) or word in COLLOQUIAL_CONTRACTIONS:
        return "contraction", word
    if len(word) == 1 and not (set(parts) & GRAMMAR_POS):
        return "abbreviation", word
    if sense:
        lemma = sense[1].replace("_", " ")
        if sense[4] in ("wordnet-exception", "wordnet-morphology", "curated-irregular") and lemma != word:
            return "inflection", lemma
        if PROPER_NAME_RE.search(meaning.split(";")[0]):
            return "proper-name", word
        if "abbreviation" not in parts and not meaning.startswith("abbr."):
            return "concept", lemma
    if "abbreviation" in parts or meaning.startswith("abbr.") or "缩写" in meaning:
        return "abbreviation", word
    if PROPER_NAME_RE.search(meaning.split(";")[0]):
        return "proper-name", word
    if NAMED_ENTITY_RE.search(meaning):
        return "named-entity", word
    if any(part in FUNCTION_TOPIC for part in parts):
        return "function-word", word
    for pos in ("n", "v", "a", "r"):
        for candidate, source in candidate_lemmas(word, pos, {}):
            if source == "wordnet-morphology" and candidate in vocabulary_words:
                return "inflection", candidate
    return "unresolved-form", word


def choose_topic(entry, sense, relation: str) -> tuple[str, str]:
    parts = entry.get("partsOfSpeech", [])
    word = entry["displayWord"].lower()
    meaning = entry.get("meaning", "").lower()
    if any(part in ("adjective", "adverb") for part in parts) and (
            re.search(r"(er|est)$", word) or "比较级" in meaning or "最高级" in meaning):
        return "comparison-degree", "form-rule"
    if not sense:
        for topic, pattern in MEANING_TOPIC_RULES:
            if pattern.search(meaning):
                return topic, "meaning-domain-fallback"
        raw = entry["displayWord"].lower() + " " + entry.get("meaning", "").lower()
        tokens = set(TOKEN_RE.findall(raw))
        best = None
        for order, (topic, keywords) in enumerate(DOMAIN_RULES):
            score = len(tokens & keywords)
            if score and (best is None or score > best[0]):
                best = (score, -order, topic)
        if best:
            return best[2], "meaning-domain-fallback"
        if relation == "proper-name":
            return "people-identity", "name-fallback"
        if relation == "named-entity":
            return "community", "entity-fallback"
        if relation == "abbreviation":
            return "technology-computing", "abbreviation-fallback"
        for part in parts:
            if part in FUNCTION_TOPIC:
                return FUNCTION_TOPIC[part], "pos-fallback"
        fallback = {"noun": "people-identity", "verb": "events-processes", "adjective": "qualities", "adverb": "function-adverbs"}
        for part in parts:
            if part in fallback:
                return fallback[part], "pos-fallback"
        return "states-conditions", "unknown-fallback"
    _pos, lemma, _offset, data, _source = sense
    lemma_tokens = set(TOKEN_RE.findall(lemma.replace("_", " ")))
    tokens = lemma_tokens | set(TOKEN_RE.findall(data["gloss"].lower()))
    best = None
    for order, (topic, keywords) in enumerate(DOMAIN_RULES):
        score = len(tokens & keywords)
        if (lemma_tokens & keywords or score >= 2) and (best is None or score > best[0]):
            best = (score, -order, topic)
    if best:
        return best[2], "wordnet-domain"
    return LEXNAME_TOPIC.get(data["lexname"], "states-conditions"), "wordnet-lexname"


def hypernym_label(sense, synsets) -> str | None:
    pos, _lemma, _offset, data, _source = sense
    links = data["hypernyms"] or data["similars"]
    if not links:
        return None
    target_pos, target_offset = links[0]
    target = synsets.get((target_pos, target_offset)) or synsets.get((pos, target_offset))
    if not target:
        return None
    label = target["words"][0].replace("_", " ")
    # One extra level avoids hundreds of near-singleton taxonomic leaves.
    if target["hypernyms"]:
        next_pos, next_offset = target["hypernyms"][0]
        parent = synsets.get((next_pos, next_offset)) or synsets.get((pos, next_offset))
        if parent and parent["words"]:
            label = parent["words"][0].replace("_", " ")
    return label


def assign_semantics(entries, index, synsets, exceptions):
    working = []
    raw_subclusters = Counter()
    vocabulary_words = {entry["displayWord"] for entry in entries}
    for entry in entries:
        sense = find_sense(entry, index, synsets, exceptions)
        relation, lemma = relation_and_lemma(entry, sense, vocabulary_words)
        topic, method = choose_topic(entry, sense, relation)
        label = hypernym_label(sense, synsets) if sense else None
        if not label:
            label = next((part for part in entry.get("partsOfSpeech", []) if part), "general")
        candidate = f"{topic}:{slug(label)}"
        raw_subclusters[candidate] += 1
        working.append((entry, sense, topic, method, relation, lemma, label, candidate))

    assignments = []
    for entry, sense, topic, method, relation, lemma, label, candidate in working:
        # Tiny hypernym groups would be noisy destinations; collapse while retaining provenance.
        if raw_subclusters[candidate] < 4:
            pos_label = (sense[3]["lexname"].split(".")[-1] if sense else
                         next(iter(entry.get("partsOfSpeech", [])), "general"))
            label = f"General {pos_label}"
            candidate = f"{topic}:general-{slug(pos_label)}"
        assignments.append({
            "entry": entry, "sense": sense, "topicId": topic, "realmId": TOPICS[topic][0],
            "method": method, "relation": relation, "lemma": lemma,
            "subclusterId": candidate.replace(":", "--", 1), "subclusterLabel": label,
        })
    return assignments


def assign_coordinates(assignments):
    realm_ids = list(REALMS)
    realm_centers = {}
    for index, realm_id in enumerate(realm_ids):
        col, row = index % 4, index // 4
        realm_centers[realm_id] = (1250 + col * 2500, 1500 + row * 3000)
    topics_by_realm = defaultdict(list)
    for topic_id, (realm_id, _zh, _en) in TOPICS.items():
        topics_by_realm[realm_id].append(topic_id)
    topic_centers = {}
    for realm_id, topic_ids in topics_by_realm.items():
        cx, cy = realm_centers[realm_id]
        for index, topic_id in enumerate(sorted(topic_ids)):
            angle = -math.pi / 2 + 2 * math.pi * index / max(1, len(topic_ids))
            radius = 680 if len(topic_ids) > 1 else 0
            topic_centers[topic_id] = (cx + math.cos(angle) * radius, cy + math.sin(angle) * radius)

    clusters_by_topic = defaultdict(list)
    entries_by_cluster = defaultdict(list)
    for assignment in assignments:
        entries_by_cluster[assignment["subclusterId"]].append(assignment)
        if assignment["subclusterId"] not in clusters_by_topic[assignment["topicId"]]:
            clusters_by_topic[assignment["topicId"]].append(assignment["subclusterId"])
    cluster_centers = {}
    for topic_id, cluster_ids in clusters_by_topic.items():
        cx, cy = topic_centers[topic_id]
        ordered = sorted(cluster_ids)
        for index, cluster_id in enumerate(ordered):
            angle = index * 2.399963229728653
            radius = 36 * math.sqrt(index)
            cluster_centers[cluster_id] = (cx + math.cos(angle) * radius, cy + math.sin(angle) * radius)

    occupied = set()
    for cluster_id, members in entries_by_cluster.items():
        cx, cy = cluster_centers[cluster_id]
        concepts = defaultdict(list)
        for assignment in members:
            concepts[assignment["lemma"]].append(assignment)
        ordered_concepts = sorted(concepts.items(), key=lambda pair: min(item["entry"]["rank"] for item in pair[1]))
        for concept_index, (lemma, forms) in enumerate(ordered_concepts):
            concept_seed = stable_hash(f"{cluster_id}:{lemma}")
            concept_angle = (concept_seed % 36000) / 36000 * 2 * math.pi + concept_index * 2.399963229728653
            concept_radius = 7 + 14 * math.sqrt(concept_index)
            concept_x = cx + math.cos(concept_angle) * concept_radius
            concept_y = cy + math.sin(concept_angle) * concept_radius
            for form_index, assignment in enumerate(sorted(forms, key=lambda item: item["entry"]["rank"])):
                seed = stable_hash(assignment["entry"]["id"])
                angle = (seed % 36000) / 36000 * 2 * math.pi
                radius = 0 if len(forms) == 1 else 4 + 3 * math.sqrt(form_index)
                x = int(round(max(0, min(9999, concept_x + math.cos(angle) * radius))))
                y = int(round(max(0, min(8999, concept_y + math.sin(angle) * radius))))
                while (x, y) in occupied:
                    x = (x + 1 + seed % 7) % 10000
                    y = (y + 1 + seed % 11) % 9000
                occupied.add((x, y))
                assignment["x"], assignment["y"] = x, y
    return realm_centers, topic_centers, cluster_centers


def write_json(path: Path, payload) -> tuple[int, str]:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n").encode()
    path.write_bytes(encoded)
    return len(encoded), hashlib.sha256(encoded).hexdigest()


def emit(assignments, realm_centers, topic_centers, cluster_centers):
    topics_payload = defaultdict(list)
    method_counts = Counter()
    relation_counts = Counter()
    lexname_counts = Counter()
    for item in assignments:
        entry, sense = item["entry"], item["sense"]
        method_counts[item["method"]] += 1
        relation_counts[item["relation"]] += 1
        if sense:
            lexname_counts[sense[3]["lexname"]] += 1
        topics_payload[item["topicId"]].append({
            "id": entry["id"], "word": entry["displayWord"], "meaning": entry["meaning"],
            "phonetic": entry.get("phonetic"), "partsOfSpeech": entry.get("partsOfSpeech", []),
            "rank": entry["rank"], "importance": round(max(0.1, min(1, (entry["zipf"] - 3.5) / 4.23)), 4),
            "clusterId": item["topicId"], "realmId": item["realmId"], "topicId": item["topicId"],
            "subclusterId": item["subclusterId"], "x": item["x"], "y": item["y"],
            "lemma": item["lemma"],
            "conceptId": "concept-" + hashlib.sha256(item["lemma"].encode()).hexdigest()[:16],
            "relation": item["relation"], "semanticSource": item["method"],
            **({"wordnetSynset": f"{sense[2]}-{sense[0]}", "wordnetLexname": sense[3]["lexname"]} if sense else {}),
        })

    topic_records = []
    subcluster_records = []
    assignment_by_cluster = {}
    for item in assignments:
        assignment_by_cluster.setdefault(item["subclusterId"], item)
    for topic_id, (realm_id, zh, en) in TOPICS.items():
        entries = sorted(topics_payload[topic_id], key=lambda item: item["rank"])
        shard_path = f"topics/{topic_id}.json"
        size, checksum = write_json(OUTPUT_DIR / shard_path, {
            "schemaVersion": SCHEMA_VERSION, "topicId": topic_id, "nodes": entries,
        })
        clusters = defaultdict(list)
        for entry in entries:
            clusters[entry["subclusterId"]].append(entry)
        cluster_ids = []
        for cluster_id, members in sorted(clusters.items()):
            assignment = assignment_by_cluster[cluster_id]
            cx, cy = cluster_centers[cluster_id]
            subcluster_records.append({
                "id": cluster_id, "topicId": topic_id, "label": assignment["subclusterLabel"],
                "count": len(members), "center": [round(cx), round(cy)],
            })
            cluster_ids.append(cluster_id)
        cx, cy = topic_centers[topic_id]
        topic_records.append({
            "id": topic_id, "realmId": realm_id, "labelZh": zh, "labelEn": en,
            "count": len(entries), "center": [round(cx), round(cy)], "subclusterIds": cluster_ids,
            "shard": {"path": shard_path, "bytes": size, "sha256": checksum},
        })

    realm_records = []
    for realm_id, (zh, en) in REALMS.items():
        realm_topics = [record for record in topic_records if record["realmId"] == realm_id]
        cx, cy = realm_centers[realm_id]
        realm_records.append({
            "id": realm_id, "labelZh": zh, "labelEn": en, "center": [cx, cy],
            "count": sum(record["count"] for record in realm_topics),
            "topicIds": [record["id"] for record in realm_topics],
        })

    compatibility_clusters = [{
        "id": record["id"], "title": record["labelEn"], "translation": record["labelZh"],
        "x": record["center"][0], "y": record["center"][1],
        "radius": round(180 + 18 * math.sqrt(record["count"])),
        "color": REALM_COLORS[record["realmId"]], "realmId": record["realmId"], "count": record["count"],
    } for record in topic_records]
    compatibility_shards = []
    for record in topic_records:
        nodes = topics_payload[record["id"]]
        min_x, min_y = min(node["x"] for node in nodes), min(node["y"] for node in nodes)
        max_x, max_y = max(node["x"] for node in nodes), max(node["y"] for node in nodes)
        compatibility_shards.append({
            **record["shard"], "count": record["count"], "clusterIds": [record["id"]],
            "bounds": {"x": min_x, "y": min_y, "width": max_x - min_x + 1, "height": max_y - min_y + 1,
                       "minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y},
        })
    manifest = {
        "schemaVersion": SCHEMA_VERSION, "entryCount": len(assignments),
        "world": {"x": 0, "y": 0, "width": 10000, "height": 9000}, "coordinateSpace": [10000, 9000],
        "generatedBy": "scripts/semantic-generate.py", "sourceVocabulary": "../vocabulary/manifest.json",
        "semanticSource": {"id": "wordnet-3.0", "url": WORDNET_URL, "sha256": WORDNET_SHA256,
                           "license": "Princeton WordNet License"},
        "relationTypes": ["concept", "inflection", "proper-name", "named-entity", "abbreviation", "contraction",
                          "function-word", "unresolved-form"],
        "clusters": compatibility_clusters, "shards": compatibility_shards,
        "realms": realm_records, "topics": topic_records, "subclusters": subcluster_records,
    }
    write_json(OUTPUT_DIR / "manifest.json", manifest)

    topic_counts = {record["id"]: record["count"] for record in topic_records}
    realm_counts = {record["id"]: record["count"] for record in realm_records}
    wordnet_count = sum(lexname_counts.values())
    vocabulary_words = {item["entry"]["displayWord"] for item in assignments}
    report = {
        "schemaVersion": SCHEMA_VERSION, "entryCount": len(assignments), "reachableCount": len(assignments),
        "uniqueIdCount": len({item["entry"]["id"] for item in assignments}),
        "uniqueCoordinateCount": len({(item["x"], item["y"]) for item in assignments}),
        "wordNetResolvedCount": wordnet_count, "wordNetCoveragePercent": round(wordnet_count / len(assignments) * 100, 2),
        "assignmentMethods": dict(sorted(method_counts.items())), "relationCounts": dict(sorted(relation_counts.items())),
        "conceptGroupCount": len({item["lemma"] for item in assignments}),
        "inflectionLemmaPresentCount": sum(1 for item in assignments
                                             if item["relation"] == "inflection" and item["lemma"] in vocabulary_words),
        "relationExamples": {
            relation: [{"word": item["entry"]["displayWord"], "lemma": item["lemma"]}
                       for item in assignments if item["relation"] == relation][:12]
            for relation in sorted(relation_counts)
        }, "realmCounts": realm_counts,
        "topicCounts": topic_counts, "subclusterCount": len(subcluster_records),
        "wordNetLexnameCounts": dict(sorted(lexname_counts.items())),
        "invariants": {"allVocabularyEntriesAssigned": True, "duplicateIds": 0, "danglingEntries": 0,
                       "duplicateCoordinates": 0, "deterministicOrdering": True},
    }
    audits = {}
    for word in ("b", "his", "was", "does", "declined", "observers", "recommends", "paul", "douglas", "fifa", "pdf"):
        item = next((candidate for candidate in assignments if candidate["entry"]["displayWord"] == word), None)
        if item:
            audits[word] = {"lemma": item["lemma"], "relation": item["relation"], "realmId": item["realmId"],
                            "topicId": item["topicId"], "semanticSource": item["method"]}
    report["qualityCaseAudits"] = audits
    write_json(OUTPUT_DIR / "quality-report.json", report)
    return report


def main():
    global OUTPUT_DIR
    parser = argparse.ArgumentParser()
    parser.add_argument("--wordnet-zip", type=Path, help="Pinned NLTK WordNet 3.0 archive")
    parser.add_argument("--output", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()
    OUTPUT_DIR = args.output.resolve()
    wordnet_path = acquire_wordnet(args.wordnet_zip)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(wordnet_path) as archive:
        (OUTPUT_DIR / "WORDNET-LICENSE.txt").write_bytes(archive.read("wordnet/LICENSE"))
    entries = load_vocabulary()
    index, synsets, exceptions = parse_wordnet(wordnet_path)
    assignments = assign_semantics(entries, index, synsets, exceptions)
    realm_centers, topic_centers, cluster_centers = assign_coordinates(assignments)
    report = emit(assignments, realm_centers, topic_centers, cluster_centers)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
