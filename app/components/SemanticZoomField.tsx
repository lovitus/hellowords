"use client";

/* eslint-disable @next/next/no-img-element -- reviewed 1600×900 map tiles require exact native raster geometry */

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  focusSemanticZoomView,
  layoutSemanticZoomNodes,
  nearestSemanticZoomNode,
  nextSemanticZoomLevel,
  panSemanticZoomView,
  placeSemanticZoomNodes,
  projectSemanticZoomNodes,
  semanticNodeVisual,
  semanticWheelScale,
  semanticZoomBoundsForLevel,
  semanticZoomCamera,
  semanticZoomDepth,
  semanticZoomDisplayLevel,
  semanticZoomLevelForScale,
  semanticZoomNodeBudget,
  semanticZoomScaleForLevel,
  smoothSemanticZoomView,
  zoomSemanticViewAboutPoint,
  type SemanticZoomLayoutNode,
  type SemanticZoomLevel,
  type SemanticZoomView,
  type SemanticZoomViewport,
} from "../domain";
import {
  createLexicalWorldRepository,
  type LexicalLevelDescriptor,
  type LexicalWord,
  type LexicalWorldRepository,
  type LexicalWorldManifest,
} from "../lib/lexical-world-repository";
import {
  LEXICAL_WORLD_OVERVIEW_IMAGE,
  lexicalWorldTileForRealm,
  type LexicalWorldRealmTile,
} from "../lib/lexical-world-visuals";
import "./semantic-zoom-field.css";

export interface SemanticZoomFieldProps {
  readonly open: boolean;
  /** Optional SSR-safe sizing hint; ResizeObserver supplies the real width. */
  readonly viewportWidth?: number;
  readonly showMeanings: boolean;
  readonly onSelectWord: (word: LexicalWord) => void;
  readonly manifestUrl?: string;
  /** Share the modal repository so manifest and selected shards use one cache. */
  readonly repository?: LexicalWorldRepository;
}

interface DescriptorResource {
  readonly ownerId: string;
  readonly items: readonly LexicalLevelDescriptor[];
  readonly error?: string;
}

interface WordResource {
  readonly ownerId: string;
  readonly items: readonly LexicalWord[];
  readonly error?: string;
}

interface ManifestResource {
  readonly value?: LexicalWorldManifest;
  readonly error?: string;
}

interface SemanticFieldNode {
  readonly id: string;
  readonly count: number;
  readonly labelEn: string;
  readonly labelZh: string;
  readonly realmId: string;
  readonly descriptor?: LexicalLevelDescriptor;
  readonly word?: LexicalWord;
  readonly authoredPoint?: { readonly x: number; readonly y: number };
}

interface PinchSnapshot {
  readonly midpoint: { readonly x: number; readonly y: number };
  readonly distance: number;
}

interface PendingKeyboardFocus {
  readonly level: SemanticZoomLevel;
  readonly scenePoint: { readonly x: number; readonly y: number };
}

const INITIAL_VIEW: SemanticZoomView = { centerX: 800, centerY: 450, scale: 1 };
const EMPTY_DESCRIPTOR_RESOURCE: DescriptorResource = { ownerId: "", items: [] };
const EMPTY_WORD_RESOURCE: WordResource = { ownerId: "", items: [] };
const LEVEL_ORDER: Readonly<Record<SemanticZoomLevel, number>> = {
  realm: 0,
  topic: 1,
  subcluster: 2,
  word: 3,
};

function initialViewport(width?: number): SemanticZoomViewport {
  const safeWidth = Math.max(320, typeof width === "number" && Number.isFinite(width) ? width : 960);
  return {
    width: safeWidth,
    height: Math.max(420, Math.min(760, safeWidth * 9 / 16)),
  };
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "词汇数据暂时无法加载";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function tileBounds(tile: LexicalWorldRealmTile) {
  return tile.detailRect;
}

function pointerPosition(
  event: Pick<PointerEvent, "clientX" | "clientY">,
  element: HTMLElement,
) {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function pinchSnapshot(points: readonly { readonly x: number; readonly y: number }[]): PinchSnapshot | null {
  if (points.length < 2) return null;
  const [first, second] = points;
  return {
    midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
  };
}

export function SemanticZoomField({
  open,
  viewportWidth,
  showMeanings,
  onSelectWord,
  manifestUrl,
  repository: providedRepository,
}: SemanticZoomFieldProps) {
  const ownedRepository = useMemo(() => createLexicalWorldRepository(manifestUrl), [manifestUrl]);
  const repository = providedRepository ?? ownedRepository;
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SemanticZoomView>(INITIAL_VIEW);
  const targetViewRef = useRef<SemanticZoomView>(INITIAL_VIEW);
  const animationFrameRef = useRef<number | null>(null);
  const animationTimeRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<PinchSnapshot | null>(null);
  const keyboardActivationRef = useRef(false);
  const pendingKeyboardFocusRef = useRef<PendingKeyboardFocus | null>(null);

  const [viewport, setViewport] = useState<SemanticZoomViewport>(() => initialViewport(viewportWidth));
  const [view, setView] = useState<SemanticZoomView>(INITIAL_VIEW);
  const [manifestResource, setManifestResource] = useState<ManifestResource>({});
  const [topicResource, setTopicResource] = useState<DescriptorResource>(EMPTY_DESCRIPTOR_RESOURCE);
  const [subclusterResource, setSubclusterResource] = useState<DescriptorResource>(EMPTY_DESCRIPTOR_RESOURCE);
  const [wordResource, setWordResource] = useState<WordResource>(EMPTY_WORD_RESOURCE);
  const [selectedRealm, setSelectedRealm] = useState<LexicalLevelDescriptor>();
  const [selectedTopic, setSelectedTopic] = useState<LexicalLevelDescriptor>();
  const [selectedSubcluster, setSelectedSubcluster] = useState<LexicalLevelDescriptor>();
  const [dragging, setDragging] = useState(false);
  const [navigationAnnouncement, setNavigationAnnouncement] = useState("");

  const manifest = manifestResource.value;
  const realms = useMemo(() => manifest?.children ?? [], [manifest]);
  const topics = useMemo(() => (
    selectedRealm && topicResource.ownerId === selectedRealm.id ? topicResource.items : []
  ), [selectedRealm, topicResource]);
  const subclusters = useMemo(() => (
    selectedTopic && subclusterResource.ownerId === selectedTopic.id ? subclusterResource.items : []
  ), [selectedTopic, subclusterResource]);
  const words = useMemo(() => (
    selectedSubcluster && wordResource.ownerId === selectedSubcluster.id ? wordResource.items : []
  ), [selectedSubcluster, wordResource]);

  useEffect(() => {
    if (!open || manifestResource.value) return;
    const controller = new AbortController();
    repository.loadManifest(controller.signal).then(
      (value) => setManifestResource({ value }),
      (error: unknown) => {
        if (!isAbortError(error)) setManifestResource({ error: errorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [manifestResource.value, open, repository]);

  useEffect(() => {
    if (!open || !selectedRealm || topicResource.ownerId === selectedRealm.id) return;
    const controller = new AbortController();
    repository.loadChildren(selectedRealm, controller.signal).then(
      (items) => setTopicResource({ ownerId: selectedRealm.id, items }),
      (error: unknown) => {
        if (!isAbortError(error)) {
          setTopicResource({ ownerId: selectedRealm.id, items: [], error: errorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [open, repository, selectedRealm, topicResource.ownerId]);

  useEffect(() => {
    if (!open || !selectedTopic || subclusterResource.ownerId === selectedTopic.id) return;
    const controller = new AbortController();
    repository.loadChildren(selectedTopic, controller.signal).then(
      (items) => setSubclusterResource({ ownerId: selectedTopic.id, items }),
      (error: unknown) => {
        if (!isAbortError(error)) {
          setSubclusterResource({ ownerId: selectedTopic.id, items: [], error: errorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [open, repository, selectedTopic, subclusterResource.ownerId]);

  useEffect(() => {
    if (!open || !selectedSubcluster || wordResource.ownerId === selectedSubcluster.id) return;
    const controller = new AbortController();
    // loadWords resolves the selected leaf through its one semantic topic shard.
    // This field never calls repository.find(), so normal browsing cannot fan
    // out into the global ten-thousand-word payload.
    repository.loadWords(selectedSubcluster, controller.signal).then(
      (items) => setWordResource({ ownerId: selectedSubcluster.id, items }),
      (error: unknown) => {
        if (!isAbortError(error)) {
          setWordResource({ ownerId: selectedSubcluster.id, items: [], error: errorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [open, repository, selectedSubcluster, wordResource.ownerId]);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      setViewport((current) => (
        Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
          ? current
          : { width, height }
      ));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [open]);

  const activeTile = selectedRealm ? lexicalWorldTileForRealm(selectedRealm.id) : undefined;
  const realmNodes = useMemo<SemanticFieldNode[]>(() => realms.flatMap((descriptor) => {
    const tile = lexicalWorldTileForRealm(descriptor.id);
    return tile ? [{
      id: descriptor.id,
      count: descriptor.count,
      labelEn: descriptor.labelEn,
      labelZh: descriptor.labelZh,
      realmId: descriptor.id,
      descriptor,
      authoredPoint: tile.focalPoint,
    }] : [];
  }), [realms]);
  const realmLayout = useMemo(
    () => layoutSemanticZoomNodes(realmNodes, "realm"),
    [realmNodes],
  );

  const topicNodes = useMemo<SemanticFieldNode[]>(() => topics.map((descriptor) => ({
    id: descriptor.id,
    count: descriptor.count,
    labelEn: descriptor.labelEn,
    labelZh: descriptor.labelZh,
    realmId: selectedRealm?.id ?? "",
    descriptor,
  })), [selectedRealm?.id, topics]);
  const topicLayout = useMemo(() => (
    activeTile
      ? layoutSemanticZoomNodes(topicNodes, "topic", semanticZoomBoundsForLevel("topic", tileBounds(activeTile)))
      : []
  ), [activeTile, topicNodes]);
  const selectedTopicPoint = topicLayout.find(({ node }) => node.id === selectedTopic?.id);

  const subclusterNodes = useMemo<SemanticFieldNode[]>(() => subclusters.map((descriptor) => ({
    id: descriptor.id,
    count: descriptor.count,
    labelEn: descriptor.labelEn,
    labelZh: descriptor.labelZh,
    realmId: selectedRealm?.id ?? "",
    descriptor,
  })), [selectedRealm?.id, subclusters]);
  const subclusterLayout = useMemo(() => (
    activeTile
      ? layoutSemanticZoomNodes(
          subclusterNodes,
          "subcluster",
          semanticZoomBoundsForLevel("subcluster", tileBounds(activeTile), selectedTopicPoint),
        )
      : []
  ), [activeTile, selectedTopicPoint, subclusterNodes]);
  const selectedSubclusterPoint = subclusterLayout.find(({ node }) => node.id === selectedSubcluster?.id);

  const wordNodes = useMemo<SemanticFieldNode[]>(() => words.map((word) => ({
    id: word.id,
    count: 1,
    labelEn: word.word,
    labelZh: word.meaning,
    realmId: word.realmId || selectedRealm?.id || "",
    word,
  })), [selectedRealm?.id, words]);
  const wordLayout = useMemo(() => (
    activeTile
      ? layoutSemanticZoomNodes(
          wordNodes,
          "word",
          semanticZoomBoundsForLevel("word", tileBounds(activeTile), selectedSubclusterPoint),
        )
      : []
  ), [activeTile, selectedSubclusterPoint, wordNodes]);

  const targetLevel = semanticZoomLevelForScale(view.scale);
  const topicsReady = Boolean(selectedRealm && topicResource.ownerId === selectedRealm.id);
  const subclustersReady = Boolean(selectedTopic && subclusterResource.ownerId === selectedTopic.id);
  const wordsReady = Boolean(selectedSubcluster && wordResource.ownerId === selectedSubcluster.id);
  const displayLevel = semanticZoomDisplayLevel(targetLevel, {
    realmSelected: Boolean(selectedRealm),
    topicsReady,
    topicSelected: Boolean(selectedTopic),
    subclustersReady,
    subclusterSelected: Boolean(selectedSubcluster),
    wordsReady,
  });
  const currentLayout = displayLevel === "realm"
    ? realmLayout
    : displayLevel === "topic"
      ? topicLayout
      : displayLevel === "subcluster"
        ? subclusterLayout
        : wordLayout;
  const camera = semanticZoomCamera(view, viewport);
  const projectedNodes = placeSemanticZoomNodes(
    projectSemanticZoomNodes(
      currentLayout,
      camera,
      viewport,
      semanticZoomNodeBudget(viewport.width),
    ),
    viewport,
    displayLevel,
    {
      expanded: showMeanings,
      protectedRegions: [
        { x: 0, y: 0, width: viewport.width, height: viewport.width < 820 ? 94 : 88 },
        { x: 0, y: Math.max(0, viewport.height - 58), width: viewport.width, height: 58 },
      ],
    },
  );

  const startViewAnimation = useCallback(() => {
    if (animationFrameRef.current !== null || typeof requestAnimationFrame === "undefined") return;
    const tick = (timestamp: number) => {
      const previousTimestamp = animationTimeRef.current ?? timestamp - 16;
      animationTimeRef.current = timestamp;
      const target = targetViewRef.current;
      const next = smoothSemanticZoomView(viewRef.current, target, timestamp - previousTimestamp);
      viewRef.current = next;
      setView(next);
      if (next === target) {
        animationFrameRef.current = null;
        animationTimeRef.current = null;
      } else {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animationFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const applyView = useCallback((next: SemanticZoomView) => {
    targetViewRef.current = next;
    if (reducedMotionRef.current || typeof requestAnimationFrame === "undefined") {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      animationTimeRef.current = null;
      viewRef.current = next;
      setView(next);
      return;
    }
    startViewAnimation();
  }, [startViewAnimation]);

  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = query.matches;
    const onChange = () => {
      reducedMotionRef.current = query.matches;
      if (!query.matches) return;
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      animationTimeRef.current = null;
      viewRef.current = targetViewRef.current;
      setView(targetViewRef.current);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open]);

  useEffect(() => {
    const pointers = pointersRef.current;
    if (!open) {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      animationTimeRef.current = null;
      pointers.clear();
      pinchRef.current = null;
      pendingKeyboardFocusRef.current = null;
      return;
    }
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      animationTimeRef.current = null;
      pointers.clear();
      pinchRef.current = null;
    };
  }, [open]);

  const activateRealm = useCallback((node: SemanticZoomLayoutNode<SemanticFieldNode>) => {
    const descriptor = node.node.descriptor;
    if (!descriptor) return;
    setSelectedRealm(descriptor);
    setSelectedTopic(undefined);
    setSelectedSubcluster(undefined);
    setTopicResource(EMPTY_DESCRIPTOR_RESOURCE);
    setSubclusterResource(EMPTY_DESCRIPTOR_RESOURCE);
    setWordResource(EMPTY_WORD_RESOURCE);
    applyView(focusSemanticZoomView({ x: node.x, y: node.y }, "topic", viewport));
  }, [applyView, viewport]);

  const activateTopic = useCallback((node: SemanticZoomLayoutNode<SemanticFieldNode>) => {
    const descriptor = node.node.descriptor;
    if (!descriptor) return;
    setSelectedTopic(descriptor);
    setSelectedSubcluster(undefined);
    setSubclusterResource(EMPTY_DESCRIPTOR_RESOURCE);
    setWordResource(EMPTY_WORD_RESOURCE);
    applyView(focusSemanticZoomView({ x: node.x, y: node.y }, "subcluster", viewport));
  }, [applyView, viewport]);

  const activateSubcluster = useCallback((node: SemanticZoomLayoutNode<SemanticFieldNode>) => {
    const descriptor = node.node.descriptor;
    if (!descriptor) return;
    setSelectedSubcluster(descriptor);
    setWordResource(EMPTY_WORD_RESOURCE);
    applyView(focusSemanticZoomView({ x: node.x, y: node.y }, "word", viewport));
  }, [applyView, viewport]);

  const activateNode = useCallback((node: SemanticZoomLayoutNode<SemanticFieldNode>) => {
    if (keyboardActivationRef.current && displayLevel !== "word") {
      const nextLevel = nextSemanticZoomLevel(displayLevel);
      pendingKeyboardFocusRef.current = {
        level: nextLevel,
        scenePoint: { x: node.x, y: node.y },
      };
      setNavigationAnnouncement(`正在进入 ${node.node.labelEn}`);
    }
    keyboardActivationRef.current = false;
    if (displayLevel === "realm") activateRealm(node);
    else if (displayLevel === "topic") activateTopic(node);
    else if (displayLevel === "subcluster") activateSubcluster(node);
    else if (node.node.word) onSelectWord(node.node.word);
  }, [activateRealm, activateSubcluster, activateTopic, displayLevel, onSelectWord]);

  const selectNearestForCrossedLevel = useCallback((
    previousScale: number,
    nextScale: number,
    scenePoint: { readonly x: number; readonly y: number },
  ) => {
    const previousDepth = LEVEL_ORDER[semanticZoomLevelForScale(previousScale)];
    const nextDepth = LEVEL_ORDER[semanticZoomLevelForScale(nextScale)];
    if (nextDepth <= previousDepth) return;

    if (previousDepth < LEVEL_ORDER.topic && nextDepth >= LEVEL_ORDER.topic) {
      const nearest = nearestSemanticZoomNode(realmLayout, scenePoint);
      if (nearest && nearest.node.descriptor?.id !== selectedRealm?.id) {
        setSelectedRealm(nearest.node.descriptor);
        setSelectedTopic(undefined);
        setSelectedSubcluster(undefined);
        setTopicResource(EMPTY_DESCRIPTOR_RESOURCE);
        setSubclusterResource(EMPTY_DESCRIPTOR_RESOURCE);
        setWordResource(EMPTY_WORD_RESOURCE);
      }
      return;
    }
    if (previousDepth < LEVEL_ORDER.subcluster && nextDepth >= LEVEL_ORDER.subcluster) {
      const nearest = nearestSemanticZoomNode(topicLayout, scenePoint);
      if (nearest?.node.descriptor) {
        setSelectedTopic(nearest.node.descriptor);
        setSelectedSubcluster(undefined);
        setSubclusterResource(EMPTY_DESCRIPTOR_RESOURCE);
        setWordResource(EMPTY_WORD_RESOURCE);
      }
      return;
    }
    if (previousDepth < LEVEL_ORDER.word && nextDepth >= LEVEL_ORDER.word) {
      const nearest = nearestSemanticZoomNode(subclusterLayout, scenePoint);
      if (nearest?.node.descriptor) {
        setSelectedSubcluster(nearest.node.descriptor);
        setWordResource(EMPTY_WORD_RESOURCE);
      }
    }
  }, [realmLayout, selectedRealm?.id, subclusterLayout, topicLayout]);

  const zoomAt = useCallback((nextScale: number, point: { readonly x: number; readonly y: number }) => {
    const visible = viewRef.current;
    const previousTarget = targetViewRef.current;
    const nextLoadedLevel = nextSemanticZoomLevel(displayLevel);
    const boundedNextScale = displayLevel !== "word" && nextScale > previousTarget.scale
      ? Math.min(nextScale, semanticZoomScaleForLevel(nextLoadedLevel))
      : nextScale;
    const currentCamera = semanticZoomCamera(visible, viewport);
    const scenePoint = {
      x: (point.x - currentCamera.x) / currentCamera.scale,
      y: (point.y - currentCamera.y) / currentCamera.scale,
    };
    selectNearestForCrossedLevel(previousTarget.scale, boundedNextScale, scenePoint);
    applyView(zoomSemanticViewAboutPoint(visible, boundedNextScale, point, viewport));
  }, [applyView, displayLevel, selectNearestForCrossedLevel, viewport]);

  const reset = useCallback(() => {
    setSelectedRealm(undefined);
    setSelectedTopic(undefined);
    setSelectedSubcluster(undefined);
    setTopicResource(EMPTY_DESCRIPTOR_RESOURCE);
    setSubclusterResource(EMPTY_DESCRIPTOR_RESOURCE);
    setWordResource(EMPTY_WORD_RESOURCE);
    applyView(INITIAL_VIEW);
  }, [applyView]);

  const stepZoom = useCallback((factor: number) => {
    zoomAt(targetViewRef.current.scale * factor, { x: viewport.width / 2, y: viewport.height / 2 });
  }, [viewport, zoomAt]);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = pointerPosition(event, root);
      zoomAt(
        semanticWheelScale(targetViewRef.current.scale, event.deltaY, event.deltaMode, viewport.height),
        point,
      );
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("button")) return;
      root.setPointerCapture(event.pointerId);
      pointersRef.current.set(event.pointerId, pointerPosition(event, root));
      pinchRef.current = pinchSnapshot([...pointersRef.current.values()]);
      setDragging(true);
    };
    const onPointerMove = (event: PointerEvent) => {
      const previousPoint = pointersRef.current.get(event.pointerId);
      if (!previousPoint) return;
      const nextPoint = pointerPosition(event, root);
      pointersRef.current.set(event.pointerId, nextPoint);
      const points = [...pointersRef.current.values()];

      if (points.length === 1) {
        applyView(panSemanticZoomView(
          targetViewRef.current,
          { x: nextPoint.x - previousPoint.x, y: nextPoint.y - previousPoint.y },
          viewport,
        ));
        pinchRef.current = null;
        return;
      }

      const previousPinch = pinchRef.current;
      const nextPinch = pinchSnapshot(points);
      if (!previousPinch || !nextPinch) {
        pinchRef.current = nextPinch;
        return;
      }
      const panned = panSemanticZoomView(
        targetViewRef.current,
        {
          x: nextPinch.midpoint.x - previousPinch.midpoint.x,
          y: nextPinch.midpoint.y - previousPinch.midpoint.y,
        },
        viewport,
      );
      const nextScale = panned.scale * nextPinch.distance / previousPinch.distance;
      const pannedCamera = semanticZoomCamera(panned, viewport);
      const scenePoint = {
        x: (nextPinch.midpoint.x - pannedCamera.x) / pannedCamera.scale,
        y: (nextPinch.midpoint.y - pannedCamera.y) / pannedCamera.scale,
      };
      selectNearestForCrossedLevel(targetViewRef.current.scale, nextScale, scenePoint);
      applyView(zoomSemanticViewAboutPoint(panned, nextScale, nextPinch.midpoint, viewport));
      pinchRef.current = nextPinch;
    };
    const endPointer = (event: PointerEvent) => {
      pointersRef.current.delete(event.pointerId);
      pinchRef.current = pinchSnapshot([...pointersRef.current.values()]);
      if (!pointersRef.current.size) setDragging(false);
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", endPointer);
    root.addEventListener("pointercancel", endPointer);
    return () => {
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", endPointer);
      root.removeEventListener("pointercancel", endPointer);
    };
  }, [applyView, open, selectNearestForCrossedLevel, viewport, zoomAt]);

  const onNodeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      keyboardActivationRef.current = true;
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const layer = event.currentTarget.closest<HTMLElement>("[data-testid='semantic-zoom-label-layer']");
    const buttons = [...(layer?.querySelectorAll<HTMLButtonElement>("[data-semantic-node='true']") ?? [])];
    if (!buttons.length) return;
    const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const columns = Math.max(1, Math.round(Math.sqrt(buttons.length * viewport.width / viewport.height)));
    const delta = event.key === "ArrowLeft" ? -1
      : event.key === "ArrowRight" ? 1
        : event.key === "ArrowUp" ? -columns
          : event.key === "ArrowDown" ? columns
            : 0;
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
        : Math.max(0, Math.min(buttons.length - 1, (activeIndex < 0 ? 0 : activeIndex) + delta));
    event.preventDefault();
    buttons[nextIndex]?.focus();
  }, [viewport.height, viewport.width]);

  useEffect(() => {
    const pending = pendingKeyboardFocusRef.current;
    if (!open || !pending || pending.level !== displayLevel || !projectedNodes.length) return;
    const nearest = projectedNodes.reduce((best, candidate) => (
      Math.hypot(candidate.x - pending.scenePoint.x, candidate.y - pending.scenePoint.y)
        < Math.hypot(best.x - pending.scenePoint.x, best.y - pending.scenePoint.y)
        ? candidate
        : best
    ));
    const frame = requestAnimationFrame(() => {
      const selector = `[data-semantic-node='true'][data-level='${displayLevel}'][data-id='${CSS.escape(nearest.node.id)}']`;
      rootRef.current?.querySelector<HTMLButtonElement>(selector)?.focus({ preventScroll: true });
      pendingKeyboardFocusRef.current = null;
      setNavigationAnnouncement(`已进入 ${displayLevel} 层，${projectedNodes.length} 个可见词汇节点`);
    });
    return () => cancelAnimationFrame(frame);
  }, [displayLevel, open, projectedNodes]);

  if (!open) return null;

  const activeAsset = activeTile?.asset ?? LEXICAL_WORLD_OVERVIEW_IMAGE;
  const tileOpacity = activeTile ? Math.max(0, Math.min(1, (view.scale - 1.12) / 0.48)) : 0;
  const planeStyle = {
    transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
  } as CSSProperties;
  const activeTileStyle = activeTile ? {
    left: `${activeTile.detailRect.x}px`,
    top: `${activeTile.detailRect.y}px`,
    width: `${activeTile.detailRect.width}px`,
    height: `${activeTile.detailRect.height}px`,
    opacity: tileOpacity,
  } as CSSProperties : undefined;
  const currentError = manifestResource.error
    ?? (selectedRealm && topicResource.ownerId === selectedRealm.id ? topicResource.error : undefined)
    ?? (selectedTopic && subclusterResource.ownerId === selectedTopic.id ? subclusterResource.error : undefined)
    ?? (selectedSubcluster && wordResource.ownerId === selectedSubcluster.id ? wordResource.error : undefined);
  const loading = !manifest
    || LEVEL_ORDER[displayLevel] < LEVEL_ORDER[targetLevel]
    || (displayLevel === "topic" && topicResource.ownerId !== selectedRealm?.id)
    || (displayLevel === "subcluster" && subclusterResource.ownerId !== selectedTopic?.id)
    || (displayLevel === "word" && wordResource.ownerId !== selectedSubcluster?.id);
  const breadcrumb = [selectedRealm?.labelEn, selectedTopic?.labelEn, selectedSubcluster?.labelEn]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={rootRef}
      className={`semantic-zoom-field${dragging ? " semantic-zoom-field--dragging" : ""}`}
      data-testid="semantic-zoom-field"
      data-level={displayLevel}
      data-target-level={targetLevel}
      data-active-realm={selectedRealm?.id}
      data-active-asset={activeAsset}
      data-live-count={projectedNodes.length}
      role="region"
      aria-label="万词语义世界"
      aria-busy={loading}
    >
      <div className="semantic-zoom-field__plane" data-testid="semantic-zoom-plane" style={planeStyle} aria-hidden="true">
        <img
          className="semantic-zoom-field__overview"
          data-testid="semantic-zoom-overview"
          src={LEXICAL_WORLD_OVERVIEW_IMAGE}
          alt=""
          draggable={false}
        />
        {activeTile && activeTileStyle ? (
          <span
            className="semantic-zoom-field__realm-tile"
            data-testid="semantic-realm-tile"
            data-realm={activeTile.realmId}
            data-asset={activeTile.asset}
            style={activeTileStyle}
          >
            <img src={activeTile.asset} alt="" draggable={false} />
          </span>
        ) : null}
      </div>

      <div
        className={`semantic-zoom-field__labels semantic-zoom-field__labels--${displayLevel}`}
        data-testid="semantic-zoom-label-layer"
      >
        {projectedNodes.map((projected) => {
          const visual = semanticNodeVisual(displayLevel, projected.node.realmId, semanticZoomDepth(displayLevel));
          const style = {
            left: `${projected.screenX}px`,
            top: `${projected.screenY}px`,
            "--semantic-node-color": visual.color,
            "--semantic-node-background": visual.background,
            "--semantic-node-border": visual.borderColor,
            "--semantic-node-ink": visual.textColor,
            "--semantic-node-muted": visual.mutedTextColor,
            "--semantic-node-radius": `${Math.round(projected.radius * visual.radiusScale)}px`,
            "--semantic-node-width": `${projected.boxWidth}px`,
            "--semantic-node-height": `${projected.boxHeight}px`,
          } as CSSProperties;
          const leaderLength = Math.hypot(
            projected.screenX - projected.anchorScreenX,
            projected.screenY - projected.anchorScreenY,
          );
          const leaderStyle = {
            left: `${projected.anchorScreenX}px`,
            top: `${projected.anchorScreenY}px`,
            width: `${leaderLength}px`,
            transform: `rotate(${Math.atan2(
              projected.screenY - projected.anchorScreenY,
              projected.screenX - projected.anchorScreenX,
            )}rad)`,
            "--semantic-node-color": visual.color,
          } as CSSProperties;
          return (
            <span className="semantic-zoom-field__node-wrap" key={`${displayLevel}:${projected.node.id}`}>
              {leaderLength > 8 ? <i className="semantic-zoom-field__leader" style={leaderStyle} aria-hidden="true" /> : null}
              <button
                type="button"
                className="semantic-zoom-field__node"
                data-testid="semantic-zoom-node"
                data-semantic-node="true"
                data-level={displayLevel}
                data-id={projected.node.id}
                data-count={projected.node.count}
                data-realm={projected.node.realmId}
                data-palette-index={visual.paletteIndex}
                data-anchor-x={projected.anchorScreenX.toFixed(2)}
                data-anchor-y={projected.anchorScreenY.toFixed(2)}
                data-lexical-word-id={projected.node.word?.id}
                style={style}
                onClick={() => activateNode(projected)}
                onPointerDown={() => { keyboardActivationRef.current = false; }}
                onKeyDown={onNodeKeyDown}
                aria-label={displayLevel === "word"
                  ? `${projected.node.labelEn}${showMeanings && projected.node.labelZh ? `，${projected.node.labelZh}` : ""}`
                  : `进入 ${projected.node.labelEn}，${formatCount(projected.node.count)} 个词`}
              >
                <span className="semantic-zoom-field__node-dot" aria-hidden="true" />
                <strong>{projected.node.labelEn}</strong>
                {showMeanings && projected.node.labelZh ? <span>{projected.node.labelZh}</span> : null}
                {displayLevel !== "word" ? <small>{formatCount(projected.node.count)}</small> : null}
              </button>
            </span>
          );
        })}
      </div>

      <div className="semantic-zoom-field__chrome">
        <div className="semantic-zoom-field__context">
          <span>{displayLevel === "realm" ? "10 个词汇领域" : breadcrumb}</span>
          <strong>{displayLevel === "realm" ? "拖动或滚动，进入一个词汇岛" : `${displayLevel} · ${formatCount(projectedNodes.length)} visible`}</strong>
        </div>
        <div className="semantic-zoom-field__controls" aria-label="缩放控制">
          <button type="button" data-testid="semantic-zoom-reset" onClick={reset}>总览</button>
          <button type="button" data-testid="semantic-zoom-out" onClick={() => stepZoom(1 / 1.35)} aria-label="缩小">−</button>
          <button type="button" data-testid="semantic-zoom-in" onClick={() => stepZoom(1.35)} aria-label="放大">+</button>
        </div>
      </div>

      <p className={`semantic-zoom-field__status${currentError ? " semantic-zoom-field__status--error" : ""}`} aria-live="polite">
        {currentError ?? (loading ? "正在载入这一层…" : `${formatCount(projectedNodes.length)} 个清晰标签 · 本层最多 ${semanticZoomNodeBudget(viewport.width)}`)}
      </p>
      <span className="semantic-zoom-field__sr-only" aria-live="polite">{navigationAnnouncement}</span>
    </div>
  );
}
