#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const semanticDirectory = path.join(root, "public/data/semantic");
const outputDirectory = path.join(root, "public/data/lexical-world");

const SEMANTIC_MANIFEST_URL = "/data/semantic/manifest.json";
const MANIFEST_URL = "/data/lexical-world/manifest.json";
const GENERATED_BY = "scripts/generate-lexical-world.mjs";
const PREVIEW_LIMITS = Object.freeze({ overview: 10, realm: 8, topic: 8, subcluster: 5 });

const FIXED_LABEL_TRANSLATIONS = Object.freeze({
  abbreviation: "缩写",
  abstraction: "抽象概念",
  activity: "活动",
  "actinic radiation": "光化辐射",
  "administrative district": "行政区",
  "administrative unit": "行政单位",
  adjective: "形容词",
  adverb: "副词",
  alarming: "令人警觉的",
  all: "综合",
  animal: "动物",
  aristocrat: "贵族",
  arthropod: "节肢动物",
  artifact: "人造物",
  attach: "连接",
  attribute: "属性",
  "auditory communication": "听觉交流",
  auxiliary: "助动词",
  "basic cognitive process": "基础认知过程",
  biologist: "生物学家",
  body: "身体",
  "body of water": "水体",
  "body part": "身体部位",
  "bodily process": "身体过程",
  bovine: "牛科动物",
  broach: "提出话题",
  businessperson: "商人",
  "calendar month": "公历月份",
  carnivore: "食肉动物",
  "causal agent": "致因主体",
  "change of location": "位置变化",
  "change of state": "状态变化",
  "chemical element": "化学元素",
  "clock time": "时刻",
  close: "接近的",
  cognition: "认知",
  "cognitive state": "认知状态",
  "commercial enterprise": "商业企业",
  "commissioned officer": "军官",
  communication: "交流",
  communicator: "交流者",
  "constituent": "组成部分",
  contestant: "参赛者",
  conveyance: "交通工具",
  "day of the week": "星期",
  deity: "神祇",
  determiner: "限定词",
  diversion: "消遣活动",
  "due process": "正当程序",
  educator: "教育工作者",
  "electromagnetic unit": "电磁单位",
  emotion: "情绪",
  entertainer: "演艺人员",
  event: "事件",
  "european country": "欧洲国家",
  extremity: "肢体末端",
  "expressive style": "表达风格",
  "financial gain": "经济收益",
  food: "食物",
  foodstuff: "食品",
  forebear: "祖先",
  "fundamental quantity": "基本量",
  garment: "服装",
  general: "综合",
  genitor: "生身父母",
  "geographic point": "地理点",
  "geographical area": "地理区域",
  "geological formation": "地质构造",
  get: "获得",
  give: "给予",
  "good person": "善良的人",
  "group action": "群体行动",
  "head of state": "国家元首",
  "health professional": "医疗专业人员",
  "heavier-than-air craft": "重于空气的飞行器",
  "higher cognitive process": "高级认知过程",
  humorous: "幽默的",
  "ill health": "健康不佳",
  impart: "传达",
  "indefinite quantity": "不定量",
  inhumane: "不人道的",
  instrumentality: "器械",
  integer: "整数",
  interjection: "感叹词",
  "knowledge domain": "知识领域",
  "language unit": "语言单位",
  lawman: "执法人员",
  liabilities: "负债",
  "linear unit": "长度单位",
  "living thing": "生物",
  location: "地点",
  macromolecule: "大分子",
  "magnitude relation": "量值关系",
  "mass unit": "质量单位",
  "mechanical device": "机械装置",
  "medical practitioner": "医务人员",
  "metallic element": "金属元素",
  "military unit": "军事单位",
  "monetary unit": "货币单位",
  "money handler": "财务经办人",
  municipality: "市镇",
  "musical instrument": "乐器",
  "natural object": "自然物体",
  "natural phenomenon": "自然现象",
  "natural process": "自然过程",
  "natural science": "自然科学",
  noun: "名词",
  nutriment: "营养物",
  object: "物体",
  "organic process": "有机过程",
  outgo: "支出",
  pathological: "病理性的",
  "pathological state": "病理状态",
  patterned: "带图案的",
  person: "人物",
  phenomenon: "现象",
  "physical condition": "身体状况",
  "physical entity": "物理实体",
  "physical phenomenon": "物理现象",
  "physical property": "物理性质",
  plant: "植物",
  "plant material": "植物材料",
  "plant organ": "植物器官",
  placental: "有胎盘哺乳动物",
  pleasing: "令人愉悦的",
  "place of business": "营业场所",
  preposition: "介词",
  preserver: "保护者",
  "print media": "印刷媒体",
  process: "过程",
  "problem solving": "问题解决",
  pronoun: "代词",
  propulsion: "推进",
  "psychological feature": "心理特征",
  "psychological state": "心理状态",
  quality: "性质",
  "re-create": "重新创造",
  relation: "关系",
  "religious person": "宗教人士",
  restraint: "约束装置",
  "self-propelled vehicle": "自行交通工具",
  shape: "形状",
  show: "展示",
  "skilled worker": "技术工人",
  "social control": "社会控制",
  "social event": "社交活动",
  "social group": "社会群体",
  "sound property": "声音属性",
  "speech act": "言语行为",
  "spiritual being": "精神存在",
  "spiritual leader": "精神领袖",
  sport: "体育活动",
  "sports equipment": "体育器材",
  state: "状态",
  stimulation: "刺激",
  substance: "物质",
  "supporting structure": "支撑结构",
  "synovial joint": "滑膜关节",
  "tableware": "餐具",
  "talk of": "谈论",
  tell: "讲述",
  termination: "终止",
  time: "时间",
  "time period": "时间段",
  tops: "顶层概念",
  tract: "区域",
  transgression: "违规行为",
  "transferred property": "转移的财产",
  "unit of measurement": "计量单位",
  "unmake": "拆解",
  "unwelcome person": "不受欢迎的人",
  "urban area": "城市区域",
  utterance: "话语",
  "vascular plant": "维管植物",
  verb: "动词",
  "visual communication": "视觉交流",
  weather: "天气",
  weaponry: "武器装备",
  work: "工作",
  "written communication": "书面交流",
  wrongdoer: "违法者",
});

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const canonicalJson = (value) => `${JSON.stringify(value)}\n`;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const compareNodes = (left, right) => left.rank - right.rank || left.id.localeCompare(right.id);
const titleCase = (label) => label.replace(/(^|[\s-])([a-z])/g, (_, separator, letter) => `${separator}${letter.toUpperCase()}`);

const GRAMMAR_REALM_ID = "grammar-relations";
const GENERIC_PREVIEW_ANCHOR_TERMS = new Set([
  "adjective", "adverb", "all", "and", "function", "general", "noun", "the", "thing", "tops", "verb",
]);
const REALM_PREVIEW_PROFILES = Object.freeze({
  "nature-life": { preferred: ["noun"], discouraged: ["adjective", "adverb"] },
  "body-daily-life": { preferred: ["noun"], discouraged: ["adjective", "adverb"] },
  "objects-technology": { preferred: ["noun"], discouraged: ["adjective", "adverb"] },
  "people-society": { preferred: ["noun"], discouraged: ["adjective", "adverb"] },
  "mind-values": { preferred: ["noun", "verb"], discouraged: ["adjective", "adverb"] },
  "language-culture": { preferred: ["noun", "verb"], discouraged: ["adjective", "adverb"] },
  "actions-events": { preferred: ["verb"], discouraged: ["adjective", "adverb"] },
  "space-time-measure": { preferred: ["noun", "numeral"], discouraged: ["adjective", "adverb"] },
  "qualities-states": { preferred: ["adjective"], discouraged: [] },
  "grammar-relations": { preferred: [], discouraged: [] },
});
const TOPIC_PREVIEW_MEANING_SIGNALS = Object.freeze({
  animals: /动物|鸟|鱼|昆虫|蜘蛛|蝴蝶|蜜蜂|狗|猫|马|牛|羊|猪|熊|狼|狐|兔|鹿|鹰|蛇|蛙|鼠/u,
  plants: /植物|树|木|草|花|叶|根|种子|果实|灌木|谷物|小麦|玉米|松|橡/u,
  "earth-weather": /地球|地质|山|天气|气候|雨|雪|风|云|阳光|辐射|热|洪水|风暴/u,
  "water-space": /水|海|河|湖|溪|海岸|海滩|太阳|恒星|行星|宇宙|太空/u,
  "home-buildings": /房|屋|建筑|公寓|房间|门|窗|墙|床|厨房|浴室|厕所|家具|屋顶/u,
  transport: /交通|运输|车辆|汽车|轿车|公共汽车|火车|铁路|道路|飞机|船|自行车|乘客|司机/u,
  "technology-computing": /计算|电脑|网络|软件|硬件|程序|算法|电子|数据|网站|互联网|数字/u,
  "arts-entertainment": /艺术|娱乐|音乐|电影|电视|演员|歌手|舞蹈|绘画|表演|剧院|影院/u,
});

function preview(nodes, limit) {
  return [...nodes]
    .sort(compareNodes)
    .slice(0, limit)
    .map(({ id, word }) => ({ id, word }));
}

function previewAnchorTerms(...labels) {
  const result = new Set();
  for (const label of labels) {
    for (const term of label.toLowerCase().match(/[a-z]+/gu) ?? []) {
      if (GENERIC_PREVIEW_ANCHOR_TERMS.has(term)) continue;
      result.add(term);
      if (term.length > 3 && term.endsWith("s")) result.add(term.slice(0, -1));
    }
  }
  return result;
}

export function isRepresentativePreviewNode(node, { allowFunctionWords = false } = {}) {
  const acceptedRelation = node?.relation === "concept"
    || (allowFunctionWords && node?.relation === "function-word");
  if (!acceptedRelation) return false;
  if (typeof node.word !== "string" || typeof node.lemma !== "string") return false;
  if (node.word.trim().toLowerCase() !== node.lemma.trim().toLowerCase()) return false;
  if (!Array.isArray(node.partsOfSpeech) || node.partsOfSpeech.length === 0) return false;
  if (node.word.trim().length < 2 && !allowFunctionWords) return false;
  return true;
}

function previewQualityScore(node, options) {
  if (!isRepresentativePreviewNode(node, options)) return Number.POSITIVE_INFINITY;
  let score = Math.log10(node.rank + 10);
  if (options.preferredPartsOfSpeech?.length
    && !node.partsOfSpeech.some((part) => options.preferredPartsOfSpeech.includes(part))) score += 1.8;
  score += node.partsOfSpeech.filter((part) => options.discouragedPartsOfSpeech?.includes(part)).length * 0.65;
  score += Math.max(0, node.partsOfSpeech.length - 1) * 0.18;
  if (node.semanticSource?.endsWith("fallback")) score += 0.55;
  if (options.anchorTerms?.has(node.word.trim().toLowerCase())
    || options.anchorTerms?.has(node.lemma.trim().toLowerCase())) score -= 1.7;
  if (options.meaningSignal) score += options.meaningSignal.test(node.meaning) ? -1.2 : 0.65;
  if (node.word.trim().length < 2) score += 1;
  return score;
}

function representativePreview(groups, limit, defaultOptions = {}) {
  const candidates = [];
  groups.forEach((rawGroup, groupIndex) => {
    const descriptor = Array.isArray(rawGroup) ? { nodes: rawGroup } : rawGroup;
    const options = {
      ...defaultOptions,
      ...descriptor,
      allowFunctionWords: descriptor.allowFunctionWords ?? defaultOptions.allowFunctionWords ?? false,
    };
    const nodes = [...descriptor.nodes]
      .filter((node) => isRepresentativePreviewNode(node, options))
      .sort((left, right) => previewQualityScore(left, options) - previewQualityScore(right, options) || compareNodes(left, right));
    nodes.forEach((node, round) => {
      candidates.push({
        node,
        score: previewQualityScore(node, options) + round * 0.55 + (descriptor.priority ?? 0) * 0.35,
        groupIndex,
      });
    });
  });

  return candidates
    .sort((left, right) => left.score - right.score
      || compareNodes(left.node, right.node)
      || left.groupIndex - right.groupIndex)
    .slice(0, limit)
    .map(({ node: { id, word } }) => ({ id, word }));
}

function previewFromRankedGroups(groups, limit) {
  const result = [];
  for (let offset = 0; result.length < limit; offset += 1) {
    let found = false;
    for (const group of groups) {
      if (!group[offset]) continue;
      found = true;
      result.push({ id: group[offset].id, word: group[offset].word });
      if (result.length === limit) break;
    }
    if (!found) break;
  }
  return result;
}

function extractChineseLabel(meaning) {
  if (typeof meaning !== "string") return undefined;
  const firstLine = meaning.split("\n").find((line) => /[\u3400-\u9fff]/u.test(line));
  if (!firstLine) return undefined;
  const cleaned = firstLine
    .replace(/^(?:\[[^\]]+\]\s*)+/u, "")
    .replace(/^(?:[a-z]+\.\s*)+/iu, "")
    .trim();
  const candidate = cleaned.split(/[,，;；(（]/u)[0]?.trim();
  return candidate && /[\u3400-\u9fff]/u.test(candidate) && candidate.length <= 20 ? candidate : undefined;
}

function subclusterLabels(subcluster, topic, nodesByTerm) {
  const rawLabel = subcluster.label.trim();
  const general = rawLabel.toLowerCase().startsWith("general ");
  const baseLabel = general ? rawLabel.slice("general ".length) : rawLabel;
  const normalized = baseLabel.toLowerCase();
  const fixed = FIXED_LABEL_TRANSLATIONS[normalized];
  const matchingNode = nodesByTerm.get(normalized);
  const translated = fixed ?? extractChineseLabel(matchingNode?.meaning);
  const fallback = `${topic.labelZh} · ${titleCase(baseLabel)}`;
  return {
    labelEn: titleCase(rawLabel),
    labelZh: general
      ? translated ? `通用 · ${translated}` : `通用 · ${topic.labelZh}`
      : translated ?? fallback,
  };
}

function topicColor(topic, clusterById) {
  return clusterById.get(topic.id)?.color ?? "#64748b";
}

function loadSemanticSource() {
  const manifestBytes = fs.readFileSync(path.join(semanticDirectory, "manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  const nodesByTopic = new Map();
  const nodeById = new Map();
  const nodesByTerm = new Map();

  for (const shard of manifest.shards) {
    const payload = readJson(path.join(semanticDirectory, shard.path));
    const nodes = [...payload.nodes].sort(compareNodes);
    nodesByTopic.set(payload.topicId, nodes);
    for (const node of nodes) {
      nodeById.set(node.id, node);
      for (const value of [node.word, node.lemma]) {
        const term = value?.trim().toLowerCase();
        if (term && !nodesByTerm.has(term)) nodesByTerm.set(term, node);
      }
    }
  }

  return { manifest, manifestSha256: sha256(manifestBytes), nodesByTopic, nodeById, nodesByTerm };
}

export function createLexicalWorldFiles() {
  const { manifest: semantic, manifestSha256, nodesByTopic, nodeById, nodesByTerm } = loadSemanticSource();
  const files = new Map();
  const topicById = new Map(semantic.topics.map((topic) => [topic.id, topic]));
  const subclusterById = new Map(semantic.subclusters.map((subcluster) => [subcluster.id, subcluster]));
  const shardByTopic = new Map(semantic.shards.map((shard) => [shard.clusterIds[0], shard]));
  const clusterById = new Map(semantic.clusters.map((cluster) => [cluster.id, cluster]));
  const source = {
    semanticManifest: SEMANTIC_MANIFEST_URL,
    semanticManifestSha256: manifestSha256,
    semanticSchemaVersion: semantic.schemaVersion,
  };

  const realmLinks = [];
  const topicPreviewNodesById = new Map();
  const realmPreviewNodesById = new Map();
  for (const realm of semantic.realms) {
    const topics = realm.topicIds.map((id) => topicById.get(id));
    const realmColor = topicColor(topics[0], clusterById);
    const topicLinks = [];

    for (const topic of topics) {
      const nodes = nodesByTopic.get(topic.id);
      const shard = shardByTopic.get(topic.id);
      const shardUrl = `/data/semantic/${shard.path}`;
      const subclusterGroups = topic.subclusterIds.map((id) => {
        const group = nodes.filter((node) => node.subclusterId === id);
        return { definition: subclusterById.get(id), nodes: group };
      });
      const topicUrl = `/data/lexical-world/topics/${topic.id}.json`;
      const semanticShard = {
        path: shardUrl,
        count: shard.count,
        bytes: shard.bytes,
        sha256: shard.sha256,
      };
      const subclusterLinks = subclusterGroups.map(({ definition, nodes: childNodes }) => {
        const labels = subclusterLabels(definition, topic, nodesByTerm);
        return {
          id: definition.id,
          kind: "subcluster",
          ...labels,
          count: childNodes.length,
          childrenCount: childNodes.length,
          children: childNodes.map((node) => node.id),
          previewWords: preview(childNodes, PREVIEW_LIMITS.subcluster),
          empty: childNodes.length === 0,
          nodeSource: {
            path: shardUrl,
            collection: "nodes",
            idField: "id",
            match: { field: "subclusterId", value: definition.id },
          },
        };
      });
      const allowFunctionWords = realm.id === GRAMMAR_REALM_ID;
      const profile = REALM_PREVIEW_PROFILES[realm.id];
      const topicPreview = representativePreview(
        subclusterGroups.map(({ definition, nodes: group }) => ({
          nodes: group,
          priority: definition.label.trim().toLowerCase().startsWith("general ") ? 1 : 0,
          allowFunctionWords,
          preferredPartsOfSpeech: profile.preferred,
          discouragedPartsOfSpeech: profile.discouraged,
          anchorTerms: previewAnchorTerms(topic.labelEn, definition.label),
          meaningSignal: TOPIC_PREVIEW_MEANING_SIGNALS[topic.id],
        })),
        PREVIEW_LIMITS.topic,
      );
      topicPreviewNodesById.set(topic.id, topicPreview.map(({ id }) => nodeById.get(id)));
      const topicLink = {
        id: topic.id,
        kind: "topic",
        labelEn: topic.labelEn,
        labelZh: topic.labelZh,
        color: topicColor(topic, clusterById),
        count: topic.count,
        childrenCount: topic.subclusterIds.length,
        path: topicUrl,
        previewWords: topicPreview,
        semanticShard,
      };
      topicLinks.push(topicLink);

      files.set(`topics/${topic.id}.json`, canonicalJson({
        schemaVersion: 1,
        id: topic.id,
        kind: "topic",
        labelEn: topic.labelEn,
        labelZh: topic.labelZh,
        color: topicLink.color,
        count: topic.count,
        childrenCount: subclusterLinks.length,
        children: subclusterLinks,
        previewWords: topicPreview,
        parentId: realm.id,
        parentPath: `/data/lexical-world/realms/${realm.id}.json`,
        semanticShard,
        source,
      }));
    }

    const realmPreview = previewFromRankedGroups(
      topics.map((topic) => topicPreviewNodesById.get(topic.id)),
      PREVIEW_LIMITS.realm,
    );
    realmPreviewNodesById.set(realm.id, realmPreview.map(({ id }) => nodeById.get(id)));
    const realmUrl = `/data/lexical-world/realms/${realm.id}.json`;
    realmLinks.push({
      id: realm.id,
      kind: "realm",
      labelEn: realm.labelEn,
      labelZh: realm.labelZh,
      color: realmColor,
      count: realm.count,
      childrenCount: topicLinks.length,
      path: realmUrl,
      previewWords: realmPreview,
    });
    files.set(`realms/${realm.id}.json`, canonicalJson({
      schemaVersion: 1,
      id: realm.id,
      kind: "realm",
      labelEn: realm.labelEn,
      labelZh: realm.labelZh,
      color: realmColor,
      count: realm.count,
      childrenCount: topicLinks.length,
      children: topicLinks,
      previewWords: realmPreview,
      parentId: "lexical-world",
      parentPath: MANIFEST_URL,
      source,
    }));
  }

  const overview = {
    schemaVersion: 1,
    generatedBy: GENERATED_BY,
    id: "lexical-world",
    kind: "overview",
    labelEn: "Lexical world",
    labelZh: "词汇世界",
    count: semantic.entryCount,
    entryCount: semantic.entryCount,
    childrenCount: realmLinks.length,
    children: realmLinks,
    previewWords: previewFromRankedGroups(
      semantic.realms.map((realm) => realmPreviewNodesById.get(realm.id)),
      PREVIEW_LIMITS.overview,
    ),
    stats: {
      realms: semantic.realms.length,
      topics: semantic.topics.length,
      subclusters: semantic.subclusters.length,
      nodes: semantic.entryCount,
      emptySubclusters: semantic.subclusters.filter((subcluster) => subcluster.count === 0).length,
    },
    source,
  };
  files.set("manifest.json", canonicalJson(overview));
  return files;
}

function existingOutputFiles() {
  if (!fs.existsSync(outputDirectory)) return [];
  return fs.readdirSync(outputDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.relative(outputDirectory, path.join(entry.parentPath, entry.name)))
    .sort();
}

export function writeLexicalWorldFiles(files) {
  const expected = new Set(files.keys());
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const relativePath of existingOutputFiles()) {
    if (!expected.has(relativePath)) fs.unlinkSync(path.join(outputDirectory, relativePath));
  }
  for (const [relativePath, content] of files) {
    const destination = path.join(outputDirectory, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
}

export function checkLexicalWorldFiles(files) {
  const errors = [];
  const expected = [...files.keys()].sort();
  const actual = existingOutputFiles();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`file set differs (expected ${expected.length}, found ${actual.length})`);
  }
  for (const [relativePath, expectedContent] of files) {
    const destination = path.join(outputDirectory, relativePath);
    if (!fs.existsSync(destination)) {
      errors.push(`missing ${relativePath}`);
    } else if (fs.readFileSync(destination, "utf8") !== expectedContent) {
      errors.push(`out of date ${relativePath}`);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = createLexicalWorldFiles();
  if (process.argv.includes("--check")) {
    const errors = checkLexicalWorldFiles(files);
    if (errors.length > 0) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else {
      console.log(`Lexical world is reproducible: ${files.size} files`);
    }
  } else {
    writeLexicalWorldFiles(files);
    console.log(`Generated ${files.size} lexical-world files`);
  }
}
