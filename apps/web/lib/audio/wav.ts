/** Target format for every utterance sent to the API: 16 kHz, mono, PCM16 WAV. */
export const TARGET_SAMPLE_RATE = 16_000;

/** Concatenate Float32 chunks into one buffer. */
export function concatFloat32(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Resample mono Float32 audio to 16 kHz. Uses OfflineAudioContext (proper
 * anti-aliasing) and falls back to linear interpolation when unavailable.
 */
export async function resampleTo16k(
  samples: Float32Array,
  fromRate: number
): Promise<Float32Array> {
  if (fromRate === TARGET_SAMPLE_RATE || samples.length === 0) return samples;
  const targetLength = Math.max(
    1,
    Math.round((samples.length * TARGET_SAMPLE_RATE) / fromRate)
  );
  if (typeof OfflineAudioContext !== "undefined") {
    try {
      const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
      const buffer = offline.createBuffer(1, samples.length, fromRate);
      buffer.copyToChannel(new Float32Array(samples), 0);
      const src = offline.createBufferSource();
      src.buffer = buffer;
      src.connect(offline.destination);
      src.start();
      const rendered = await offline.startRendering();
      return rendered.getChannelData(0).slice();
    } catch {
      // fall through to linear interpolation
    }
  }
  const ratio = fromRate / TARGET_SAMPLE_RATE;
  const out = new Float32Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const t = pos - i0;
    out[i] = samples[i0] * (1 - t) + samples[i1] * t;
  }
  return out;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

/** Encode mono Float32 samples (-1..1) as a PCM16 WAV file. */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number = TARGET_SAMPLE_RATE
): ArrayBuffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Float32 at any rate → 16 kHz mono PCM16 WAV Blob. */
export async function toWav16kBlob(
  samples: Float32Array,
  sampleRate: number
): Promise<Blob> {
  const resampled = await resampleTo16k(samples, sampleRate);
  return new Blob([encodeWav(resampled, TARGET_SAMPLE_RATE)], { type: "audio/wav" });
}
