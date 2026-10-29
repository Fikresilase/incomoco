import type {
  UniversalAction,
  UniversalCamera,
  UniversalObject,
  UniversalTransform,
  VisualScene,
} from './types';

export type RenderObject = {
  id: number;
  element: UniversalObject['element'] | 'equation_part';
  value?: unknown;
  position: [number, number];
  rawPosition: [number, number, number];
  depth: number;
  coordinate?: boolean;
  color: string;
  style: 'filled' | 'hollow' | 'fill_surface' | 'fill_down';
  size: [number, number];
  z_index: number;
  thickness: number;
  opacity: number;
  creationProgress: number;
  number_of_ticks?: [number, number];
  parent_id?: number;
};


export type SceneSnapshot = {
  camera: Required<UniversalCamera>;
  objects: RenderObject[];
};

type SceneState = {
  camera: Required<UniversalCamera>;
  objects: Map<number, RenderObject>;
  bounds: CoordinateBounds;
};

type TimelineStep = UniversalAction[];
type MorphPath = {
  closed: boolean;
  points: [number, number][];
};

type CoordinateBounds = {
  x: number;
  y: number;
};

const defaultObject = {
  color: '#FFFFFF',
  opacity: 1,
  size: [8, 8] as [number, number],
  style: 'hollow' as const,
  thickness: 2,
  z_index: 1,
};

const defaultCamera = {
  position: [0, 0] as [number, number],
  zoom: 1,
};

export const snapshotScene = (scene: VisualScene, progress: number): SceneSnapshot => {
  const actions = Array.isArray(scene.animation) ? scene.animation : [];
  const bounds = coordinateBounds(scene.aspect_ratio);
  if (!actions.length) {
    return { camera: normalizeCamera(scene.camera, bounds), objects: [] };
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const timeline = buildTimeline(actions);
  const scaled = clampedProgress * timeline.length;
  const activeIndex = Math.min(timeline.length - 1, Math.floor(scaled));
  const localProgress = activeIndex === timeline.length - 1 && clampedProgress >= 1 ? 1 : scaled - activeIndex;
  const state: SceneState = { camera: normalizeCamera(scene.camera, bounds), objects: new Map(), bounds };

  timeline.forEach((step, index) => applyTimelineStep(state, step, index, activeIndex, localProgress));

  return {
    camera: state.camera,
    objects: [...state.objects.values()].filter((object) => object.opacity > 0.01),
  };
};

const buildTimeline = (actions: UniversalAction[]): TimelineStep[] => actions.map((action) => [action]);

const applyTimelineStep = (
  state: SceneState,
  step: TimelineStep,
  index: number,
  activeIndex: number,
  localProgress: number
) => {
  const phase = index < activeIndex ? 1 : index === activeIndex ? localProgress : 0;
  if (phase <= 0) {
    return;
  }
  step.forEach((action) => applyAction(state, action, phase));
};

const applyAction = (state: SceneState, action: UniversalAction, phase: number) => {
  if ('create' in action) {
    normalizeArray(action.create).forEach((object) => createObjects(state, object, phase));
    return;
  }

  if ('transform' in action) {
    normalizeArray(action.transform).forEach((transform) => transformObjects(state, transform, phase));
    return;
  }

  if ('camera' in action) {
    transformCamera(state, action.camera, phase);
    return;
  }

  if ('vanish' in action) {
    vanishObjects(state, action.vanish.id, phase);
  }
};

const createObjects = (state: SceneState, object: UniversalObject, phase: number) => {
  const ids = normalizeIds(object.id);
  const positions = layoutPositions(object, ids.length, state.bounds);

  ids.forEach((id, index) => {
    const color = Array.isArray(object.color) ? object.color[index] ?? object.color[0] : object.color;
    const renderObject = normalizeObject(
      {
        ...object,
        id: [id],
        color,
        position: positions[index],
        opacity: (object.opacity ?? defaultObject.opacity) * easeOut(phase),
      },
      state.bounds
    );
    renderObject.creationProgress = easeOut(phase);
    state.objects.set(id, renderObject);

    if (object.element === 'equation' && typeof object.value === 'object' && object.value && 'child_items' in object.value) {
      createEquationParts(state, renderObject, object.value as { child_items?: Array<{ id: number; text: string }> });
    }
  });
};

const createEquationParts = (
  state: SceneState,
  parent: RenderObject,
  value: { child_items?: Array<{ id: number; text: string }> }
) => {
  const children = value.child_items ?? [];
  if (!children.length) {
    return;
  }
  const startX = parent.position[0] - (children.length - 1) * 5;
  children.forEach((child, index) => {
    state.objects.set(child.id, {
      ...parent,
      id: child.id,
      element: 'equation_part',
      value: child.text,
      parent_id: parent.id,
      position: [startX + index * 10, parent.position[1]],
      size: [8, parent.size[1]],
      z_index: parent.z_index + 1,
    });
  });
};


const transformObjects = (state: SceneState, transform: UniversalTransform, phase: number) => {
  const ids = normalizeIds(transform.id);
  const selected = ids.map((id) => state.objects.get(id)).filter(Boolean) as RenderObject[];
  if (!selected.length) {
    return;
  }

  const selectedIds = new Set(ids);
  const groupDelta = transform.position && ids.length > 1 ? subtract(transform.position, centerOf(selected)) : null;

  selected.forEach((object) => {
    const next = { ...object };
    let rawPositionDelta: [number, number, number] | null = null;
    if (transform.position) {
      const targetPosition = groupDelta ? add(object.position, groupDelta) : transform.position;
      const nextRaw = lerpPoint3D(object.rawPosition, clampPoint3D(normalizePoint3D(targetPosition), state.bounds), smooth(phase));
      rawPositionDelta = subtract3(nextRaw, object.rawPosition);
      if (object.element === 'polygon') {
        next.value = translatePolygonValue(object.value, rawPositionDelta);
      }
      next.rawPosition = nextRaw;
      const projected = projectPoint(nextRaw);
      next.position = projected.position;
      next.depth = projected.depth;
    }
    if (transform.size) {
      next.size = lerpPoint(object.size, normalizePair(transform.size, object.size), smooth(phase));
    }
    if (typeof transform.opacity === 'number') {
      next.opacity = lerp(object.opacity, transform.opacity, smooth(phase));
    }
    if (transform.color) {
      const targetColor = Array.isArray(transform.color) ? transform.color[0] : transform.color;
      next.color = interpolateColor(object.color, targetColor, smooth(phase));
    }
    if (transform.element) {
      const morphed = morphObject(state, object, transform, smooth(phase));
      if (morphed && phase < 0.995) {
        next.element = morphed.closed ? 'polygon' : 'line';
        next.value = morphed.closed ? morphed.points : morphLineValue(next.rawPosition, morphed.points);
      } else {
        next.element = transform.element;
        if (transform.value !== undefined) {
          next.value = transform.value;
        }
      }
    } else if (transform.value !== undefined && phase > 0.6) {
      next.value = transform.value;
    }
    if (transform.style) {
      next.style = transform.style;
    }
    if (transform.z_index !== undefined) {
      next.z_index = transform.z_index;
    }
    if (transform.thickness !== undefined) {
      next.thickness = transform.thickness;
    }
    if (transform.number_of_ticks) {
      next.number_of_ticks = normalizePair(transform.number_of_ticks, next.number_of_ticks ?? [8, 6]);
    }
    state.objects.set(object.id, next);
    transformEquationChildren(state, object, next, transform, rawPositionDelta, selectedIds, phase);
  });
};
const transformCamera = (state: SceneState, camera: UniversalCamera, phase: number) => {
  const eased = smooth(phase);
  if (camera.position) {
    state.camera.position = clampPoint(lerpPoint(state.camera.position, camera.position, eased), state.bounds);
  }
  if (typeof camera.zoom === 'number') {
    state.camera.zoom = lerp(state.camera.zoom, camera.zoom, eased);
  }
};

const vanishObjects = (state: SceneState, id: number | number[] | 'all', phase: number) => {
  const opacity = 1 - smooth(phase);
  if (id === 'all') {
    state.objects.forEach((object) => state.objects.set(object.id, { ...object, opacity: object.opacity * opacity }));
    return;
  }

  normalizeIds(id).forEach((targetId) => {
    const object = state.objects.get(targetId);
    if (object) {
      state.objects.set(targetId, { ...object, opacity: object.opacity * opacity });
      state.objects.forEach((child) => {
        if (child.parent_id === targetId) {
          state.objects.set(child.id, { ...child, opacity: child.opacity * opacity });
        }
      });
    }
  });
};

const normalizeObject = (object: UniversalObject, bounds: CoordinateBounds): RenderObject => ({
  ...normalizeObjectParts(object, bounds),
});

const normalizeObjectParts = (object: UniversalObject, bounds: CoordinateBounds): RenderObject => {
  const rawPosition = clampPoint3D(normalizePoint3D(object.position), bounds);
  const projected = projectPoint(rawPosition);
  return {
    id: normalizeIds(object.id)[0],
    element: object.element,
    value: object.value,
    coordinate: object.coordinate,
    position: projected.position,
    rawPosition,
    depth: projected.depth,
    color: typeof object.color === 'string' ? object.color : object.color?.[0] ?? defaultObject.color,
    opacity: object.opacity ?? defaultObject.opacity,
    size: normalizePair(object.size, sizeForElement(object.element)),
    style: object.style ?? defaultObject.style,
    thickness: object.thickness ?? defaultObject.thickness,
    z_index: object.z_index ?? defaultObject.z_index,
    number_of_ticks: normalizePair(object.number_of_ticks, [8, 6]),
    creationProgress: object.opacity ?? defaultObject.opacity,
  };
};

const sizeForElement = (element: UniversalObject['element']): [number, number] => {
  if (element === 'dot') return [2.4, 2.4];
  if (element === 'text') return [28, 6];
  if (element === 'equation') return [24, 6];
  if (element === 'html') return [42, 24];
  if (element === 'icon') return [8, 8];
  if (element === 'image') return [26, 26];
  if (element === 'graph') return [100, 56];
  if (element === 'line' || element === 'arrow') return [24, 0];
  return defaultObject.size;
};

const layoutPositions = (object: UniversalObject, count: number, bounds: CoordinateBounds): [number, number, number][] => {
  const center = normalizePoint3D(object.position);
  if (count <= 1) {
    return [clampPoint3D(center, bounds)];
  }
  const gap = object.space_between_elements ?? 4;
  const offset = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => {
    const amount = (index - offset) * gap;
    if (object.alignment === 'vertical') return clampPoint3D([center[0], center[1] - amount, center[2]], bounds);
    if (object.alignment === 'diagonal_left_to_right') return clampPoint3D([center[0] + amount, center[1] + amount, center[2]], bounds);
    if (object.alignment === 'diagonal_right_to_left') return clampPoint3D([center[0] - amount, center[1] + amount, center[2]], bounds);
    if (object.alignment === 'cluttered') {
      const angle = (Math.PI * 2 * index) / count;
      return clampPoint3D([center[0] + Math.cos(angle) * gap * 1.4, center[1] + Math.sin(angle) * gap * 1.2, center[2]], bounds);
    }
    return clampPoint3D([center[0] + amount, center[1], center[2]], bounds);
  });
};

const normalizeIds = (id: number | number[]) => (Array.isArray(id) ? id : [id]);
const normalizePair = (value: [number, number] | [number, number, number] | number | undefined, fallback: [number, number]): [number, number] => {
  if (Array.isArray(value)) {
    return [Number(value[0]) || fallback[0], Number(value[1]) || fallback[1]];
  }
  if (typeof value === 'number') {
    return [value, value];
  }
  return fallback;
};
const normalizeArray = <T,>(value: T[] | T | { objects?: T[] }) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && 'objects' in value && Array.isArray(value.objects)) return value.objects;
  return value ? [value as T] : [];
};
const normalizeCamera = (camera: UniversalCamera | undefined, bounds: CoordinateBounds): Required<UniversalCamera> => ({
  position: clampPoint(normalizePair(camera?.position, defaultCamera.position), bounds),
  zoom: camera?.zoom ?? defaultCamera.zoom,
});
const normalizePoint3D = (point: [number, number] | [number, number, number] | undefined): [number, number, number] => [
  Number(point?.[0]) || 0,
  Number(point?.[1]) || 0,
  Number(point?.[2]) || 0,
];
const coordinateBounds = (aspectRatio: VisualScene['aspect_ratio']): CoordinateBounds =>
  aspectRatio === '9:16' ? { x: 45, y: 80 } : { x: 80, y: 45 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clampPoint = (point: [number, number], bounds: CoordinateBounds): [number, number] => [
  clamp(point[0], -bounds.x, bounds.x),
  clamp(point[1], -bounds.y, bounds.y),
];
const clampPoint3D = (point: [number, number, number], bounds: CoordinateBounds): [number, number, number] => [
  clamp(point[0], -bounds.x, bounds.x),
  clamp(point[1], -bounds.y, bounds.y),
  point[2],
];
const projectPoint = (point: [number, number, number]) => {
  const [x, y, z] = point;
  return {
    depth: z,
    position: [x + z * 0.18, y + z * 0.62] as [number, number],
  };
};
const smooth = (value: number) => value * value * (3 - 2 * value);
const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;
const lerpPoint = (from: [number, number], to: [number, number], progress: number): [number, number] => [
  lerp(from[0], to[0], progress),
  lerp(from[1], to[1], progress),
];
const lerpPoint3D = (from: [number, number, number], to: [number, number, number], progress: number): [number, number, number] => [
  lerp(from[0], to[0], progress),
  lerp(from[1], to[1], progress),
  lerp(from[2], to[2], progress),
];
const add = (first: [number, number], second: [number, number]): [number, number] => [first[0] + second[0], first[1] + second[1]];
const subtract = (first: [number, number] | [number, number, number], second: [number, number]): [number, number] => [first[0] - second[0], first[1] - second[1]];
const subtract3 = (first: [number, number, number], second: [number, number, number]): [number, number, number] => [
  first[0] - second[0],
  first[1] - second[1],
  first[2] - second[2],
];
const add3 = (first: [number, number, number], second: [number, number, number]): [number, number, number] => [
  first[0] + second[0],
  first[1] + second[1],
  first[2] + second[2],
];
const centerOf = (objects: RenderObject[]): [number, number] => [
  objects.reduce((sum, object) => sum + object.position[0], 0) / objects.length,
  objects.reduce((sum, object) => sum + object.position[1], 0) / objects.length,
];

const translatePolygonValue = (value: unknown, delta: [number, number, number]) => {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      return point;
    }
    const nextPoint = [Number(point[0]) + delta[0], Number(point[1]) + delta[1]];
    if (point.length > 2 || delta[2] !== 0) {
      nextPoint.push(Number(point[2] ?? 0) + delta[2]);
    }
    return nextPoint;
  });
};



const sampleGraphObjectPath = (object: RenderObject): [number, number, number][] => {
  const expression = String(object.value ?? '').replace(/^y\s*=\s*/i, '').trim();
  const xRange = graphRange(object.size[0], 10);
  const fallbackYRange = graphRange(object.size[1], 6);
  const samples = sampleGraphValues(expression, xRange, 180);
  const yRange = autoGraphYRange(samples, fallbackYRange);
  const left = object.rawPosition[0] - object.size[0] / 2;
  const bottom = object.rawPosition[1] - object.size[1] / 2;
  return samples.map(({ xValue, yValue }) => {
    return [
      left + ((xValue - xRange[0]) / (xRange[1] - xRange[0])) * object.size[0],
      bottom + ((yValue - yRange[0]) / (yRange[1] - yRange[0])) * object.size[1],
      object.rawPosition[2],
    ] as [number, number, number];
  });
};

type GraphValueSample = {
  xValue: number;
  yValue: number;
};

const sampleGraphValues = (expression: string, xRange: [number, number], count: number): GraphValueSample[] => {
  if (!expression) return [];
  const points: GraphValueSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const xValue = xRange[0] + ((xRange[1] - xRange[0]) * index) / Math.max(1, count - 1);
    const yValue = evaluateSimpleExpression(expression, xValue);
    if (Number.isFinite(yValue)) {
      points.push({ xValue, yValue });
    }
  }
  return points;
};

const autoGraphYRange = (samples: GraphValueSample[], fallbackRange: [number, number]): [number, number] => {
  const values = samples.map((sample) => sample.yValue).filter(Number.isFinite).sort((first, second) => first - second);
  if (values.length < 2) return fallbackRange;
  const lower = percentile(values, 0.02);
  const upper = percentile(values, 0.98);
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) return fallbackRange;
  const span = upper - lower;
  if (span < 0.001) {
    const padding = Math.max(1, Math.abs(lower) * 0.15, (fallbackRange[1] - fallbackRange[0]) * 0.25);
    return [lower - padding, upper + padding];
  }
  const padding = Math.max(0.5, span * 0.12);
  return [lower - padding, upper + padding];
};

const graphRange = (visualSize: number, baseRange: number): [number, number] => {
  const span = Math.max(2, Math.round((visualSize / 100) * baseRange));
  return [-span, span];
};

const percentile = (sortedValues: number[], ratio: number) => {
  if (sortedValues.length === 1) return sortedValues[0];
  const index = clamp(ratio, 0, 1) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const progress = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * progress;
};



const transformEquationChildren = (
  state: SceneState,
  previousParent: RenderObject,
  nextParent: RenderObject,
  transform: UniversalTransform,
  rawPositionDelta: [number, number, number] | null,
  selectedIds: Set<number>,
  phase: number
) => {
  const children = [...state.objects.values()].filter(
    (child) => child.parent_id === previousParent.id && !selectedIds.has(child.id)
  );
  if (!children.length) {
    return;
  }

  children.forEach((child) => {
    const nextChild = { ...child };
    if (rawPositionDelta) {
      const nextRaw = add3(child.rawPosition, rawPositionDelta);
      nextChild.rawPosition = nextRaw;
      const projected = projectPoint(nextRaw);
      nextChild.position = projected.position;
      nextChild.depth = projected.depth;
    }
    if (typeof transform.opacity === 'number') {
      nextChild.opacity = lerp(child.opacity, transform.opacity, smooth(phase));
    }
    if (transform.color) {
      const targetColor = Array.isArray(transform.color) ? transform.color[0] : transform.color;
      nextChild.color = interpolateColor(child.color, targetColor, smooth(phase));
    }
    if (transform.z_index !== undefined) {
      nextChild.z_index = nextParent.z_index + 1;
    }
    state.objects.set(child.id, nextChild);
  });
};

const morphObject = (state: SceneState, object: RenderObject, transform: UniversalTransform, phase: number): MorphPath | null => {
  if (!transform.element) {
    return null;
  }

  const target = targetObjectForMorph(state, object, transform);
  const fromPath = objectToMorphPath(object);
  const toPath = objectToMorphPath(target);
  const pointCount = 96;
  const from = resampleMorphPath(fromPath, pointCount);
  const to = resampleMorphPath(toPath, pointCount);
  if (!from.length || !to.length) {
    return null;
  }

  const aligned = alignBySmallestTravel(from, to, toPath.closed);
  return {
    closed: toPath.closed,
    points: from.map((point, index) => lerpPoint(point, aligned[index], phase)),
  };
};

const targetObjectForMorph = (state: SceneState, object: RenderObject, transform: UniversalTransform): RenderObject => {
  const rawPosition = transform.position ? clampPoint3D(normalizePoint3D(transform.position), state.bounds) : object.rawPosition;
  const projected = projectPoint(rawPosition);
  return {
    ...object,
    element: transform.element ?? object.element,
    value: transform.value ?? object.value,
    size: normalizePair(transform.size, object.size),
    rawPosition,
    position: projected.position,
    depth: projected.depth,
  };
};

const objectToMorphPath = (object: RenderObject): MorphPath => {
  if (object.element === 'circle' || object.element === 'dot') {
    const radiusX = object.size[0] / 2;
    const radiusY = object.size[1] / 2;
    return {
      closed: true,
      points: Array.from({ length: 32 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 32 - Math.PI / 2;
        return [object.rawPosition[0] + Math.cos(angle) * radiusX, object.rawPosition[1] + Math.sin(angle) * radiusY] as [number, number];
      }),
    };
  }

  if (object.element === 'polygon' && Array.isArray(object.value)) {
    const vertices = object.value.filter(
      (vertex): vertex is [number, number] | [number, number, number] => Array.isArray(vertex) && vertex.length >= 2
    ).map((vertex) => [Number(vertex[0]) || 0, Number(vertex[1]) || 0] as [number, number]);
    return { closed: true, points: vertices };
  }

  if (object.element === 'line' || object.element === 'arrow') {
    return { closed: false, points: lineObjectPoints(object) };
  }

  if (object.element === 'graph' && typeof object.value === 'string' && /^y\s*=/.test(object.value.trim())) {
    return { closed: false, points: sampleGraphObjectPath(object).map((point) => [point[0], point[1]] as [number, number]) };
  }

  return { closed: true, points: rectangleMorphPoints(object) };
};

const lineObjectPoints = (object: RenderObject): [number, number][] => {
  if (Array.isArray(object.value)) {
    const points = object.value
      .filter((point): point is [number, number] | [number, number, number] => Array.isArray(point) && point.length >= 2)
      .map((point) => [object.rawPosition[0] + Number(point[0] || 0), object.rawPosition[1] + Number(point[1] || 0)] as [number, number]);
    if (points.length >= 2) {
      return points;
    }
  }
  return [
    [object.rawPosition[0] - object.size[0] / 2, object.rawPosition[1] - object.size[1] / 2],
    [object.rawPosition[0] + object.size[0] / 2, object.rawPosition[1] + object.size[1] / 2],
  ];
};

const rectangleMorphPoints = (object: RenderObject): [number, number][] => {
  const halfWidth = object.size[0] / 2;
  const halfHeight = object.size[1] / 2;
  return [
    [object.rawPosition[0] - halfWidth, object.rawPosition[1] - halfHeight],
    [object.rawPosition[0] + halfWidth, object.rawPosition[1] - halfHeight],
    [object.rawPosition[0] + halfWidth, object.rawPosition[1] + halfHeight],
    [object.rawPosition[0] - halfWidth, object.rawPosition[1] + halfHeight],
  ];
};

const morphLineValue = (rawPosition: [number, number, number], points: [number, number][]) =>
  points.map((point) => [point[0] - rawPosition[0], point[1] - rawPosition[1]] as [number, number]);

const resampleMorphPath = (path: MorphPath, count: number) => {
  if (path.points.length < 2) {
    return path.points;
  }
  return path.closed ? sampleClosedPolyline(path.points, count) : sampleOpenPolyline(path.points, count);
};
const sampleClosedPolyline = (vertices: [number, number][], count: number) => {
  if (vertices.length < 2) {
    return [];
  }
  const segments = vertices.map((point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return { from: point, to: next, length: distance(point, next) };
  });
  const perimeter = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (perimeter <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    let target = (perimeter * index) / count;
    for (const segment of segments) {
      if (target <= segment.length) {
        const progress = segment.length === 0 ? 0 : target / segment.length;
        return lerpPoint(segment.from, segment.to, progress);
      }
      target -= segment.length;
    }
    return vertices[0];
  });
};

const sampleOpenPolyline = (vertices: [number, number][], count: number) => {
  if (vertices.length < 2) {
    return [];
  }
  const segments = vertices.slice(0, -1).map((point, index) => {
    const next = vertices[index + 1];
    return { from: point, to: next, length: distance(point, next) };
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (totalLength <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    let target = (totalLength * index) / Math.max(1, count - 1);
    for (const segment of segments) {
      if (target <= segment.length) {
        const progress = segment.length === 0 ? 0 : target / segment.length;
        return lerpPoint(segment.from, segment.to, progress);
      }
      target -= segment.length;
    }
    return vertices[vertices.length - 1];
  });
};

const alignBySmallestTravel = (from: [number, number][], to: [number, number][], closed: boolean) => {
  if (!closed) {
    const reversed = [...to].reverse();
    return totalTravel(from, reversed) < totalTravel(from, to) ? reversed : to;
  }

  let bestOffset = 0;
  let bestReversed = false;
  let bestDistance = Number.POSITIVE_INFINITY;
  const candidates = [to, [...to].reverse()];
  candidates.forEach((candidate, candidateIndex) => {
    for (let offset = 0; offset < candidate.length; offset += 1) {
      const aligned = candidate.map((_, index) => candidate[(index + offset) % candidate.length]);
      const total = totalTravel(from, aligned);
      if (total < bestDistance) {
        bestDistance = total;
        bestOffset = offset;
        bestReversed = candidateIndex === 1;
      }
    }
  });
  const best = bestReversed ? [...to].reverse() : to;
  return best.map((_, index) => best[(index + bestOffset) % best.length]);
};

const totalTravel = (from: [number, number][], to: [number, number][]) =>
  from.reduce((sum, point, index) => sum + distance(point, to[index]), 0);
const distance = (first: [number, number], second: [number, number]) =>
  Math.hypot(first[0] - second[0], first[1] - second[1]);

const interpolateColor = (from: string, to: string, phase: number) => {
  const fromRgb = parseColor(from);
  const toRgb = parseColor(to);
  if (!fromRgb || !toRgb) {
    return phase > 0.5 ? to : from;
  }
  const rgb = fromRgb.map((value, index) => Math.round(lerp(value, toRgb[index], phase)));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
};

const parseColor = (value: string) => {
  const named: Record<string, [number, number, number]> = {
    white: [245, 244, 254],
    yellow: [244, 211, 94],
    cyan: [88, 196, 221],
    red: [255, 107, 107],
    green: [29, 232, 176],
    blue: [88, 196, 221],
  };
  const lower = value.trim().toLowerCase();
  if (named[lower]) {
    return named[lower];
  }
  const hex = lower.match(/^#?([0-9a-f]{6})$/i);
  if (!hex) {
    return null;
  }
  return [0, 2, 4].map((start) => Number.parseInt(hex[1].slice(start, start + 2), 16)) as [number, number, number];
};

const evaluateSimpleExpression = (expression: string, x: number) => {
  const safe = expression
    .toLowerCase()
    .replace(/\^/g, '**')
    .replace(/\bexp\s*\(/g, 'Math.exp(')
    .replace(/\bpi\b/g, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
    .replace(/\bsin\b/g, 'Math.sin')
    .replace(/\bcos\b/g, 'Math.cos')
    .replace(/\btan\b/g, 'Math.tan')
    .replace(/\bsqrt\b/g, 'Math.sqrt')
    .replace(/\babs\b/g, 'Math.abs');
  if (!/^[0-9x+\-*/().\sMathPIEcosintaqrbe]+$/.test(safe)) return Number.NaN;
  try {
    return Function('x', `"use strict"; return (${safe});`)(x);
  } catch {
    return Number.NaN;
  }
};
