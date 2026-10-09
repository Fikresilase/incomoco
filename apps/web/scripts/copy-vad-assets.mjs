// Copies the Silero VAD + onnxruntime-web runtime assets into public/vad so
// @ricky0123/vad-web can load them at /vad/ (self-hosted, no CDN).
// Runs before `dev` and `build`; public/vad is git-ignored.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "vad");
const assets = [
  ["node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js", "vad.worklet.bundle.min.js"],
  ["node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx", "silero_vad_v5.onnx"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.wasm"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.mjs"],
];

mkdirSync(out, { recursive: true });
let copied = 0;
for (const [from, name] of assets) {
  const src = join(root, from);
  const dest = join(out, name);
  if (!existsSync(src)) {
    console.warn(`[vad-assets] missing ${from} (run bun install)`);
    continue;
  }
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) continue;
  copyFileSync(src, dest);
  copied++;
}
console.log(`[vad-assets] ${copied} copied, ${assets.length - copied} up to date → public/vad`);
