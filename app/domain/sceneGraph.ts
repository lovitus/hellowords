import { assertCamera } from "./camera";
import type { Label, Portal, Scene } from "./types";

export type ValidationSeverity = "error" | "warning";

export interface SceneGraphIssue {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface SceneGraphValidation {
  readonly valid: boolean;
  readonly issues: readonly SceneGraphIssue[];
}

export interface SceneGraphValidationOptions {
  readonly requireSingleRoot?: boolean;
  readonly requirePortalForEveryChild?: boolean;
  readonly allowOutOfBoundsAnchors?: boolean;
}

const defaults: Required<SceneGraphValidationOptions> = {
  requireSingleRoot: true,
  requirePortalForEveryChild: true,
  allowOutOfBoundsAnchors: false,
};

/** Validates graph topology and all values consumed by the viewer. */
export function validateSceneGraph(
  scenes: readonly Scene[],
  suppliedOptions: SceneGraphValidationOptions = {},
): SceneGraphValidation {
  const options = { ...defaults, ...suppliedOptions };
  const issues: SceneGraphIssue[] = [];
  const sceneById = new Map<string, Scene>();

  for (const [index, scene] of scenes.entries()) {
    const path = `scenes[${index}]`;
    if (!nonEmpty(scene.id)) {
      error(issues, "scene.empty-id", `${path}.id`, "Scene id cannot be empty");
    } else if (sceneById.has(scene.id)) {
      error(
        issues,
        "scene.duplicate-id",
        `${path}.id`,
        `Duplicate scene id: ${scene.id}`,
      );
    } else {
      sceneById.set(scene.id, scene);
    }
    requireText(issues, scene.title, `${path}.title`, "scene.empty-title");
    requireText(issues, scene.asset, `${path}.asset`, "scene.empty-asset");
    requirePositive(issues, scene.width, `${path}.width`);
    requirePositive(issues, scene.height, `${path}.height`);
    validateCamera(issues, scene.initialCamera, `${path}.initialCamera`);
    validateLabels(issues, scene, path, options);
    validatePortals(issues, scene, path, options);
  }

  const roots = scenes.filter((scene) => scene.parentId == null);
  if (options.requireSingleRoot && roots.length !== 1) {
    error(
      issues,
      "graph.root-count",
      "scenes",
      `Expected exactly one root scene, found ${roots.length}`,
    );
  }

  const portalParentsByChild = new Map<string, Set<string>>();
  for (const [index, scene] of scenes.entries()) {
    if (scene.parentId != null && !sceneById.has(scene.parentId)) {
      error(
        issues,
        "scene.missing-parent",
        `scenes[${index}].parentId`,
        `Unknown parent scene: ${scene.parentId}`,
      );
    }
    for (const [portalIndex, portal] of scene.portals.entries()) {
      const target = sceneById.get(portal.childSceneId);
      const portalPath = `scenes[${index}].portals[${portalIndex}]`;
      if (!target) {
        error(
          issues,
          "portal.missing-child",
          `${portalPath}.childSceneId`,
          `Unknown child scene: ${portal.childSceneId}`,
        );
        continue;
      }
      if (target.id === scene.id) {
        error(
          issues,
          "portal.self-reference",
          `${portalPath}.childSceneId`,
          "A portal cannot target its own scene",
        );
      }
      if (target.parentId !== scene.id) {
        error(
          issues,
          "portal.parent-mismatch",
          `${portalPath}.childSceneId`,
          `Child ${target.id} declares parent ${target.parentId ?? "<none>"}, not ${scene.id}`,
        );
      }
      const parents = portalParentsByChild.get(target.id) ?? new Set<string>();
      parents.add(scene.id);
      portalParentsByChild.set(target.id, parents);
    }
  }

  if (options.requirePortalForEveryChild) {
    for (const [index, scene] of scenes.entries()) {
      if (scene.parentId && !portalParentsByChild.get(scene.id)?.has(scene.parentId)) {
        error(
          issues,
          "scene.missing-parent-portal",
          `scenes[${index}].parentId`,
          `Parent ${scene.parentId} has no portal to child ${scene.id}`,
        );
      }
    }
  }

  findParentCycles(scenes, sceneById, issues);
  findUnreachableScenes(roots, sceneById, issues);

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

export function assertValidSceneGraph(
  scenes: readonly Scene[],
  options?: SceneGraphValidationOptions,
): void {
  const result = validateSceneGraph(scenes, options);
  if (result.valid) return;
  const detail = result.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid scene graph:\n${detail}`);
}

function validateLabels(
  issues: SceneGraphIssue[],
  scene: Scene,
  scenePath: string,
  options: Required<SceneGraphValidationOptions>,
): void {
  const ids = new Set<string>();
  for (const [index, label] of scene.labels.entries()) {
    const path = `${scenePath}.labels[${index}]`;
    validateUniqueId(issues, label.id, ids, `${path}.id`, "label");
    requireText(issues, label.word, `${path}.word`, "label.empty-word");
    requireFinite(issues, label.x, `${path}.x`);
    requireFinite(issues, label.y, `${path}.y`);
    requireFinite(issues, label.priority, `${path}.priority`);
    if (label.minScale !== undefined) {
      requirePositive(issues, label.minScale, `${path}.minScale`);
    }
    if (
      label.minLevel !== undefined &&
      label.minLevel !== 0 &&
      label.minLevel !== 1 &&
      label.minLevel !== 2 &&
      label.minLevel !== 3 &&
      label.minLevel !== 4
    ) {
      error(
        issues,
        "label.invalid-level",
        `${path}.minLevel`,
        "minLevel must be an integer from 0 through 4",
      );
    }
    if (label.maxScale !== undefined) {
      requirePositive(issues, label.maxScale, `${path}.maxScale`);
      if (label.minScale !== undefined && label.maxScale < label.minScale) {
        error(
          issues,
          "label.invalid-scale-range",
          `${path}.maxScale`,
          "maxScale cannot be lower than minScale",
        );
      }
    }
    if (
      !options.allowOutOfBoundsAnchors &&
      (!inRange(label.x, 0, scene.width) || !inRange(label.y, 0, scene.height))
    ) {
      error(
        issues,
        "label.out-of-bounds",
        path,
        "Label anchor is outside the scene bounds",
      );
    }
  }
}

function validatePortals(
  issues: SceneGraphIssue[],
  scene: Scene,
  scenePath: string,
  options: Required<SceneGraphValidationOptions>,
): void {
  const ids = new Set<string>();
  for (const [index, portal] of scene.portals.entries()) {
    const path = `${scenePath}.portals[${index}]`;
    validateUniqueId(issues, portal.id, ids, `${path}.id`, "portal");
    requireText(issues, portal.label, `${path}.label`, "portal.empty-label");
    requireText(
      issues,
      portal.childSceneId,
      `${path}.childSceneId`,
      "portal.empty-child",
    );
    for (const key of ["x", "y"] as const) {
      requireFinite(issues, portal[key], `${path}.${key}`);
    }
    for (const key of ["width", "height"] as const) {
      requirePositive(issues, portal[key], `${path}.${key}`);
    }
    for (const key of ["enterScale", "exitScale"] as const) {
      if (portal[key] !== undefined) {
        requirePositive(issues, portal[key], `${path}.${key}`);
      }
    }
    if (
      portal.enterScale !== undefined &&
      portal.exitScale !== undefined &&
      portal.exitScale >= portal.enterScale
    ) {
      error(
        issues,
        "portal.invalid-scale-range",
        path,
        "exitScale must be lower than enterScale",
      );
    }
    if (portal.entryCamera) {
      validateCamera(issues, portal.entryCamera, `${path}.entryCamera`);
    }
    if (
      !options.allowOutOfBoundsAnchors &&
      (portal.x < 0 ||
        portal.y < 0 ||
        portal.x + portal.width > scene.width ||
        portal.y + portal.height > scene.height)
    ) {
      error(
        issues,
        "portal.out-of-bounds",
        path,
        "Portal rectangle is outside the scene bounds",
      );
    }
  }
}

function findParentCycles(
  scenes: readonly Scene[],
  sceneById: ReadonlyMap<string, Scene>,
  issues: SceneGraphIssue[],
): void {
  const done = new Set<string>();
  for (const scene of scenes) {
    if (done.has(scene.id)) continue;
    const path: string[] = [];
    const positions = new Map<string, number>();
    let cursor: Scene | undefined = scene;
    while (cursor && !done.has(cursor.id)) {
      const seenAt = positions.get(cursor.id);
      if (seenAt !== undefined) {
        const cycle = [...path.slice(seenAt), cursor.id].join(" -> ");
        error(
          issues,
          "graph.parent-cycle",
          `scene:${cursor.id}`,
          `Parent cycle detected: ${cycle}`,
        );
        break;
      }
      positions.set(cursor.id, path.length);
      path.push(cursor.id);
      cursor = cursor.parentId ? sceneById.get(cursor.parentId) : undefined;
    }
    path.forEach((id) => done.add(id));
  }
}

function findUnreachableScenes(
  roots: readonly Scene[],
  sceneById: ReadonlyMap<string, Scene>,
  issues: SceneGraphIssue[],
): void {
  if (roots.length === 0) return;
  const reachable = new Set<string>();
  const queue = roots.map((scene) => scene.id);
  while (queue.length > 0) {
    const id = queue.pop();
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    const scene = sceneById.get(id);
    scene?.portals.forEach((portal) => queue.push(portal.childSceneId));
  }
  for (const scene of sceneById.values()) {
    if (!reachable.has(scene.id)) {
      error(
        issues,
        "graph.unreachable-scene",
        `scene:${scene.id}`,
        `Scene ${scene.id} is unreachable from a root portal`,
      );
    }
  }
}

function validateCamera(
  issues: SceneGraphIssue[],
  camera: Scene["initialCamera"] | Portal["entryCamera"],
  path: string,
): void {
  if (!camera) return;
  try {
    assertCamera(camera);
  } catch (cause) {
    error(
      issues,
      "camera.invalid",
      path,
      cause instanceof Error ? cause.message : "Invalid camera",
    );
  }
}

function validateUniqueId(
  issues: SceneGraphIssue[],
  id: string,
  ids: Set<string>,
  path: string,
  kind: "label" | "portal",
): void {
  if (!nonEmpty(id)) {
    error(issues, `${kind}.empty-id`, path, `${kind} id cannot be empty`);
  } else if (ids.has(id)) {
    error(issues, `${kind}.duplicate-id`, path, `Duplicate ${kind} id: ${id}`);
  } else {
    ids.add(id);
  }
}

function requireText(
  issues: SceneGraphIssue[],
  value: string,
  path: string,
  code: string,
): void {
  if (!nonEmpty(value)) error(issues, code, path, "Value cannot be empty");
}

function requireFinite(
  issues: SceneGraphIssue[],
  value: number,
  path: string,
): void {
  if (!Number.isFinite(value)) {
    error(issues, "number.not-finite", path, "Value must be finite");
  }
}

function requirePositive(
  issues: SceneGraphIssue[],
  value: number,
  path: string,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    error(issues, "number.not-positive", path, "Value must be positive and finite");
  }
}

function error(
  issues: SceneGraphIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ severity: "error", code, path, message });
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Narrows imports for callers that only need the compatible JSON shapes. */
export type { Label, Portal, Scene };
