import type { VisualScene } from "./animation/types";

export type Checkpoint = { id: string; at_ms: number; type: "multiple_choice" | "true_false"; question: string; options: string[]; answer?: number; explanation?: string };
export type Progress = { version: string; position_ms: number; answers: Record<string, { option: number; correct: boolean; attempts: number }>; completed: boolean };
export type Module = { title: string; language: string; version: string; duration_ms: number; scenes: VisualScene[]; checkpoints: Checkpoint[]; animation_model: string; tts_model: string; audio_url?: string };
export type Lesson = { id: string; module: Module; progress: Progress; bundled?: boolean };

const progressKey = (lesson: Pick<Lesson, "id" | "module">) => `inkomoko-demo:${lesson.id}:${lesson.module.version}`;

export async function loadBundledDemo(): Promise<Lesson> {
  const response = await fetch("/learning-demo/amharic/module.json");
  if (!response.ok) throw new Error("The bundled Amharic demo could not be loaded. Please refresh and try again.");
  const manifest = await response.json() as Pick<Lesson, "id" | "module">;
  const blank: Progress = { version: manifest.module.version, position_ms: 0, answers: {}, completed: false };
  let progress = blank;
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey(manifest)) ?? "null") as Progress | null;
    if (saved && saved.version === blank.version && Number.isFinite(saved.position_ms) && saved.position_ms >= 0 && saved.answers && typeof saved.answers === "object" && !Array.isArray(saved.answers) && typeof saved.completed === "boolean") progress = saved;
  } catch { /* A blocked browser store or an outdated entry must not prevent demo playback. */ }
  progress = { ...progress, position_ms: clampDemoPosition(manifest.module, progress.answers, progress.position_ms) };
  return { ...manifest, bundled: true, progress };
}

function clampDemoPosition(module: Module, answers: Progress["answers"], ms: number) {
  const locked = module.checkpoints.find((q) => !answers[q.id]?.correct);
  return Math.max(0, Math.min(Math.round(ms), locked?.at_ms ?? module.duration_ms));
}

export function saveBundledProgress(lesson: Lesson, current: Progress, ms: number): Progress {
  const position_ms = clampDemoPosition(lesson.module, current.answers, ms);
  const allPassed = lesson.module.checkpoints.every((q) => current.answers[q.id]?.correct);
  const progress = { ...current, position_ms, completed: current.completed || (allPassed && position_ms >= lesson.module.duration_ms - 500) };
  localStorage.setItem(progressKey(lesson), JSON.stringify(progress));
  return progress;
}

export function answerBundledQuestion(lesson: Lesson, current: Progress, checkpointId: string, option: number, ms: number) {
  const question = lesson.module.checkpoints.find((q) => q.id === checkpointId);
  const locked = lesson.module.checkpoints.find((q) => !current.answers[q.id]?.correct);
  if (!question || typeof question.answer !== "number" || (locked && question.at_ms > locked.at_ms) || ms < question.at_ms - 500 || option < 0 || option >= question.options.length) throw new Error("Complete the current section and choose an answer first.");
  const previous = current.answers[checkpointId];
  const correct = option === question.answer;
  const answers = { ...current.answers, [checkpointId]: { option, correct: correct || previous?.correct || false, attempts: (previous?.attempts ?? 0) + 1 } };
  const progress = saveBundledProgress(lesson, { ...current, answers }, ms);
  return { correct, progress, explanation: correct ? question.explanation ?? "ትክክል ነው።" : "እንደገና ይሞክሩ። ክፍሉን ደግመው ይመልከቱና ሌላ መልስ ይምረጡ።" };
}
