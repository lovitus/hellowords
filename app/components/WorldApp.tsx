"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LexicalWorld } from "./LexicalWorld";
import {
  childCameraFromPortalTile,
  fullyFittedSceneCamera,
  parentCameraFromChildTile,
  SceneViewport,
  type SceneFocusNavigator,
  type SceneFocusTarget,
  type ScenePortalNavigator,
  type SceneContinuityView,
  type SceneViewportSnapshot,
} from "./SceneViewport";
import {
  getPreparedScene,
  loadSceneManifest,
  prefetchScene,
  prepareScene,
  retainSceneNeighborhood,
  type Scene,
} from "../lib/scene-repository";
import {
  parseDiscoveredEntries,
  recordDiscoveredLabels,
  serializeDiscoveredEntries,
  type Label,
  type Portal,
} from "../domain";
import { SPATIAL_LEXEME_REALMS } from "../domain/spatialLexemeRealms.generated";

const MEANING_KEY = "hellowords:meaning-visible";
// v1 counted every label as soon as its scene loaded, including words the user
// never saw. Keep that data untouched, but start the truthful dwell-based model
// in a new namespace so existing inflated totals do not leak into the UI.
const DISCOVERED_KEY = "hellowords:encountered-labels:v2";
const SPATIAL_REALM_BY_LEXEME: Readonly<Record<string, string | undefined>> = SPATIAL_LEXEME_REALMS;

export type SceneTransitionCacheReadiness = "warm" | "cold";

export interface WorldSceneSettledDetail {
  readonly from: string;
  readonly to: string;
  readonly durationMs: number;
  /** Time until React received the scene swap; warm paths stay in the input turn. */
  readonly commitMs: number;
  readonly cache: SceneTransitionCacheReadiness;
}

type LexicalWorldEntryMode = "global" | "spatial-bridge" | "spatial-overscroll";

interface LexicalWorldEntryState {
  readonly mode: LexicalWorldEntryMode;
  readonly realmId?: string;
  readonly word?: string;
  /** Exact spatial camera left mounted beneath the semantic plane. */
  readonly returnSnapshot?: SceneViewportSnapshot;
}

type SemanticTransitionState = "idle" | "open" | "returning";

const ROOT_ATLAS_DISTRICT_META = [
  { id: "school", label: "Campus", translation: "校园", prefix: "school-" },
  { id: "science", label: "Science", translation: "科研", prefix: "science-" },
  { id: "transport", label: "Transit", translation: "交通", prefix: "transport-" },
  { id: "farm", label: "Farm", translation: "农场", prefix: "farm-" },
  { id: "market", label: "Market", translation: "市场", prefix: "market-" },
  { id: "wetland", label: "Wetland", translation: "湿地", prefix: "wetland-" },
] as const;

interface RootAtlasDistrict {
  readonly id: string;
  readonly label: string;
  readonly translation: string;
  readonly labelCount: number;
  readonly zoneCount: number;
  readonly labelIds: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly focusX: number;
  readonly focusY: number;
  readonly targetScale: number;
  readonly zones: readonly RootAtlasZone[];
}

interface RootAtlasZone {
  readonly id: string;
  readonly title: string;
  readonly labelCount: number;
  readonly focusX: number;
  readonly focusY: number;
  readonly targetScale: number;
}

declare global {
  interface WindowEventMap {
    "world:scene-settled": CustomEvent<WorldSceneSettledDetail>;
  }
}

export function WorldApp() {
  const [scene, setScene] = useState<Scene | null>(null);
  const [outgoingScene, setOutgoingScene] = useState<Scene | null>(null);
  const [history, setHistory] = useState<Scene[]>([]);
  const [sceneTitles, setSceneTitles] = useState<Record<string, string>>({});
  const [meaningVisible, setMeaningVisible] = useState(false);
  const [lexicalWorldOpen, setLexicalWorldOpen] = useState(false);
  const [lexicalWorldInitialFocus, setLexicalWorldInitialFocus] = useState<"auto" | "search" | "dialog">("auto");
  const [lexicalWorldEntry, setLexicalWorldEntry] = useState<LexicalWorldEntryState | null>(null);
  const [semanticTransitionState, setSemanticTransitionState] = useState<SemanticTransitionState>("idle");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transitionState, setTransitionState] = useState<"loading" | "incoming" | "idle">("loading");
  const [transitionTarget, setTransitionTarget] = useState<string | null>(null);
  const [transitionCache, setTransitionCache] = useState<"idle" | SceneTransitionCacheReadiness>("idle");
  const [announcedSceneTitle, setAnnouncedSceneTitle] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);
  const [sceneContinuityView, setSceneContinuityView] = useState<SceneContinuityView | undefined>();
  const [continuousTransitionActive, setContinuousTransitionActive] = useState(false);
  const [viewportMotionFrozen, setViewportMotionFrozen] = useState(false);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [selectedAtlasDistrictId, setSelectedAtlasDistrictId] = useState<string | null>(null);
  const [focusedAtlasZoneId, setFocusedAtlasZoneId] = useState<string | null>(null);
  const [focusedSceneDetailZoneId, setFocusedSceneDetailZoneId] = useState<string | null>(null);
  const [sceneWordIndexOpen, setSceneWordIndexOpen] = useState(false);
  const [sceneWordIndexQuery, setSceneWordIndexQuery] = useState("");
  const navigationRef = useRef<AbortController | null>(null);
  const sceneHeadingRef = useRef<HTMLHeadingElement>(null);
  const sceneWordIndexInputRef = useRef<HTMLInputElement>(null);
  const focusHeadingAfterNavigationRef = useRef(false);
  const navigationPhaseRef = useRef<"idle" | "committing" | "navigating" | "settling">("idle");
  const transitionTargetIdRef = useRef<string | null>(null);
  const transitionStartedAtRef = useRef(0);
  const transitionWasWarmRef = useRef(false);
  const transitionSequenceRef = useRef(0);
  const preferredChildRef = useRef<string | null>(null);
  const activeViewportSnapshotRef = useRef<SceneViewportSnapshot | null>(null);
  const semanticReturnTimerRef = useRef<number | null>(null);
  const pendingPortalRef = useRef<Portal | null>(null);
  const activePortalNavigatorRef = useRef<ScenePortalNavigator | null>(null);
  const activeFocusTargetNavigatorRef = useRef<SceneFocusNavigator | null>(null);
  const pendingContinuitySettleRef = useRef<(() => void) | null>(null);
  const transitionUsesContinuityRef = useRef(false);
  const discoveredEntriesRef = useRef<ReadonlySet<string>>(new Set());
  const sceneControlsLocked = loading || continuousTransitionActive || viewportMotionFrozen;

  const rootAtlasDistricts = useMemo<readonly RootAtlasDistrict[]>(() => {
    if (scene?.id !== "world-map" || !scene.detailZones?.length) return [];
    return ROOT_ATLAS_DISTRICT_META.flatMap((meta) => {
      const zones = scene.detailZones!.filter((zone) => zone.id.startsWith(meta.prefix));
      if (zones.length === 0) return [];
      const left = Math.min(...zones.map((zone) => zone.x));
      const top = Math.min(...zones.map((zone) => zone.y));
      const right = Math.max(...zones.map((zone) => zone.x + zone.width));
      const bottom = Math.max(...zones.map((zone) => zone.y + zone.height));
      const labelIds = [...new Set(zones.flatMap((zone) => zone.labelIds))];
      return [{
        id: meta.id,
        label: meta.label,
        translation: meta.translation,
        labelCount: labelIds.length,
        zoneCount: zones.length,
        labelIds,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        focusX: (left + right) / 2,
        focusY: (top + bottom) / 2,
        targetScale: Math.min(2.8, Math.max(2.35, Math.min(...zones.map((zone) => zone.targetScale)))),
        zones: zones.map((zone) => ({
          id: zone.id,
          title: zone.title,
          labelCount: zone.labelIds.length,
          focusX: zone.x + zone.width / 2,
          focusY: zone.y + zone.height / 2,
          targetScale: zone.targetScale,
        })),
      }];
    });
  }, [scene]);

  const selectedAtlasDistrict = rootAtlasDistricts.find(
    (district) => district.id === selectedAtlasDistrictId,
  ) ?? null;

  const sceneDetailZones = useMemo(() => {
    if (!scene || scene.id === "world-map") return [];
    const labelById = new Map(scene.labels.map((label) => [label.id, label]));
    return (scene.detailZones ?? []).map((zone) => {
      const points = zone.labelIds
        .map((labelId) => labelById.get(labelId))
        .filter((label): label is Label => Boolean(label));
      const focusX = points.length === 0
        ? zone.x + zone.width / 2
        : (Math.min(...points.map((label) => label.x))
          + Math.max(...points.map((label) => label.x))) / 2;
      const focusY = points.length === 0
        ? zone.y + zone.height / 2
        : (Math.min(...points.map((label) => label.y))
          + Math.max(...points.map((label) => label.y))) / 2;
      return {
        id: zone.id,
        title: zone.title,
        translation: zone.translation,
        labelCount: zone.labelIds.length,
        focusX,
        focusY,
        targetScale: zone.targetScale,
      };
    });
  }, [scene]);

  const sceneWordIndexMatches = useMemo(() => {
    if (!scene) return { total: 0, labels: [] as readonly Label[] };
    const query = sceneWordIndexQuery.trim().toLocaleLowerCase("en-US");
    const matches = query
      ? scene.labels.filter((label) => (
        label.word.toLocaleLowerCase("en-US").includes(query)
        || label.translation.toLocaleLowerCase("zh-CN").includes(query)
      ))
      : scene.labels;
    return {
      total: matches.length,
      labels: [...matches]
        .sort((first, second) => first.priority - second.priority || first.id.localeCompare(second.id))
        .slice(0, 32),
    };
  }, [scene, sceneWordIndexQuery]);

  useEffect(() => {
    if (!sceneWordIndexOpen || window.innerWidth <= 900) return;
    sceneWordIndexInputRef.current?.focus();
  }, [sceneWordIndexOpen]);

  useEffect(() => {
    const storedMeaningVisible = window.localStorage.getItem(MEANING_KEY) === "true";
    const discoveredEntries = parseDiscoveredEntries(window.localStorage.getItem(DISCOVERED_KEY));
    discoveredEntriesRef.current = discoveredEntries;
    queueMicrotask(() => {
      setMeaningVisible(storedMeaningVisible);
      setDiscoveredCount(discoveredEntries.size);
    });
    const controller = new AbortController();
    void loadSceneManifest(controller.signal)
      .then((manifest) => {
        setSceneTitles(Object.fromEntries(manifest.scenes.map((item) => [item.id, item.title])));
        retainSceneNeighborhood(manifest.rootSceneId, null);
        return prepareScene(manifest.rootSceneId, controller.signal);
      })
      .then((initialScene) => {
        preferredChildRef.current = initialScene.portals[0]?.childSceneId ?? null;
        retainSceneNeighborhood(
          initialScene.id,
          initialScene.parentId ?? null,
          initialScene.portals[0]?.childSceneId,
        );
        if (preferredChildRef.current) prefetchScene(preferredChildRef.current);
        setScene(initialScene);
        setHistory([initialScene]);
        setAnnouncedSceneTitle(initialScene.title);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Scene failed to load");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setTransitionState("idle");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    navigationRef.current?.abort();
    if (semanticReturnTimerRef.current !== null) {
      window.clearTimeout(semanticReturnTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!scene) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSelectedLabel(null);
    });
    return () => {
      active = false;
    };
  }, [scene]);

  useEffect(() => {
    if (!scene) return;
    const preferredIsChild = scene.portals.some((portal) => portal.childSceneId === preferredChildRef.current);
    const target = preferredIsChild ? preferredChildRef.current : scene.portals[0]?.childSceneId;
    preferredChildRef.current = target ?? null;
    retainSceneNeighborhood(scene.id, scene.parentId ?? null, target);
    if (!target) return;
    // The neighborhood is deliberately tiny, so warming its single child is
    // cheap and should begin immediately. Deferring this to idle time made a
    // quick first zoom pay the complete network/decode cost.
    prefetchScene(target);
  }, [scene]);

  const prefetchPreferredScene = useCallback((targetId: string) => {
    if (!scene) return null;
    const rememberedChild = scene.portals.some((portal) => portal.childSceneId === preferredChildRef.current)
      ? preferredChildRef.current
      : scene.portals[0]?.childSceneId ?? null;
    if (targetId === scene.parentId) {
      // SceneViewport also warms the exit path. The parent already occupies
      // its own cache slot and must not replace the preferred child slot.
      retainSceneNeighborhood(scene.id, scene.parentId ?? null, rememberedChild);
      return getPreparedScene(targetId) ?? prepareScene(targetId).catch(() => null);
    }
    if (!scene.portals.some((portal) => portal.childSceneId === targetId)) return null;
    // Focus/hover is a stronger intent signal than portal order. Replacing the
    // speculative child here keeps multi-portal scenes fast without retaining
    // every branch in memory.
    preferredChildRef.current = targetId;
    retainSceneNeighborhood(scene.id, scene.parentId ?? null, targetId);
    return getPreparedScene(targetId) ?? prepareScene(targetId).catch(() => null);
  }, [scene]);

  const settleScene = useCallback((
    from: string,
    nextScene: Scene,
    startedAt: number,
    committedAt: number,
    cache: SceneTransitionCacheReadiness,
    transitionSequence: number,
  ) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const finishedAt = performance.now();
        performance.measure("scene-transition", { start: startedAt, end: finishedAt });
        window.dispatchEvent(
          new CustomEvent<WorldSceneSettledDetail>("world:scene-settled", {
            detail: {
              from,
              to: nextScene.id,
              durationMs: finishedAt - startedAt,
              commitMs: committedAt - startedAt,
              cache,
            },
          }),
        );
        if (transitionSequenceRef.current === transitionSequence) setTransitionCache("idle");
      });
    });
  }, []);

  const beginSceneCommit = useCallback((
    targetId: string,
    source: "zoom" | "pointer" | "keyboard",
    portal?: Portal,
  ): false | "warm" | "cold" => {
    if (navigationPhaseRef.current !== "idle") return false;
    setFocusedSceneDetailZoneId(null);
    setSceneWordIndexOpen(false);
    setSceneWordIndexQuery("");
    navigationPhaseRef.current = "committing";
    transitionSequenceRef.current += 1;
    transitionTargetIdRef.current = targetId;
    transitionStartedAtRef.current = performance.now();
    transitionWasWarmRef.current = getPreparedScene(targetId) !== null;
    pendingPortalRef.current = portal ?? null;
    transitionUsesContinuityRef.current = Boolean(portal);
    setContinuousTransitionActive(Boolean(portal));
    const cacheReadiness = transitionWasWarmRef.current ? "warm" : "cold";
    setTransitionCache(cacheReadiness);
    performance.mark("scene-transition-start");
    focusHeadingAfterNavigationRef.current = source === "keyboard";
    setLoadError(null);
    if (!transitionWasWarmRef.current) {
      setTransitionTarget(sceneTitles[targetId] ?? targetId);
      setTransitionState("loading");
      setLoading(true);
    }
    return transitionWasWarmRef.current ? "warm" : "cold";
  }, [sceneTitles]);

  const navigate = useCallback(
    async (
      targetId: string,
      direction: "forward" | "back",
      source: "zoom" | "pointer" | "keyboard" = "pointer",
      historyIndex?: number,
    ): Promise<boolean> => {
      if (!scene || targetId === scene.id) return false;
      const alreadyCommitted = navigationPhaseRef.current === "committing"
        && transitionTargetIdRef.current === targetId;
      if (!alreadyCommitted && !beginSceneCommit(targetId, source)) return false;
      if (navigationPhaseRef.current !== "committing") return false;
      navigationPhaseRef.current = "navigating";
      navigationRef.current?.abort();
      const controller = new AbortController();
      navigationRef.current = controller;
      const startedAt = transitionStartedAtRef.current || performance.now();
      const wasWarm = transitionWasWarmRef.current;
      const cacheReadiness: SceneTransitionCacheReadiness = wasWarm ? "warm" : "cold";
      let usesContinuity = transitionUsesContinuityRef.current;
      const transitionSequence = transitionSequenceRef.current;
      const historyTarget = history.find((item) => item.id === targetId);
      const targetParentId = direction === "forward" ? scene.id : historyTarget?.parentId ?? null;
      const backPreferredChild = direction === "back"
        ? historyIndex === undefined ? scene.id : history[historyIndex + 1]?.id ?? null
        : null;
      retainSceneNeighborhood(targetId, targetParentId, backPreferredChild);
      try {
        // A decoded neighbor is available synchronously. Avoid even a promise
        // microtask here so clicking a warm child or returning to its parent
        // replaces the scene in the same input turn.
        const preparedScene = getPreparedScene(targetId);
        const nextScene = preparedScene ?? await prepareScene(targetId, controller.signal);
        if (controller.signal.aborted) return false;
        if (!wasWarm && transitionUsesContinuityRef.current) {
          // Let the newly decoded child tile paint inside the still-mounted
          // parent portal once before transferring scene ownership.
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          if (controller.signal.aborted) return false;
        }
        const nextPreferredChild = direction === "back"
          ? backPreferredChild
          : nextScene.portals[0]?.childSceneId;
        preferredChildRef.current = nextPreferredChild ?? null;
        retainSceneNeighborhood(nextScene.id, nextScene.parentId ?? null, nextPreferredChild);
        if (nextPreferredChild) prefetchScene(nextPreferredChild);
        const snapshot = activeViewportSnapshotRef.current;
        let nextContinuityView: SceneContinuityView | undefined;
        if (snapshot?.sceneId === scene.id) {
          const viewportSize = {
            width: snapshot.viewportWidth,
            height: snapshot.viewportHeight,
          };
          if (direction === "forward") {
            const portal = pendingPortalRef.current;
            if (portal?.childSceneId === nextScene.id) {
              nextContinuityView = {
                direction: "forward",
                camera: childCameraFromPortalTile(portal, snapshot.camera, nextScene, viewportSize),
                settledCamera: fullyFittedSceneCamera(nextScene, viewportSize),
              };
            }
          } else {
            const returnPortal = nextScene.portals.find((portal) => portal.childSceneId === scene.id);
            if (returnPortal) {
              nextContinuityView = {
                direction: "back",
                camera: parentCameraFromChildTile(
                  returnPortal,
                  snapshot.camera,
                  nextScene,
                  scene,
                  viewportSize,
                ),
                settledCamera: fullyFittedSceneCamera(nextScene, viewportSize),
                tileScene: scene,
                tilePortal: returnPortal,
              };
            }
          }
        }
        usesContinuity = Boolean(nextContinuityView);
        transitionUsesContinuityRef.current = usesContinuity;
        setContinuousTransitionActive(usesContinuity);
        const committedAt = performance.now();
        setSceneContinuityView(nextContinuityView);
        setOutgoingScene(wasWarm || usesContinuity ? null : scene);
        setScene(nextScene);
        setHistory((current) =>
          direction === "forward"
            ? [...current, nextScene]
            : current.slice(0, historyIndex === undefined ? -1 : historyIndex + 1),
        );
        if (!wasWarm && !usesContinuity) {
          setTransitionState("incoming");
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          await new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 80 : 220));
          if (controller.signal.aborted) return false;
          setOutgoingScene(null);
          setTransitionState("idle");
          setTransitionTarget(null);
          setLoading(false);
        }
        setAnnouncedSceneTitle(nextScene.title);
        navigationPhaseRef.current = usesContinuity ? "settling" : "idle";
        transitionTargetIdRef.current = null;
        transitionStartedAtRef.current = 0;
        transitionWasWarmRef.current = false;
        pendingPortalRef.current = null;
        if (wasWarm || usesContinuity) {
          // These are normally already idle/false for a warm swap; keeping the
          // assignments here also heals state after a superseded cold attempt.
          setTransitionState("idle");
          setTransitionTarget(null);
          setLoading(false);
        }
        if (!usesContinuity) setContinuousTransitionActive(false);
        const dispatchSettled = () => settleScene(
          scene.id,
          nextScene,
          startedAt,
          committedAt,
          cacheReadiness,
          transitionSequence,
        );
        if (usesContinuity) {
          pendingContinuitySettleRef.current = dispatchSettled;
        } else {
          dispatchSettled();
        }
        if (focusHeadingAfterNavigationRef.current) {
          requestAnimationFrame(() => sceneHeadingRef.current?.focus({ preventScroll: true }));
        }
        return true;
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          retainSceneNeighborhood(scene.id, scene.parentId ?? null, scene.portals[0]?.childSceneId);
          setLoadError(error instanceof Error ? error.message : "Scene failed to load");
          setTransitionState("idle");
          setTransitionTarget(null);
          setOutgoingScene(null);
          setLoading(false);
          navigationPhaseRef.current = "idle";
          transitionTargetIdRef.current = null;
          transitionStartedAtRef.current = 0;
          transitionWasWarmRef.current = false;
          pendingPortalRef.current = null;
          transitionUsesContinuityRef.current = false;
          pendingContinuitySettleRef.current = null;
          setContinuousTransitionActive(false);
          setTransitionCache("idle");
        }
        return false;
      } finally {
        if (navigationRef.current === controller) navigationRef.current = null;
      }
    },
    [beginSceneCommit, history, scene, settleScene],
  );

  const goBack = useCallback((source: "zoom" | "pointer" | "keyboard" = "pointer") => {
    if (history.length < 2 || sceneControlsLocked) return;
    void navigate(history[history.length - 2].id, "back", source);
  }, [history, navigate, sceneControlsLocked]);

  const goToBreadcrumb = useCallback(
    (index: number, source: "pointer" | "keyboard") => {
      if (index === history.length - 1 || !scene || sceneControlsLocked) return;
      const target = history[index];
      void navigate(target.id, "back", source, index);
    },
    [history, navigate, scene, sceneControlsLocked],
  );

  const enterPortalFromMinimap = useCallback((
    portal: Portal,
    source: "pointer" | "keyboard",
  ) => {
    if (sceneControlsLocked) return;
    activePortalNavigatorRef.current?.(portal.id, source);
  }, [sceneControlsLocked]);

  const registerPortalNavigator = useCallback((navigator: ScenePortalNavigator | null) => {
    activePortalNavigatorRef.current = navigator;
  }, []);

  const registerFocusTargetNavigator = useCallback((navigator: SceneFocusNavigator | null) => {
    activeFocusTargetNavigatorRef.current = navigator;
  }, []);

  const focusAtlasDistrict = useCallback((district: RootAtlasDistrict, source: "pointer" | "keyboard") => {
    if (sceneControlsLocked || scene?.id !== "world-map") return false;
    setSelectedAtlasDistrictId(district.id);
    setFocusedAtlasZoneId(null);
    const target: SceneFocusTarget = {
      id: `atlas-district-${district.id}`,
      x: district.focusX,
      y: district.focusY,
      targetScale: district.targetScale,
    };
    return activeFocusTargetNavigatorRef.current?.(target, source) ?? false;
  }, [scene?.id, sceneControlsLocked]);

  const focusAtlasZone = useCallback((zone: RootAtlasZone, source: "pointer" | "keyboard") => {
    if (sceneControlsLocked || scene?.id !== "world-map") return false;
    setFocusedAtlasZoneId(zone.id);
    const target: SceneFocusTarget = {
      id: zone.id,
      x: zone.focusX,
      y: zone.focusY,
      targetScale: zone.targetScale,
    };
    return activeFocusTargetNavigatorRef.current?.(target, source) ?? false;
  }, [scene?.id, sceneControlsLocked]);

  const focusSceneDetailZone = useCallback((zone: RootAtlasZone, source: "pointer" | "keyboard") => {
    if (sceneControlsLocked || !scene || scene.id === "world-map") return false;
    setFocusedSceneDetailZoneId(zone.id);
    const target: SceneFocusTarget = {
      id: zone.id,
      x: zone.focusX,
      y: zone.focusY,
      targetScale: zone.targetScale,
    };
    return activeFocusTargetNavigatorRef.current?.(target, source) ?? false;
  }, [scene, sceneControlsLocked]);

  const focusSceneLabelFromIndex = useCallback((label: Label, source: "pointer" | "keyboard") => {
    if (sceneControlsLocked || !scene) return false;
    const target: SceneFocusTarget = {
      id: label.id,
      x: label.x,
      y: label.y,
      targetScale: Math.min(
        3.8,
        Math.max(1.2, (label.minScale ?? 0) + 0.4, 1.15 + (label.minLevel ?? 0) * 0.55),
      ),
    };
    const focused = activeFocusTargetNavigatorRef.current?.(target, source) ?? false;
    if (focused) {
      setSelectedLabel(label);
      setSceneWordIndexOpen(false);
      setSceneWordIndexQuery("");
    }
    return focused;
  }, [scene, sceneControlsLocked]);

  const handleViewportMotionFrozen = useCallback((frozen: boolean) => {
    setViewportMotionFrozen(frozen);
    if (frozen || navigationPhaseRef.current !== "settling") return;
    navigationPhaseRef.current = "idle";
    setContinuousTransitionActive(false);
    setSceneContinuityView(undefined);
    const dispatchSettled = pendingContinuitySettleRef.current;
    pendingContinuitySettleRef.current = null;
    dispatchSettled?.();
  }, []);

  const sceneTitle = useMemo(() => {
    if (!scene) return "Opening the world";
    return meaningVisible && scene.translation ? `${scene.title} · ${scene.translation}` : scene.title;
  }, [meaningVisible, scene]);

  const setMeaningPreference = useCallback((visible: boolean) => {
    setMeaningVisible(visible);
    window.localStorage.setItem(MEANING_KEY, String(visible));
  }, []);

  const recordEncounteredLabels = useCallback((labels: readonly Label[]) => {
    if (labels.length === 0) return;
    const next = recordDiscoveredLabels(discoveredEntriesRef.current, labels);
    const serialized = serializeDiscoveredEntries(next);
    discoveredEntriesRef.current = next;
    try {
      window.localStorage.setItem(DISCOVERED_KEY, serialized);
    } catch {
      // The in-memory count remains truthful when storage is unavailable.
    }
    setDiscoveredCount(next.size);
  }, []);

  const recordEncounteredLabel = useCallback((label: Label) => {
    recordEncounteredLabels([label]);
  }, [recordEncounteredLabels]);

  const recordViewportSnapshot = useCallback((snapshot: SceneViewportSnapshot) => {
    activeViewportSnapshotRef.current = snapshot;
  }, []);

  const openLexicalOverview = useCallback((source: "pointer" | "keyboard") => {
    if (semanticReturnTimerRef.current !== null) {
      window.clearTimeout(semanticReturnTimerRef.current);
      semanticReturnTimerRef.current = null;
    }
    setSceneWordIndexOpen(false);
    setSceneWordIndexQuery("");
    setLexicalWorldEntry({ mode: "global" });
    setSemanticTransitionState("open");
    setLexicalWorldInitialFocus(source === "keyboard" ? "search" : "auto");
    setLexicalWorldOpen(true);
  }, []);

  const openLexicalFromScene = useCallback((
    label: Label | null,
    source: "zoom" | "pointer" | "keyboard",
  ) => {
    const realmId = label?.lexemeId
      ? SPATIAL_REALM_BY_LEXEME[label.lexemeId]
      : undefined;
    if (semanticReturnTimerRef.current !== null) {
      window.clearTimeout(semanticReturnTimerRef.current);
      semanticReturnTimerRef.current = null;
    }
    const snapshot = source === "zoom" && activeViewportSnapshotRef.current
      ? {
          ...activeViewportSnapshotRef.current,
          camera: { ...activeViewportSnapshotRef.current.camera },
        }
      : undefined;
    setLexicalWorldEntry({
      mode: source === "zoom" ? "spatial-overscroll" : "spatial-bridge",
      ...(realmId ? { realmId } : {}),
      ...(label ? { word: label.word } : {}),
      ...(snapshot ? { returnSnapshot: snapshot } : {}),
    });
    setSemanticTransitionState("open");
    setLexicalWorldInitialFocus(source === "keyboard" ? "dialog" : "auto");
    setLexicalWorldOpen(true);
  }, []);

  const closeLexicalWorld = useCallback(() => {
    if (semanticReturnTimerRef.current !== null) {
      window.clearTimeout(semanticReturnTimerRef.current);
      semanticReturnTimerRef.current = null;
    }
    setLexicalWorldOpen(false);
    setLexicalWorldEntry(null);
    setSemanticTransitionState("idle");
  }, []);

  const returnToSpatialScene = useCallback(() => {
    const returnSnapshot = lexicalWorldEntry?.returnSnapshot;
    if (
      !lexicalWorldOpen
      || semanticTransitionState !== "open"
      || lexicalWorldEntry?.mode !== "spatial-overscroll"
      || !returnSnapshot
      || returnSnapshot.sceneId !== scene?.id
    ) return;

    // SceneViewport remains mounted and inert below the dialog, so its exact
    // max-scale camera and decoded scene cache survive the semantic excursion.
    // Closing therefore reveals the captured frame without a remount or jump.
    setSemanticTransitionState("returning");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    semanticReturnTimerRef.current = window.setTimeout(() => {
      semanticReturnTimerRef.current = null;
      setLexicalWorldOpen(false);
      setLexicalWorldEntry(null);
      setSemanticTransitionState("idle");
    }, reducedMotion ? 0 : 180);
  }, [lexicalWorldEntry, lexicalWorldOpen, scene?.id, semanticTransitionState]);

  const selectedLabelRealmId = selectedLabel?.lexemeId
    ? SPATIAL_REALM_BY_LEXEME[selectedLabel.lexemeId]
    : undefined;

  return (
    <main
      className="world-app"
      data-testid="world-app"
      data-scene-id={scene?.id ?? "loading"}
      data-scene-loading={String(loading)}
      data-transition-state={transitionState}
      data-transition-cache={transitionCache}
      data-semantic-entry-mode={lexicalWorldOpen ? lexicalWorldEntry?.mode ?? "global" : "closed"}
      data-semantic-transition-state={semanticTransitionState}
      data-semantic-return-scene={lexicalWorldEntry?.returnSnapshot?.sceneId}
      aria-busy={loading}
    >
      <header
        className="app-header"
        inert={lexicalWorldOpen ? true : undefined}
        aria-hidden={lexicalWorldOpen ? true : undefined}
      >
        <a href="#world" className="brand" aria-label="HelloWords home">
          <span className="brand-mark">H</span>
          <span><strong>HelloWords</strong><small>词境</small></span>
        </a>
        <nav className="breadcrumbs" aria-label="Scene breadcrumb">
          {history.map((item, index) => (
            <span key={`${item.id}-${index}`}>
              {index > 0 ? <i aria-hidden="true">/</i> : null}
              <button
                type="button"
                onClick={(event) => goToBreadcrumb(index, event.detail === 0 ? "keyboard" : "pointer")}
                disabled={sceneControlsLocked || index === history.length - 1}
              >
                {item.title}
              </button>
            </span>
          ))}
        </nav>
        <div className="header-actions">
          <span className="discovery-count" aria-label={`已遇见 ${discoveredCount} 个词`}>
            <i aria-hidden="true" /><span>已遇见</span><b>{discoveredCount}</b>
          </span>
          <button
            type="button"
            className="scene-word-index-toggle"
            data-testid="scene-word-index-toggle"
            aria-expanded={sceneWordIndexOpen}
            aria-controls="scene-word-index"
            aria-label={`搜索当前场景的 ${scene?.labels.length ?? 0} 个词`}
            disabled={sceneControlsLocked || !scene}
            onClick={() => setSceneWordIndexOpen((open) => !open)}
          >
            <span aria-hidden="true">⌕</span>
            <span>本景词</span>
          </button>
          <button
            type="button"
            className="atlas-button"
            onClick={(event) => openLexicalOverview(event.detail === 0 ? "keyboard" : "pointer")}
            aria-label="打开 10 个视觉领域、758 个分层入口和 10,000 个词"
            aria-haspopup="dialog"
            aria-expanded={lexicalWorldOpen}
            disabled={sceneControlsLocked}
          >
            <span aria-hidden="true">万</span>
            <span className="atlas-button-label atlas-button-label--desktop">10 领域 · 10,000 词</span>
            <span className="atlas-button-label atlas-button-label--mobile">10,000 词</span>
          </button>
          <button
            type="button"
            className="meaning-toggle"
            data-testid="meaning-toggle"
            aria-pressed={meaningVisible}
            disabled={sceneControlsLocked}
            onClick={() => setMeaningPreference(!meaningVisible)}
          >
            <span className="toggle-track"><span /></span>
            释义
          </button>
        </div>
      </header>

      <section
        id="world"
        className="world-stage"
        inert={lexicalWorldOpen ? true : undefined}
        aria-hidden={lexicalWorldOpen ? true : undefined}
      >
        <aside
          className="scene-minimap"
          data-testid="scene-minimap"
          data-scene-id={scene?.id ?? "loading"}
          data-child-count={scene?.portals.length ?? 0}
          data-terminal={String(Boolean(scene && scene.portals.length === 0))}
          data-continuous={sceneContinuityView ? "true" : undefined}
          aria-label="场景小地图"
        >
          <div className="scene-minimap__heading">
            <span aria-hidden="true">{String(history.length).padStart(2, "0")}</span>
            <h1
              key={`title-${scene?.id ?? "loading"}`}
              ref={sceneHeadingRef}
              data-testid="scene-minimap-title"
              tabIndex={-1}
            >
              {sceneTitle}
            </h1>
          </div>
          {scene?.subtitle ? (
            <p className="scene-minimap__subtitle" data-testid="scene-minimap-subtitle">
              {scene.subtitle}
            </p>
          ) : null}
          {rootAtlasDistricts.length > 0 ? (
            <nav
              className="scene-minimap__districts"
              data-testid="scene-minimap-districts"
              data-mode={selectedAtlasDistrict ? "zones" : "districts"}
              aria-label={selectedAtlasDistrict ? `${selectedAtlasDistrict.label} detail zones` : "Atlas districts"}
            >
              {selectedAtlasDistrict ? (
                <>
                  <button
                    type="button"
                    className="scene-minimap__district-back"
                    data-testid="scene-minimap-district-back"
                    data-navigation="district-list"
                    onClick={() => {
                      setSelectedAtlasDistrictId(null);
                      setFocusedAtlasZoneId(null);
                    }}
                    disabled={sceneControlsLocked}
                    aria-label="返回六个大区"
                  >
                    <span aria-hidden="true">‹</span>
                    <b>{selectedAtlasDistrict.label}</b>
                  </button>
                  {selectedAtlasDistrict.zones.map((zone) => (
                    <button
                      key={zone.id}
                      type="button"
                      data-testid="scene-minimap-zone"
                      data-zone-id={zone.id}
                      data-navigation="detail-zone-focus"
                      data-focus-x={zone.focusX}
                      data-focus-y={zone.focusY}
                      data-target-scale={zone.targetScale}
                      data-label-count={zone.labelCount}
                      data-active={focusedAtlasZoneId === zone.id ? "true" : "false"}
                      aria-current={focusedAtlasZoneId === zone.id ? "location" : undefined}
                      onClick={(event) => {
                        focusAtlasZone(zone, event.detail === 0 ? "keyboard" : "pointer");
                      }}
                      disabled={sceneControlsLocked}
                      aria-label={`聚焦 ${zone.title}，${zone.labelCount} 个词`}
                    >
                      <span aria-hidden="true" />
                      <b>{zone.title}</b>
                      <small>{zone.labelCount}</small>
                    </button>
                  ))}
                </>
              ) : rootAtlasDistricts.map((district, index) => (
                <button
                  key={district.id}
                  type="button"
                  data-testid="scene-minimap-district"
                  data-district-id={district.id}
                  data-district-index={index}
                  data-navigation="detail-zone-focus"
                  data-focus-x={district.focusX}
                  data-focus-y={district.focusY}
                  data-target-scale={district.targetScale}
                  data-label-count={district.labelCount}
                  data-zone-count={district.zoneCount}
                  onClick={(event) => {
                    focusAtlasDistrict(district, event.detail === 0 ? "keyboard" : "pointer");
                  }}
                  disabled={sceneControlsLocked}
                  aria-label={`聚焦 ${district.label}（${district.translation}），${district.labelCount} 个词，${district.zoneCount} 个区域`}
                >
                  <span aria-hidden="true" />
                  <b>{district.label}</b>
                  <small>{district.labelCount}</small>
                </button>
              ))}
            </nav>
          ) : sceneDetailZones.length > 0 ? (
            <nav
              className="scene-minimap__districts scene-minimap__scene-zones"
              data-testid="scene-minimap-scene-zones"
              data-mode="zones"
              aria-label={`${scene?.title ?? "当前场景"} detail zones`}
            >
              {sceneDetailZones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  data-testid="scene-minimap-zone"
                  data-zone-id={zone.id}
                  data-navigation="detail-zone-focus"
                  data-focus-x={zone.focusX}
                  data-focus-y={zone.focusY}
                  data-target-scale={zone.targetScale}
                  data-label-count={zone.labelCount}
                  data-active={focusedSceneDetailZoneId === zone.id ? "true" : "false"}
                  aria-current={focusedSceneDetailZoneId === zone.id ? "location" : undefined}
                  onClick={(event) => {
                    focusSceneDetailZone(zone, event.detail === 0 ? "keyboard" : "pointer");
                  }}
                  disabled={sceneControlsLocked}
                  aria-label={`聚焦 ${zone.title}，${zone.labelCount} 个词`}
                >
                  <span aria-hidden="true" />
                  <b>{zone.title}</b>
                  <small>{zone.labelCount}</small>
                </button>
              ))}
            </nav>
          ) : null}
          <nav
            className="scene-minimap__path"
            data-testid="scene-minimap-path"
            aria-label="Current scene path"
          >
            {history.map((item, index) => {
              const current = index === history.length - 1;
              return (
                <span key={`map-${item.id}-${index}`}>
                  {index > 0 ? <i aria-hidden="true">›</i> : null}
                  {current ? (
                    <em
                      data-testid="scene-minimap-breadcrumb"
                      data-scene-id={item.id}
                      data-current="true"
                      aria-current="page"
                    >
                      {item.title}
                    </em>
                  ) : (
                    <button
                      type="button"
                      data-testid="scene-minimap-breadcrumb"
                      data-scene-id={item.id}
                      data-current="false"
                      onClick={(event) => goToBreadcrumb(
                        index,
                        event.detail === 0 ? "keyboard" : "pointer",
                      )}
                      disabled={sceneControlsLocked}
                    >
                      {item.title}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
          <div
            className="scene-minimap__children"
            data-testid="scene-minimap-children"
            data-child-count={scene?.portals.length ?? 0}
            aria-label="Direct child scenes"
          >
            {scene?.portals.length ? scene.portals.map((portal) => {
              const targetTitle = sceneTitles[portal.childSceneId] ?? portal.label;
              return (
                <button
                  key={portal.id}
                  type="button"
                  data-testid="scene-minimap-child"
                  data-portal-id={portal.id}
                  data-target-scene={portal.childSceneId}
                  data-navigation="portal-continuity"
                  onPointerEnter={() => { void prefetchPreferredScene(portal.childSceneId); }}
                  onFocus={() => { void prefetchPreferredScene(portal.childSceneId); }}
                  onClick={(event) => enterPortalFromMinimap(
                    portal,
                    event.detail === 0 ? "keyboard" : "pointer",
                  )}
                  disabled={sceneControlsLocked}
                  aria-label={`进入 ${targetTitle}`}
                >
                  <span aria-hidden="true">↘</span>
                  <b>{targetTitle}</b>
                </button>
              );
            }) : scene ? (
              <span className="scene-minimap__terminal" data-testid="scene-minimap-terminal">
                <i aria-hidden="true" />已到最深层
              </span>
            ) : null}
            {scene ? (
              <button
                type="button"
                className="scene-minimap__lexical"
                data-testid="scene-minimap-lexical"
                onClick={(event) => openLexicalOverview(event.detail === 0 ? "keyboard" : "pointer")}
                disabled={sceneControlsLocked}
                aria-label="打开由 10 个彩色领域组成的 10,000 词语义大图"
              >
                <span aria-hidden="true" />万词大图 <b>10,000</b>
              </button>
            ) : null}
          </div>
        </aside>
        {scene && sceneWordIndexOpen ? (
          <aside
            id="scene-word-index"
            className="scene-word-index"
            data-testid="scene-word-index"
            role="dialog"
            aria-label={`搜索 ${scene.title} 的场景词`}
          >
            <div className="scene-word-index__heading">
              <div>
                <span className="scene-word-index__eyebrow">SCENE WORD FINDER</span>
                <h2>{scene.title}</h2>
              </div>
              <button
                type="button"
                className="scene-word-index__close"
                data-testid="scene-word-index-close"
                onClick={() => {
                  setSceneWordIndexOpen(false);
                  setSceneWordIndexQuery("");
                }}
                aria-label="关闭场景词索引"
              >
                ×
              </button>
            </div>
            <label className="scene-word-index__search">
              <span aria-hidden="true">⌕</span>
              <input
                ref={sceneWordIndexInputRef}
                type="search"
                value={sceneWordIndexQuery}
                onChange={(event) => setSceneWordIndexQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSceneWordIndexOpen(false);
                    setSceneWordIndexQuery("");
                  }
                }}
                placeholder="搜索英文单词或中文释义"
                aria-label="搜索当前场景的英文单词或中文释义"
              />
            </label>
            <p className="scene-word-index__summary" data-testid="scene-word-index-summary">
              {sceneWordIndexQuery.trim()
                ? `${sceneWordIndexMatches.total} 个匹配 · 显示前 ${sceneWordIndexMatches.labels.length}`
                : `本场景 ${scene.labels.length} 个词 · 输入查找并定位`}
            </p>
            <div className="scene-word-index__results" data-testid="scene-word-index-results">
              {sceneWordIndexMatches.labels.length > 0 ? sceneWordIndexMatches.labels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  className="scene-word-index__result"
                  data-testid="scene-word-index-result"
                  data-label-id={label.id}
                  data-word={label.word}
                  onClick={(event) => {
                    focusSceneLabelFromIndex(label, event.detail === 0 ? "keyboard" : "pointer");
                  }}
                  aria-label={`${label.word}，${label.translation}`}
                >
                  <strong>{label.word}</strong>
                  <span>{label.translation}</span>
                </button>
              )) : (
                <p className="scene-word-index__empty">没有匹配的场景词</p>
              )}
            </div>
          </aside>
        ) : null}
        {scene ? (
          <>
            {outgoingScene ? (
              <SceneViewport
                key={outgoingScene.id}
                scene={outgoingScene}
                meaningVisible={meaningVisible}
                selectedLabelId={null}
                portalTargetTitles={sceneTitles}
                transitionPhase="outgoing"
                interactionLocked
                onCommitScene={() => false}
                onEnterScene={async () => false}
                onExitScene={() => undefined}
                onLabelsEncountered={() => undefined}
                onLabelEncountered={() => undefined}
                onSelectWord={() => undefined}
                onExploreSemanticPlane={() => undefined}
                onPrefetchScene={() => undefined}
                atlasDistricts={outgoingScene.id === "world-map" ? rootAtlasDistricts : undefined}
              />
            ) : null}
            <SceneViewport
              key={scene.id}
              scene={scene}
              meaningVisible={meaningVisible}
              selectedLabelId={selectedLabel?.id ?? null}
              portalTargetTitles={sceneTitles}
              transitionPhase={outgoingScene ? "incoming" : "active"}
              interactionLocked={sceneControlsLocked}
              onCommitScene={beginSceneCommit}
              onEnterScene={(sceneId, source) => navigate(sceneId, "forward", source)}
              onExitScene={() => goBack("zoom")}
              onLabelsEncountered={recordEncounteredLabels}
              onLabelEncountered={recordEncounteredLabel}
              onSelectWord={setSelectedLabel}
              onExploreSemanticPlane={openLexicalFromScene}
              onPrefetchScene={prefetchPreferredScene}
              initialView={sceneContinuityView}
              onCameraFrame={recordViewportSnapshot}
              onMotionFrozenChange={handleViewportMotionFrozen}
              onPortalNavigatorReady={registerPortalNavigator}
              onFocusTargetNavigatorReady={registerFocusTargetNavigator}
              atlasDistricts={scene.id === "world-map" ? rootAtlasDistricts : undefined}
              focusedDetailZoneId={scene?.id === "world-map" ? focusedAtlasZoneId : focusedSceneDetailZoneId}
              wordIndexOpen={sceneWordIndexOpen}
            />
          </>
        ) : (
          <div className="opening-state"><span /><p>正在展开词汇世界…</p></div>
        )}
        {loading && scene && transitionState === "loading" && transitionCache === "cold" ? (
          <div className="loading-pill" role="status">
            {transitionTarget ? `正在展开 ${transitionTarget} 的细节…` : "正在展开细节…"}
          </div>
        ) : null}
        {transitionState !== "idle" && transitionTarget && !continuousTransitionActive ? (
          <div className="scene-transition-veil" data-state={transitionState} aria-hidden="true">
            <span />
            <strong>{transitionTarget}</strong>
          </div>
        ) : null}
        {loadError ? <div className="error-pill" role="alert">{loadError}</div> : null}
        {history.length > 1 ? (
          <button
            type="button"
            className="back-button"
            onClick={(event) => goBack(event.detail === 0 ? "keyboard" : "pointer")}
            disabled={sceneControlsLocked}
          >
            ← 返回上一层
          </button>
        ) : null}
        {selectedLabel ? (
          <aside className="word-dock" aria-label={`${selectedLabel.word} word details`}>
            <button
              type="button"
              className="word-dock-close"
              onClick={() => setSelectedLabel(null)}
              aria-label="关闭单词卡"
            >
              ×
            </button>
            <span className="eyebrow">WORD ENCOUNTER</span>
            <strong>{selectedLabel.word}</strong>
            <p>{selectedLabel.translation}</p>
            <button
              type="button"
              className="listen-button"
              onClick={() => {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(selectedLabel.word);
                utterance.lang = "en-US";
                utterance.rate = 0.86;
                window.speechSynthesis.speak(utterance);
              }}
            >
              <span aria-hidden="true">◖))</span> 听发音
            </button>
            {selectedLabelRealmId ? (
              <button
                type="button"
                className="lexical-bridge-button"
                onClick={() => {
                  openLexicalFromScene(selectedLabel, "keyboard");
                }}
                aria-label={`从实景词 ${selectedLabel.word} 进入万词世界的相关语义领域`}
              >
                <span aria-hidden="true">↗</span>
                从这个实景词进入相关词域
              </button>
            ) : null}
          </aside>
        ) : null}
      </section>

      <div
        className="scene-announcement sr-only"
        aria-live="polite"
        aria-hidden={lexicalWorldOpen ? true : undefined}
      >
        {announcedSceneTitle ? `Entered ${announcedSceneTitle}` : ""}
      </div>
      <LexicalWorld
        open={lexicalWorldOpen}
        onClose={closeLexicalWorld}
        onZoomOutBoundary={lexicalWorldEntry?.mode === "spatial-overscroll"
          && Boolean(lexicalWorldEntry.returnSnapshot)
          && semanticTransitionState === "open"
          ? returnToSpatialScene
          : undefined}
        entryMode={lexicalWorldEntry?.mode ?? "global"}
        transitionState={semanticTransitionState === "returning" ? "returning" : "open"}
        showMeanings={meaningVisible}
        onShowMeaningsChange={setMeaningPreference}
        initialFocus={lexicalWorldInitialFocus}
        initialRealmId={lexicalWorldEntry?.realmId}
        spatialEntryWord={lexicalWorldEntry?.word}
      />
    </main>
  );
}
