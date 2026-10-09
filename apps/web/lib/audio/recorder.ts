import { concatFloat32, toWav16kBlob } from "./wav";

/** Microphone constraints shared by dictation and live talk. */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  // Echo cancellation stays on so the assistant's own voice can't trigger barge-in.
  echoCancellation: true,
  // Off: browser noise suppression can smear subtle Amharic consonants (ejectives like ጠ, ጨ, ቀ, ጸ).
  // Turn back on if users are mostly in very noisy places.
  noiseSuppression: false,
  autoGainControl: true,
};

export class MicPermissionError extends Error {
  constructor(message = "Microphone permission denied") {
    super(message);
    this.name = "MicPermissionError";
  }
}

export class MicUnavailableError extends Error {
  constructor(message = "Microphone not available") {
    super(message);
    this.name = "MicUnavailableError";
  }
}

export async function getMicStream(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new MicUnavailableError();
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === "NotAllowedError" || err.name === "SecurityError")
    ) {
      throw new MicPermissionError();
    }
    throw new MicUnavailableError();
  }
}

// Captures raw Float32 frames off the audio thread and posts them to the main thread.
const CAPTURE_WORKLET = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("inkomoko-capture", CaptureProcessor);
`;

export interface Recording {
  /** 16 kHz mono PCM16 WAV */
  wav: Blob;
  durationMs: number;
}

export interface Recorder {
  /** Current input level, 0..1 (RMS, lightly boosted for display). */
  level: () => number;
  /** Stop and return the 16 kHz WAV. */
  stop: () => Promise<Recording>;
  /** Stop and discard. */
  cancel: () => void;
}

/** Start capturing the microphone. Caller must invoke stop() or cancel(). */
export async function startRecorder(): Promise<Recorder> {
  const stream = await getMicStream();
  const ctx = new AudioContext();
  await ctx.resume().catch(() => undefined);
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const chunks: Float32Array[] = [];
  let node: AudioNode;
  // A muted sink keeps the graph pulling audio without echoing it to the speakers.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sink.connect(ctx.destination);

  if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
    const url = URL.createObjectURL(
      new Blob([CAPTURE_WORKLET], { type: "application/javascript" })
    );
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const worklet = new AudioWorkletNode(ctx, "inkomoko-capture");
    worklet.port.onmessage = (e: MessageEvent<Float32Array>) => chunks.push(e.data);
    node = worklet;
  } else {
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) =>
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    node = processor;
  }
  source.connect(node);
  node.connect(sink);

  const startedAt = performance.now();
  const timeData = new Float32Array(analyser.fftSize);
  let closed = false;

  const teardown = () => {
    if (closed) return;
    closed = true;
    try {
      source.disconnect();
      node.disconnect();
    } catch {
      /* already disconnected */
    }
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => undefined);
  };

  return {
    level: () => {
      if (closed) return 0;
      analyser.getFloatTimeDomainData(timeData);
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
      return Math.min(1, Math.sqrt(sum / timeData.length) * 4);
    },
    stop: async () => {
      const sampleRate = ctx.sampleRate;
      const durationMs = performance.now() - startedAt;
      teardown();
      const wav = await toWav16kBlob(concatFloat32(chunks), sampleRate);
      return { wav, durationMs };
    },
    cancel: teardown,
  };
}
