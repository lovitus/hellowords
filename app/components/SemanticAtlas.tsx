"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSemanticRepository,
  type SemanticBounds,
  type SemanticCluster,
  type SemanticManifest,
  type SemanticNode,
  type SemanticRepository,
} from "../lib/semantic-repository";
import "./semantic-atlas.css";

export interface SemanticAtlasProps {
  open: boolean;
  onClose: () => void;
  /** Controlled translation state, shared with the world viewer. */
  showMeanings: boolean;
  onShowMeaningsChange?: (visible: boolean) => void;
  /** Optional authored semantic manifest; vocabulary data is the automatic fallback. */
  manifestUrl?: string;
  initialQuery?: string;
  onSelectWord?: (node: SemanticNode) => void;
}

interface Camera { x: number; y: number; scale: number }
interface Size { width: number; height: number }
interface HitRegion { node: SemanticNode; x: number; y: number; width: number; height: number }
interface RealmOverview {
  id: string;
  title: string;
  translation: string;
  color: string;
  x: number;
  y: number;
  count: number;
  topicCount: number;
}

const MIN_SCALE = 0.045;
const MAX_SCALE = 3.2;
const BACKGROUND = "#f3ede2";
const OVERVIEW_SCALE = 0.105;

const REALM_COPY: Readonly<Record<string, readonly [string, string]>> = {
  "nature-life": ["NATURE & LIFE", "自然与生命"],
  "body-daily-life": ["BODY & DAILY LIFE", "身体与日常"],
  "objects-technology": ["OBJECTS & TECH", "物件与技术"],
  "people-society": ["PEOPLE & SOCIETY", "人与社会"],
  "mind-values": ["MIND & VALUES", "心智与价值"],
  "language-culture": ["LANGUAGE & CULTURE", "语言与文化"],
  "actions-events": ["ACTIONS & EVENTS", "行为与事件"],
  "space-time-measure": ["SPACE · TIME · MEASURE", "空间、时间与度量"],
  "qualities-states": ["QUALITIES & STATES", "性质与状态"],
  "grammar-relations": ["GRAMMAR & RELATIONS", "语法与关系"],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function viewportBounds(camera: Camera, size: Size): SemanticBounds {
  return {
    x: -camera.x / camera.scale,
    y: -camera.y / camera.scale,
    width: size.width / camera.scale,
    height: size.height / camera.scale,
  };
}

function fitCamera(manifest: Pick<SemanticManifest, "world" | "clusters">, size: Size): Camera {
  const realms = buildRealmOverview(manifest.clusters);
  const overview = realms.length > 1
    ? {
        x: Math.min(...realms.map((realm) => realm.x)),
        y: Math.min(...realms.map((realm) => realm.y)),
        width: Math.max(...realms.map((realm) => realm.x)) - Math.min(...realms.map((realm) => realm.x)),
        height: Math.max(...realms.map((realm) => realm.y)) - Math.min(...realms.map((realm) => realm.y)),
      }
    : manifest.world;
  const availableWidth = Math.max(1, size.width - 140);
  const availableHeight = Math.max(1, size.height - 120);
  const scale = clamp(Math.min(availableWidth / overview.width, availableHeight / overview.height) * 0.98, MIN_SCALE, 0.22);
  return {
    x: (size.width - overview.width * scale) / 2 - overview.x * scale,
    y: (size.height - overview.height * scale) / 2 - overview.y * scale,
    scale,
  };
}

function cameraAt(node: SemanticNode, size: Size, scale = 1.35): Camera {
  return { x: size.width / 2 - node.x * scale, y: size.height / 2 - node.y * scale, scale };
}

function constrainCamera(camera: Camera, world: SemanticBounds, size: Size): Camera {
  const margin = 56;
  const contentWidth = world.width * camera.scale;
  const contentHeight = world.height * camera.scale;
  const x = contentWidth <= size.width
    ? (size.width - contentWidth) / 2 - world.x * camera.scale
    : clamp(camera.x, size.width - (world.x + world.width) * camera.scale - margin, margin - world.x * camera.scale);
  const y = contentHeight <= size.height
    ? (size.height - contentHeight) / 2 - world.y * camera.scale
    : clamp(camera.y, size.height - (world.y + world.height) * camera.scale - margin, margin - world.y * camera.scale);
  return { ...camera, x, y };
}

function visibleLimit(scale: number): number {
  if (scale < 0.18) return 90;
  if (scale < 0.38) return 150;
  if (scale < 0.8) return 260;
  if (scale < 1.5) return 420;
  return 650;
}

function buildRealmOverview(clusters: readonly SemanticCluster[]): RealmOverview[] {
  const groups = new Map<string, SemanticCluster[]>();
  for (const cluster of clusters) {
    const realmId = cluster.realmId ?? cluster.id;
    const group = groups.get(realmId) ?? [];
    group.push(cluster);
    groups.set(realmId, group);
  }
  return [...groups.entries()].map(([id, group]) => {
    const count = group.reduce((sum, cluster) => sum + (cluster.count ?? 0), 0) || group.length;
    const weightedX = group.reduce((sum, cluster) => sum + cluster.x * (cluster.count ?? 1), 0) / count;
    const weightedY = group.reduce((sum, cluster) => sum + cluster.y * (cluster.count ?? 1), 0) / count;
    const copy = REALM_COPY[id] ?? [group[0].title, group[0].translation];
    return {
      id,
      title: copy[0],
      translation: copy[1],
      color: group[0].color,
      x: weightedX,
      y: weightedY,
      count,
      topicCount: group.length,
    };
  });
}

function pickLabels(nodes: readonly SemanticNode[], camera: Camera, size: Size, selectedId?: string): SemanticNode[] {
  const limit = visibleLimit(camera.scale);
  const collisionCell = 18;
  const occupied = new Set<string>();
  return [...nodes]
    .sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId) || b.importance - a.importance || a.rank - b.rank)
    .filter((node) => {
      if (occupied.size >= limit) return false;
      const screenX = node.x * camera.scale + camera.x;
      const screenY = node.y * camera.scale + camera.y;
      if (screenX < -100 || screenX > size.width + 100 || screenY < -30 || screenY > size.height + 30) return false;
      const fontSize = clamp(10.5 + camera.scale * 3.2 + node.importance * 2.2, 11, 18);
      const halfWidth = Math.max(24, node.word.length * fontSize * 0.31 + 11);
      const halfHeight = camera.scale >= 0.58 ? fontSize * 1.25 : fontSize * 0.72 + 7;
      const minColumn = Math.floor((screenX - halfWidth) / collisionCell);
      const maxColumn = Math.floor((screenX + halfWidth) / collisionCell);
      const minRow = Math.floor((screenY - halfHeight) / collisionCell);
      const maxRow = Math.floor((screenY + halfHeight) / collisionCell);
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          if (occupied.has(`${column}:${row}`)) return false;
        }
      }
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) occupied.add(`${column}:${row}`);
      }
      return true;
    });
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export function SemanticAtlas({
  open,
  onClose,
  showMeanings,
  onShowMeaningsChange,
  manifestUrl,
  initialQuery = "",
  onSelectWord,
}: SemanticAtlasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const repositoryRef = useRef<SemanticRepository | null>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: MIN_SCALE });
  const sizeRef = useRef<Size>({ width: 1, height: 1 });
  const frameRef = useRef<number | null>(null);
  const hitsRef = useRef<HitRegion[]>([]);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{ distance: number; centerX: number; centerY: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const displayRef = useRef<{ selected: SemanticNode | null; showMeanings: boolean }>({ selected: null, showMeanings });
  const [manifestReady, setManifestReady] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SemanticNode[]>([]);
  const [selected, setSelected] = useState<SemanticNode | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [announcement, setAnnouncement] = useState("");

  const repository = useMemo(() => createSemanticRepository(manifestUrl), [manifestUrl]);

  useEffect(() => {
    repositoryRef.current = repository;
  }, [repository]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  const renderCanvas = useCallback(() => {
    frameRef.current = null;
    const canvas = canvasRef.current;
    const currentRepository = repositoryRef.current;
    if (!canvas || !currentRepository?.manifest) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const size = sizeRef.current;
    const camera = cameraRef.current;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    if (canvas.width !== Math.round(size.width * dpr) || canvas.height !== Math.round(size.height * dpr)) {
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, size.width, size.height);

    const gradient = context.createRadialGradient(size.width * 0.5, size.height * 0.4, 20, size.width * 0.5, size.height * 0.5, Math.max(size.width, size.height));
    gradient.addColorStop(0, "rgba(255,255,255,.68)");
    gradient.addColorStop(1, "rgba(218,204,180,.2)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size.width, size.height);

    const bounds = viewportBounds(camera, size);
    context.save();
    context.translate(camera.x, camera.y);
    context.scale(camera.scale, camera.scale);
    for (const cluster of currentRepository.manifest.clusters) {
      if (cluster.x + cluster.radius < bounds.x || cluster.x - cluster.radius > bounds.x + bounds.width || cluster.y + cluster.radius < bounds.y || cluster.y - cluster.radius > bounds.y + bounds.height) continue;
      const glow = context.createRadialGradient(cluster.x, cluster.y, cluster.radius * 0.08, cluster.x, cluster.y, cluster.radius);
      glow.addColorStop(0, `${cluster.color}28`);
      glow.addColorStop(0.7, `${cluster.color}12`);
      glow.addColorStop(1, `${cluster.color}00`);
      context.fillStyle = glow;
      context.beginPath();
      context.ellipse(cluster.x, cluster.y, cluster.radius, cluster.radius * 0.73, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = `${cluster.color}2a`;
      context.lineWidth = 1 / camera.scale;
      context.setLineDash([8 / camera.scale, 13 / camera.scale]);
      context.stroke();
    }
    context.restore();

    const candidates = currentRepository.index.query({
      x: bounds.x - 120 / camera.scale,
      y: bounds.y - 50 / camera.scale,
      width: bounds.width + 240 / camera.scale,
      height: bounds.height + 100 / camera.scale,
    });
    const display = displayRef.current;
    const labels = camera.scale < OVERVIEW_SCALE ? [] : pickLabels(candidates, camera, size, display.selected?.id);
    const clusters = new Map(currentRepository.manifest.clusters.map((cluster) => [cluster.id, cluster]));
    hitsRef.current = [];

    if (camera.scale < OVERVIEW_SCALE) {
      for (const realm of buildRealmOverview(currentRepository.manifest.clusters)) drawRealmOverview(context, realm, camera);
    } else if (camera.scale < 1.15) {
      for (const cluster of currentRepository.manifest.clusters) drawClusterTitle(context, cluster, camera, display.showMeanings);
    }
    for (const node of labels) {
      const cluster = clusters.get(node.clusterId);
      const screenX = node.x * camera.scale + camera.x;
      const screenY = node.y * camera.scale + camera.y;
      const isSelected = display.selected?.id === node.id;
      const fontSize = clamp(10.5 + camera.scale * 3.2 + node.importance * 2.2, 11, 18);
      context.font = `${node.rank < 1200 || isSelected ? 650 : 520} ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      const wordWidth = context.measureText(node.word).width;
      let meaningWidth = 0;
      const meaning = display.showMeanings && camera.scale >= 0.58 ? node.meaning.split("\n")[0].slice(0, 24) : "";
      if (meaning) {
        context.font = `400 ${Math.max(10, fontSize - 3)}px ui-sans-serif, system-ui, sans-serif`;
        meaningWidth = context.measureText(meaning).width;
      }
      const width = Math.max(wordWidth, meaningWidth) + 18;
      const height = meaning ? fontSize * 2.4 : fontSize + 13;
      const x = screenX - width / 2;
      const y = screenY - height / 2;
      context.shadowColor = "rgba(36,46,39,.12)";
      context.shadowBlur = isSelected ? 14 : 7;
      context.shadowOffsetY = 2;
      roundedRect(context, x, y, width, height, 8);
      context.fillStyle = isSelected ? "#173f35" : "rgba(255,253,247,.92)";
      context.fill();
      context.shadowColor = "transparent";
      context.strokeStyle = isSelected ? "#173f35" : `${cluster?.color ?? "#6c756d"}72`;
      context.lineWidth = isSelected ? 1.5 : 0.8;
      context.stroke();
      context.font = `${node.rank < 1200 || isSelected ? 650 : 520} ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = isSelected ? "#fffdf8" : "#253c34";
      context.fillText(node.word, screenX, meaning ? screenY - fontSize * 0.42 : screenY + 0.5);
      if (meaning) {
        context.font = `400 ${Math.max(10, fontSize - 3)}px ui-sans-serif, system-ui, sans-serif`;
        context.fillStyle = isSelected ? "rgba(255,255,255,.76)" : "#6f776f";
        context.fillText(meaning, screenX, screenY + fontSize * 0.72);
      }
      hitsRef.current.push({ node, x, y, width, height });
    }
  }, []);

  const scheduleRender = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(renderCanvas);
  }, [renderCanvas]);

  useEffect(() => {
    displayRef.current.showMeanings = showMeanings;
    if (open) scheduleRender();
  }, [open, scheduleRender, showMeanings]);

  const requestVisibleData = useCallback(() => {
    const currentRepository = repositoryRef.current;
    if (!currentRepository?.manifest) return;
    const bounds = viewportBounds(cameraRef.current, sizeRef.current);
    void currentRepository.loadViewport(bounds).then(() => {
      setLoadedCount(currentRepository.loadedNodes.length);
      scheduleRender();
    }).catch(() => undefined);
  }, [scheduleRender]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    queueMicrotask(() => setStatus("loading"));
    void repository.loadManifest(controller.signal)
      .then(async (manifest) => {
        setTotalCount(manifest.entryCount);
        setManifestReady(true);
        cameraRef.current = fitCamera(manifest, sizeRef.current);
        // The overview needs cluster geography plus only one representative
        // shard. Remaining regions hydrate during idle time or as the camera
        // moves, so opening the universe never blocks on all 10,000 entries.
        await repository.loadShard(manifest.shards[0], controller.signal);
        setLoadedCount(repository.loadedNodes.length);
        setStatus("ready");
        setAnnouncement(`词汇宇宙已打开，已载入 ${repository.loadedNodes.length} 个词`);
        scheduleRender();
        // Legacy rank shards have no spatial bounds, so background hydration is
        // their only browse path. Authored semantic shards stay truly on-demand.
        if (manifest.source === "vocabulary-adapter") {
          const hydrate = () => void repository.loadAll(controller.signal, (loaded) => {
            setLoadedCount(loaded);
            scheduleRender();
          }).catch(() => undefined);
          const idleCallback = window.requestIdleCallback;
          if (typeof idleCallback === "function") idleCallback(hydrate, { timeout: 1800 });
          else globalThis.setTimeout(hydrate, 500);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [open, repository, scheduleRender]);

  useEffect(() => {
    if (!open || !shellRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      const previous = sizeRef.current;
      const camera = cameraRef.current;
      const nextCamera = {
        ...camera,
        x: camera.x + (width - previous.width) / 2,
        y: camera.y + (height - previous.height) / 2,
      };
      sizeRef.current = { width, height };
      const manifest = repositoryRef.current?.manifest;
      cameraRef.current = manifest
        ? previous.width <= 1 || previous.height <= 1
          ? fitCamera(manifest, sizeRef.current)
          : constrainCamera(nextCamera, manifest.world, sizeRef.current)
        : nextCamera;
      scheduleRender();
      requestVisibleData();
    });
    observer.observe(shellRef.current);
    return () => observer.disconnect();
  }, [open, requestVisibleData, scheduleRender]);

  useEffect(() => scheduleRender(), [manifestReady, loadedCount, scheduleRender]);

  useEffect(() => {
    if (!open) return;
    const normalized = query.trim();
    if (!normalized) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void repository.find(normalized, controller.signal).then((matches) => {
        setResults(matches);
        setLoadedCount(repository.loadedNodes.length);
        setAnnouncement(matches.length ? `找到 ${matches.length} 个匹配词` : "没有找到匹配词");
        scheduleRender();
      }).catch(() => undefined);
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, repository, scheduleRender]);

  const zoomAt = useCallback((screenX: number, screenY: number, factor: number) => {
    const current = cameraRef.current;
    const nextScale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
    const worldX = (screenX - current.x) / current.scale;
    const worldY = (screenY - current.y) / current.scale;
    const nextCamera = {
      x: screenX - worldX * nextScale,
      y: screenY - worldY * nextScale,
      scale: nextScale,
    };
    const world = repositoryRef.current?.manifest?.world;
    cameraRef.current = world ? constrainCamera(nextCamera, world, sizeRef.current) : nextCamera;
    scheduleRender();
    requestVisibleData();
  }, [requestVisibleData, scheduleRender]);

  const focusNode = useCallback((node: SemanticNode) => {
    cameraRef.current = cameraAt(node, sizeRef.current);
    displayRef.current.selected = node;
    setSelected(node);
    onSelectWord?.(node);
    setAnnouncement(`${node.word}${showMeanings && node.meaning ? `，${node.meaning.split("\n")[0]}` : ""}`);
    scheduleRender();
  }, [onSelectWord, scheduleRender, showMeanings]);

  const selectAt = useCallback((x: number, y: number) => {
    for (let index = hitsRef.current.length - 1; index >= 0; index -= 1) {
      const hit = hitsRef.current[index];
      if (x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height) {
        focusNode(hit.node);
        return;
      }
    }
  }, [focusNode]);

  if (!open) return null;

  return (
    <section className="semantic-atlas" role="dialog" aria-modal="true" aria-label="可缩放语义词汇宇宙">
      <header className="semantic-atlas__header">
        <div className="semantic-atlas__brand">
          <span>SEMANTIC UNIVERSE</span>
          <strong>万词宇宙</strong>
        </div>
        <label className="semantic-atlas__search">
          <span className="semantic-atlas__sr-only">搜索英文或中文并在地图中定位</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
          <input ref={searchRef} value={query} onChange={(event) => {
            setQuery(event.target.value);
            if (!event.target.value.trim()) setResults([]);
          }} type="search" placeholder="搜索 10,000 个词…" />
          {query ? <button type="button" onClick={() => { setQuery(""); setResults([]); }} aria-label="清空搜索">×</button> : null}
        </label>
        <div className="semantic-atlas__actions">
          <button type="button" className={showMeanings ? "is-active" : ""} onClick={() => onShowMeaningsChange?.(!showMeanings)} aria-pressed={showMeanings} disabled={!onShowMeaningsChange}>
            译 {showMeanings ? "开" : "关"}
          </button>
          <button type="button" onClick={() => {
            const world = repository.manifest?.world;
            if (world) cameraRef.current = fitCamera(repository.manifest, sizeRef.current);
            displayRef.current.selected = null;
            setSelected(null);
            scheduleRender();
          }}>全景</button>
          <button type="button" className="semantic-atlas__close" onClick={onClose} aria-label="关闭词汇宇宙">×</button>
        </div>
      </header>

      <div
        ref={shellRef}
        className="semantic-atlas__viewport"
        data-status={status}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="词汇地图。使用方向键移动，加号减号缩放，回车选择中央词，Home 返回全景。"
          onWheel={(event) => {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.00135));
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
            if (pointersRef.current.size === 2) {
              const [a, b] = [...pointersRef.current.values()];
              gestureRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), centerX: (a.x + b.x) / 2, centerY: (a.y + b.y) / 2 };
            }
          }}
          onPointerMove={(event) => {
            const previous = pointersRef.current.get(event.pointerId);
            if (!previous) return;
            pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointersRef.current.size === 2) {
              const [a, b] = [...pointersRef.current.values()];
              const distance = Math.hypot(a.x - b.x, a.y - b.y);
              const centerX = (a.x + b.x) / 2;
              const centerY = (a.y + b.y) / 2;
              const gesture = gestureRef.current;
              const rect = event.currentTarget.getBoundingClientRect();
              if (gesture) {
                const nextCamera = { ...cameraRef.current, x: cameraRef.current.x + centerX - gesture.centerX, y: cameraRef.current.y + centerY - gesture.centerY };
                const world = repository.manifest?.world;
                cameraRef.current = world ? constrainCamera(nextCamera, world, sizeRef.current) : nextCamera;
                zoomAt(centerX - rect.left, centerY - rect.top, distance / Math.max(1, gesture.distance));
              }
              gestureRef.current = { distance, centerX, centerY };
            } else {
              const nextCamera = { ...cameraRef.current, x: cameraRef.current.x + event.clientX - previous.x, y: cameraRef.current.y + event.clientY - previous.y };
              const world = repository.manifest?.world;
              cameraRef.current = world ? constrainCamera(nextCamera, world, sizeRef.current) : nextCamera;
              if (dragRef.current && Math.hypot(event.clientX - dragRef.current.x, event.clientY - dragRef.current.y) > 5) dragRef.current.moved = true;
              scheduleRender();
            }
          }}
          onPointerUp={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            if (dragRef.current && !dragRef.current.moved && pointersRef.current.size === 1) selectAt(event.clientX - rect.left, event.clientY - rect.top);
            pointersRef.current.delete(event.pointerId);
            gestureRef.current = null;
            dragRef.current = null;
            requestVisibleData();
          }}
          onPointerCancel={(event) => {
            pointersRef.current.delete(event.pointerId);
            gestureRef.current = null;
            dragRef.current = null;
          }}
          onKeyDown={(event) => {
            const camera = cameraRef.current;
            const amount = event.shiftKey ? 180 : 72;
            let nextCamera: Camera | null = null;
            if (event.key === "ArrowLeft") nextCamera = { ...camera, x: camera.x + amount };
            else if (event.key === "ArrowRight") nextCamera = { ...camera, x: camera.x - amount };
            else if (event.key === "ArrowUp") nextCamera = { ...camera, y: camera.y + amount };
            else if (event.key === "ArrowDown") nextCamera = { ...camera, y: camera.y - amount };
            else if (event.key === "+" || event.key === "=") zoomAt(sizeRef.current.width / 2, sizeRef.current.height / 2, 1.22);
            else if (event.key === "-") zoomAt(sizeRef.current.width / 2, sizeRef.current.height / 2, 1 / 1.22);
            else if (event.key === "Home") {
              const world = repository.manifest?.world;
              if (world) cameraRef.current = fitCamera(repository.manifest, sizeRef.current);
            } else if (event.key === "Enter") selectAt(sizeRef.current.width / 2, sizeRef.current.height / 2);
            else if (!nextCamera) return;
            if (nextCamera) {
              const world = repository.manifest?.world;
              cameraRef.current = world ? constrainCamera(nextCamera, world, sizeRef.current) : nextCamera;
            }
            event.preventDefault();
            scheduleRender();
            requestVisibleData();
          }}
        />

        {status === "loading" ? <div className="semantic-atlas__loading"><i/><span>正在铺开词汇世界…</span></div> : null}
        {status === "error" ? <div className="semantic-atlas__error">词汇世界暂时无法读取。</div> : null}

        {results.length ? (
          <ol className="semantic-atlas__results" aria-label="搜索结果">
            {results.map((node) => (
              <li key={node.id}>
                <button type="button" onClick={() => focusNode(node)}>
                  <strong>{node.word}</strong>
                  {showMeanings ? <span>{node.meaning.split("\n")[0]}</span> : null}
                  <small>#{node.rank}</small>
                </button>
              </li>
            ))}
          </ol>
        ) : null}

        {selected ? (
          <aside className="semantic-atlas__card" aria-label="已选择的词">
            <button type="button" onClick={() => { displayRef.current.selected = null; setSelected(null); scheduleRender(); }} aria-label="收起词卡">×</button>
            <small>#{selected.rank} · {selected.partsOfSpeech.join(" · ") || "word"}</small>
            <h2>{selected.word}</h2>
            {selected.phonetic ? <p className="semantic-atlas__phonetic">/{selected.phonetic}/</p> : null}
            {showMeanings ? <p>{selected.meaning}</p> : <p className="semantic-atlas__muted">释义已关闭，先凭场景理解它。</p>}
          </aside>
        ) : null}

        <footer className="semantic-atlas__hud">
          <span><i className={loadedCount === totalCount ? "is-complete" : ""}/>已载入 {loadedCount.toLocaleString()} · 总词库 {totalCount.toLocaleString()}</span>
          <span>拖动探索 · 滚轮/双指缩放 · 点击词卡</span>
        </footer>
        <p className="semantic-atlas__sr-only" aria-live="polite">{announcement}</p>
      </div>
    </section>
  );
}

function drawRealmOverview(
  context: CanvasRenderingContext2D,
  realm: RealmOverview,
  camera: Camera,
): void {
  const x = realm.x * camera.scale + camera.x;
  const y = realm.y * camera.scale + camera.y;
  const width = 130;
  const height = 62;
  context.save();
  context.shadowColor = "rgba(35, 48, 40, .1)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 5;
  roundedRect(context, x - width / 2, y - height / 2, width, height, 15);
  context.fillStyle = "rgba(255, 253, 247, .92)";
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = `${realm.color}66`;
  context.lineWidth = 1;
  context.stroke();
  context.beginPath();
  context.arc(x - width / 2 + 15, y - height / 2 + 15, 4, 0, Math.PI * 2);
  context.fillStyle = realm.color;
  context.fill();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#29463b";
  context.font = "750 10.5px ui-sans-serif, system-ui, sans-serif";
  context.fillText(realm.title, x, y - 13, width - 18);
  context.fillStyle = "#4f675d";
  context.font = "600 12px ui-sans-serif, system-ui, sans-serif";
  context.fillText(realm.translation, x, y + 4, width - 18);
  context.fillStyle = "rgba(58, 73, 65, .56)";
  context.font = "500 9.5px ui-sans-serif, system-ui, sans-serif";
  context.fillText(`${realm.topicCount} 个主题 · ${realm.count.toLocaleString()} 词`, x, y + 21, width - 18);
  context.restore();
}

function drawClusterTitle(
  context: CanvasRenderingContext2D,
  cluster: SemanticCluster,
  camera: Camera,
  showMeanings: boolean,
): void {
  const x = cluster.x * camera.scale + camera.x;
  const y = (cluster.y - cluster.radius * 0.55) * camera.scale + camera.y;
  const size = clamp(10 + camera.scale * 20, 11, 17);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = cluster.color;
  context.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
  context.fillText(cluster.title, x, y);
  if (showMeanings) {
    context.fillStyle = "rgba(42,61,52,.62)";
    context.font = `500 ${Math.max(10, size - 3)}px ui-sans-serif, system-ui, sans-serif`;
    context.fillText(cluster.translation, x, y + size * 1.25);
  }
}
