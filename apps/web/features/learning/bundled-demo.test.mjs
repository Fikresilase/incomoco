import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("bundled Amharic demo plays and saves checkpoints without a backend", async (context) => {
  const manifest = JSON.parse(await readFile(new URL("../../public/learning-demo/amharic/module.json", import.meta.url), "utf8"));
  const audio = await readFile(new URL("../../public/learning-demo/amharic/narration.mp3", import.meta.url));
  assert.equal(manifest.module.language, "am");
  assert.equal(manifest.module.scenes.length, 3);
  assert.deepEqual(manifest.module.checkpoints.map((q) => q.type), ["multiple_choice", "true_false"]);
  assert.ok(audio.length > 10000 && audio.length < 5_000_000);
  for (const scene of manifest.module.scenes) {
    assert.ok(/[\u1200-\u137f]{3}/u.test(scene.story));
    for (const action of scene.animation) for (const object of action.create ?? []) {
      if (object.element === "html") for (const script of String(object.value).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1]);
    }
  }
  const source = await readFile(new URL("./bundled-demo.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helpers = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map();
  globalThis.fetch = async (url) => {
    assert.equal(url, "/learning-demo/amharic/module.json", "Demo must never fetch an API endpoint");
    return { ok: true, json: async () => structuredClone(manifest) };
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } });
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  });
  const lesson = await helpers.loadBundledDemo();
  assert.equal(lesson.bundled, true);
  assert.equal(lesson.module.audio_url, "/learning-demo/amharic/narration.mp3");
  const [first, second] = lesson.module.checkpoints;
  let progress = helpers.saveBundledProgress(lesson, lesson.progress, lesson.module.duration_ms);
  assert.equal(progress.position_ms, first.at_ms);
  assert.equal(progress.completed, false);
  assert.throws(() => helpers.answerBundledQuestion(lesson, progress, second.id, second.answer, second.at_ms));
  const wrong = helpers.answerBundledQuestion(lesson, progress, first.id, (first.answer + 1) % first.options.length, first.at_ms);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.progress.answers[first.id].attempts, 1);
  const right = helpers.answerBundledQuestion(lesson, wrong.progress, first.id, first.answer, first.at_ms);
  assert.equal(right.correct, true);
  assert.equal(right.progress.answers[first.id].attempts, 2);
  progress = helpers.answerBundledQuestion(lesson, right.progress, second.id, second.answer, second.at_ms).progress;
  progress = helpers.saveBundledProgress(lesson, progress, lesson.module.duration_ms);
  assert.equal(progress.completed, true);
  const resumed = await helpers.loadBundledDemo();
  assert.deepEqual(resumed.progress, progress);
});
