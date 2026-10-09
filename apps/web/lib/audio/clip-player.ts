/**
 * Plays one audio clip (e.g. a read-aloud WAV) at a time. Starting a new clip
 * stops the previous one.
 */
type Listener = (key: string | null) => void;

let current: { key: string; audio: HTMLAudioElement; url: string } | null = null;
const listeners = new Set<Listener>();

function emit() {
  const key = current?.key ?? null;
  listeners.forEach((l) => l(key));
}

export function stopClip(): void {
  if (!current) return;
  current.audio.pause();
  current.audio.src = "";
  URL.revokeObjectURL(current.url);
  current = null;
  emit();
}

/** Play `blob`; resolves when playback ends or is stopped. */
export function playClip(key: string, blob: Blob): Promise<void> {
  stopClip();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  current = { key, audio, url };
  emit();
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (current?.audio === audio) stopClip();
      resolve();
    };
    audio.onended = finish;
    audio.onpause = () => {
      if (current?.audio !== audio) resolve();
    };
    audio.onerror = () => {
      if (current?.audio === audio) stopClip();
      reject(new Error("Audio playback failed"));
    };
    audio.play().catch((err) => {
      if (current?.audio === audio) stopClip();
      reject(err);
    });
  });
}

export function currentClipKey(): string | null {
  return current?.key ?? null;
}

export function subscribeClip(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
