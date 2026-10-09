import type { MicVAD } from "@ricky0123/vad-web";
import { getMicStream } from "@/lib/audio/recorder";

/**
 * Silero VAD assets (worklet, ONNX model, onnxruntime wasm) are copied from node_modules
 * into /public/vad by `scripts/copy-vad-assets.mjs` (runs before `dev` and `build`).
 */
export const VAD_ASSET_PATH = "/vad/";

export interface VadCallbacks {
  onSpeechStart: () => void;
  onSpeechRealStart: () => void;
  onSpeechEnd: (audio: Float32Array) => void;
  onMisfire: () => void;
  /** Speech probability for each ~32 ms frame (0..1). */
  onFrame?: (probability: number) => void;
}

/**
 * Start a MicVAD (client-only: the library is imported lazily so nothing touches
 * `window` during SSR). Uses echo-cancelled mic input so the assistant's own voice
 * does not trigger barge-in.
 */
export async function createMicVad(callbacks: VadCallbacks): Promise<MicVAD> {
  const { MicVAD } = await import("@ricky0123/vad-web");
  return MicVAD.new({
    model: "v5",
    baseAssetPath: VAD_ASSET_PATH,
    onnxWASMBasePath: VAD_ASSET_PATH,
    getStream: getMicStream,
    resumeStream: getMicStream,
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    redemptionMs: 800,
    preSpeechPadMs: 300,
    minSpeechMs: 250,
    startOnLoad: true,
    onSpeechStart: callbacks.onSpeechStart,
    onSpeechRealStart: callbacks.onSpeechRealStart,
    onSpeechEnd: callbacks.onSpeechEnd,
    onVADMisfire: callbacks.onMisfire,
    onFrameProcessed: (probs) => callbacks.onFrame?.(probs.isSpeech),
  });
}
