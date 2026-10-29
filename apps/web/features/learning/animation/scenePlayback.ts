import type { VisualScene } from './types';

// Fallback duration (seconds) when a scene has no audio and no story to estimate from.
export const fallbackSceneDuration = 8;
const sceneTransitionSeconds = 1;
const sceneTransitionHoldRatio = 0.25;

export const estimateSceneDuration = (scene: VisualScene) => {
  const words = scene.story.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(4.2, Math.min(18, words / 2.4));
};

export const audioDurationSeconds = (scene: VisualScene) => {
  const durationMs = scene.audio?.duration_ms;
  if (!durationMs || durationMs <= 0) {
    return null;
  }
  return durationMs / 1000;
};

export const timelineDurationSeconds = (scene: VisualScene) => {
  if (!Number.isFinite(scene.start_ms) || !Number.isFinite(scene.end_ms)) {
    return null;
  }
  const durationSeconds = (Number(scene.end_ms) - Number(scene.start_ms)) / 1000;
  return durationSeconds > 0 ? durationSeconds : null;
};

export const sceneCoreDuration = (scene: VisualScene | null) =>
  scene ? timelineDurationSeconds(scene) ?? audioDurationSeconds(scene) ?? estimateSceneDuration(scene) : fallbackSceneDuration;

export const sceneVisualProgress = (scene: VisualScene, progress: number) => {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const actionCount = scene.animation.length;
  const lastAction = scene.animation[actionCount - 1];
  const endsWithClear = actionCount > 1 && lastAction && 'vanish' in lastAction && lastAction.vanish.id === 'all';
  if (!endsWithClear) {
    return clampedProgress;
  }

  const transitionStartProgress = (actionCount - 1) / actionCount;
  return Math.min(1, clampedProgress / transitionStartProgress);
};

const animationProgressAtElapsed = (scene: VisualScene, elapsed: number, duration: number) => {
  const clampedElapsed = Math.max(0, Math.min(duration, elapsed));
  const actionCount = scene.animation.length;
  const lastAction = scene.animation[actionCount - 1];
  const endsWithClear = actionCount > 1 && lastAction && 'vanish' in lastAction && lastAction.vanish.id === 'all';
  if (!endsWithClear) {
    return clampedElapsed / duration;
  }

  const transitionDuration = Math.min(sceneTransitionSeconds, duration);
  const mainDuration = duration - transitionDuration;
  const vanishStartProgress = (actionCount - 1) / actionCount;
  if (clampedElapsed < mainDuration && mainDuration > 0) {
    return (clampedElapsed / mainDuration) * vanishStartProgress;
  }

  const holdDuration = transitionDuration * sceneTransitionHoldRatio;
  const fadeDuration = transitionDuration - holdDuration;
  if (clampedElapsed < mainDuration + holdDuration) {
    return vanishStartProgress;
  }

  const vanishProgress = fadeDuration > 0
    ? (clampedElapsed - mainDuration - holdDuration) / fadeDuration
    : 1;
  return vanishStartProgress + Math.max(0, Math.min(1, vanishProgress)) / actionCount;
};

export const sceneAtElapsed = (scenes: VisualScene[], durations: number[], elapsed: number) => {
  if (!scenes.length) {
    return { index: 0, progress: 0, scene: null as VisualScene | null, isGap: false };
  }

  let cursor = 0;
  for (let index = 0; index < scenes.length; index += 1) {
    const suppliedDuration = durations[index];
    const exactDuration = Number.isFinite(suppliedDuration) && suppliedDuration > 0
      ? suppliedDuration
      : sceneCoreDuration(scenes[index]);
    const nextCursor = cursor + exactDuration;
    if (elapsed < nextCursor || index === scenes.length - 1) {
      const localElapsed = elapsed - cursor;
      const progress = animationProgressAtElapsed(scenes[index], localElapsed, exactDuration);
      return { index, progress, scene: scenes[index], isGap: false };
    }
    cursor = nextCursor;
  }

  return { index: scenes.length - 1, progress: 1, scene: scenes[scenes.length - 1], isGap: false };
};

export const sceneElapsedAtIndex = (durations: number[], index: number, elapsed: number) =>
  Math.max(0, elapsed - durations.slice(0, index).reduce((sum, value) => sum + value, 0));
