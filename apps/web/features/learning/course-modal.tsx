"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiFetch, apiUrl } from "@/lib/api";
import UniversalSceneRenderer from "./animation/UniversalSceneRenderer";
import { answerBundledQuestion, loadBundledDemo, saveBundledProgress, type Lesson, type Progress } from "./bundled-demo";
import "katex/dist/katex.min.css";
import "./animation/bestie.css";
import "./player.css";

export default function CourseModal({ resourceId, onClose, preview = false }: { resourceId: string | null; onClose: () => void; preview?: boolean }) {
  const explicitDemo = resourceId === "demo" && !preview;
  const config = useQuery({ queryKey: ["animated-config"], queryFn: () => apiFetch<{ demo_mode: boolean }>("/learning/animated/config", { signal: AbortSignal.timeout(2000) }), enabled: !preview && !explicitDemo && resourceId !== null, retry: false });
  // shortcut: all learner course links open the shared demo until LEARNING_DEMO_MODE is disabled.
  const demoMode = !preview && (explicitDemo || config.isError || config.data?.demo_mode);
  const target = demoMode ? "demo" : resourceId;
  return <Dialog open={resourceId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="learning-dialog" showCloseButton={false} aria-describedby="animated-lesson-description">
      <DialogClose asChild><button className="learning-close" aria-label="Close lesson and return to lesson list"><X size={20} /></button></DialogClose>
      <DialogHeader className="sr-only">
        <DialogTitle>{preview ? "Course preview" : "Your learning studio"}</DialogTitle>
        <DialogDescription id="animated-lesson-description">{demoMode ? "Amharic demo · Watch, answer, and continue. Progress is saved in this browser." : "Watch each section and answer its questions to continue."}</DialogDescription>
      </DialogHeader>
      {resourceId && (preview || explicitDemo || config.data || config.isError) && <LessonLoader key={`${target}-${preview}`} target={target!} preview={preview} />}
      {!preview && !explicitDemo && config.isPending && <p className="p-6" aria-busy="true">Opening your lesson…</p>}
    </DialogContent>
  </Dialog>;
}

function LessonLoader({ target, preview }: { target: string; preview: boolean }) {
  const lesson = useQuery({ queryKey: ["animated-lesson", target, preview], queryFn: () => target === "demo" && !preview ? loadBundledDemo() : apiFetch<Lesson>(`/learning/animated/${target}`, { query: { preview } }), staleTime: 0 });
  if (lesson.isPending) return <p className="p-8" aria-busy="true">Opening your lesson…</p>;
  if (lesson.isError) return <div className="p-8" role="alert"><p>{lesson.error.message}</p><Button className="mt-4" onClick={() => void lesson.refetch()}>Try again</Button></div>;
  return <LessonPlayer lesson={lesson.data} preview={preview} />;
}

const formatTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

function LessonPlayer({ lesson, preview }: { lesson: Lesson; preview: boolean }) {
  const { module } = lesson;
  const queryClient = useQueryClient();
  const audio = useRef<HTMLAudioElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(lesson.progress);
  const [position, setPosition] = useState(lesson.progress.position_ms);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(0.8);
  const [captions, setCaptions] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const positionRef = useRef(position);
  const progressRef = useRef(progress);
  const restored = useRef(false);
  const requestQueue = useRef<Promise<unknown>>(Promise.resolve());
  const firstLocked = module.checkpoints.find((q) => !progress.answers[q.id]?.correct);
  const ceiling = firstLocked?.at_ms ?? module.duration_ms;
  const blocked = firstLocked && position >= firstLocked.at_ms - 30 ? firstLocked : null;
  const activeScene = module.scenes.find((s) => position < (s.end_ms ?? 0)) ?? module.scenes[module.scenes.length - 1];
  const scene = blocked ? module.scenes.find((s) => s.end_ms === blocked.at_ms) ?? activeScene : activeScene;
  const sceneProgress = Math.max(0, Math.min(1, (position - (scene.start_ms ?? 0)) / Math.max(1, (scene.end_ms ?? 1) - (scene.start_ms ?? 0))));
  const path = `/learning/animated/${lesson.id}`;
  const query = { preview };

  const persist = useCallback((ms: number, keepalive = false) => {
    const currentVersion = progressRef.current.version;
    requestQueue.current = requestQueue.current.catch(() => undefined).then(async () => {
      try {
        const result = lesson.bundled ? saveBundledProgress(lesson, progressRef.current, ms) : await apiFetch<Progress>(`${path}/progress`, { method: "PUT", query: { preview }, body: { position_ms: Math.round(ms), version: currentVersion }, keepalive });
        // Position is a resume marker; a delayed save must never move the live playhead.
        setSaved(true);
        setError("");
        if (result.completed) {
          setProgress((current) => ({ ...current, completed: true }));
          void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        }
      } catch (err) { setSaved(false); setError(`Progress could not be saved. ${err instanceof Error ? err.message : "Please retry."}`); }
    });
    return requestQueue.current;
  }, [lesson, path, preview, queryClient]);

  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => {
    const element = audio.current;
    const timer = window.setInterval(() => { if (audio.current && !audio.current.paused) void persist(positionRef.current); }, 5000);
    const saveOnHide = () => { if (document.visibilityState === "hidden") void persist(positionRef.current, true); };
    document.addEventListener("visibilitychange", saveOnHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", saveOnHide);
      element?.pause();
      void persist(positionRef.current, true);
      void queryClient.invalidateQueries({ queryKey: ["animated-lesson"] });
    };
  }, [persist, queryClient]);
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const el = audio.current;
      if (!el) return;
      const next = Math.min(el.currentTime * 1000, ceiling);
      positionRef.current = next;
      setPosition(next);
      if (firstLocked && el.currentTime * 1000 >= ceiling) {
        setSelected(null); setFeedback("");
        el.pause(); el.currentTime = ceiling / 1000; setPlaying(false); void persist(ceiling);
      } else if (!el.paused) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, ceiling, firstLocked, persist]);

  const seek = (ms: number) => {
    setFeedback("");
    setSelected(null);
    const next = Math.max(0, Math.min(ms, ceiling));
    if (audio.current) { audio.current.currentTime = next / 1000; if (next >= ceiling && firstLocked) audio.current.pause(); }
    setPosition(next); positionRef.current = next;
    if (next >= ceiling && firstLocked) { setPlaying(false); setSelected(null); setFeedback(""); }
    void persist(next);
  };
  const togglePlay = async () => {
    if (!audio.current || blocked) return;
    if (playing) { audio.current.pause(); setPlaying(false); void persist(positionRef.current); }
    else {
      setFeedback("");
      if (position >= module.duration_ms - 100) seek(0);
      try { await audio.current.play(); setError(""); setPlaying(true); }
      catch { setError("Audio could not start. Check your connection and press play again."); }
    }
  };
  const submit = async () => {
    if (!blocked || selected === null || submitting) return;
    setSubmitting(true);
    try {
      await requestQueue.current;
      const result = lesson.bundled ? answerBundledQuestion(lesson, progressRef.current, blocked.id, selected, position) : await apiFetch<{ correct: boolean; explanation: string; progress: Progress }>(`${path}/answer`, { method: "POST", query,
        body: { checkpoint_id: blocked.id, option: selected, position_ms: Math.round(position), version: module.version } });
      setFeedback(result.explanation);
      setProgress(result.progress); progressRef.current = result.progress;
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your answer."); }
    finally { setSubmitting(false); }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    } catch { setError("Fullscreen is unavailable on this device."); }
  };

  return <div className="learning-player" data-playing={playing && !blocked && !feedback}>
    <audio ref={audio} src={module.audio_url ?? apiUrl(`${path}/audio`, query)} preload="auto" crossOrigin="use-credentials"
      onLoadedMetadata={() => { if (audio.current && !restored.current) { audio.current.currentTime = Math.min(positionRef.current, ceiling) / 1000; audio.current.volume = volume; restored.current = true; } }}
      onPause={() => setPlaying(false)} onWaiting={() => setPlaying(false)} onPlaying={() => setPlaying(true)}
      onEnded={() => { setPlaying(false); setPosition(module.duration_ms); positionRef.current = module.duration_ms; void persist(module.duration_ms); }}
      onError={() => setError("Voiceover could not be loaded. Close and reopen the lesson to retry.")} />
    <div ref={frame} className="animated-player learning-frame" style={{ "--background": "#0F0C29", "--font-newsreader": "var(--font-sans)" } as React.CSSProperties}>
      <div className="learning-stage"><UniversalSceneRenderer scene={scene} progress={sceneProgress} /></div>
      <div className="learning-title player-chrome">
        <p>{preview ? "Course preview" : "Interactive lesson"}</p>
        <h2 title={module.title}>{module.title}</h2>
      </div>
      {fullscreen && <DialogClose asChild><button className="learning-close" aria-label="Close lesson and return to lesson list" onClick={() => void document.exitFullscreen()}><X size={20} /></button></DialogClose>}
      {captions && !blocked && !feedback && <p className="learning-captions" lang={module.language}>{scene.story}</p>}
      {blocked && <PlayerOverlay>
        <section aria-labelledby="checkpoint-title" lang={module.language}>
          <p className="learning-eyebrow">Pause & practice · {blocked.type === "true_false" ? "True or false" : "Choose one answer"}</p>
          <h3 id="checkpoint-title" className="learning-question">{blocked.question}</h3>
          <fieldset className="learning-options" disabled={submitting}>
            <legend className="sr-only">Choose your answer</legend>
            {blocked.options.map((option, index) => <label key={index} className={`learning-option ${selected === index ? "is-selected" : ""}`}>
              <input type="radio" name={blocked.id} checked={selected === index} onChange={() => setSelected(index)} />
              <span>{option}</span>
            </label>)}
          </fieldset>
          <div className="learning-check-actions">
            <button className="learning-check-button" onClick={() => void submit()} disabled={selected === null || submitting}>{submitting ? "Saving…" : "Check answer"}</button>
            <button className="learning-replay-button" onClick={() => { seek(scene.start_ms ?? 0); void audio.current?.play().catch(() => setError("Audio could not start. Press play to retry.")); }}>Replay section</button>
          </div>
          <p className="learning-feedback" role="status">{feedback || "Answer correctly to continue. You can replay this section."}</p>
        </section>
      </PlayerOverlay>}
      {!blocked && feedback && <PlayerOverlay>
        <section role="status">
          <p className="learning-eyebrow">Correct · Section unlocked</p>
          <h3 className="learning-question">You’ve got it.</h3>
          <p className="learning-explanation" lang={module.language}>{feedback}</p>
          <button className="learning-check-button" onClick={() => { if (position >= module.duration_ms - 500) { setFeedback(""); void persist(position); } else void togglePlay(); }}>{position >= module.duration_ms - 500 ? "Finish lesson" : "Continue lesson"} <Play size={16} /></button>
        </section>
      </PlayerOverlay>}
      {progress.completed && !blocked && !feedback && !playing && position >= module.duration_ms - 500 && <PlayerOverlay>
        <section role="status">
          <p className="learning-eyebrow">Lesson completed</p>
          <h3 className="learning-question">Well done.</h3>
          <p className="learning-explanation">You’ve completed this lesson and all its checks. Close the player to return to your lessons.</p>
          <button className="learning-check-button" onClick={() => { seek(0); void togglePlay(); }}>Watch again <RotateCcw size={16} /></button>
        </section>
      </PlayerOverlay>}
      {error && <div className="learning-error" role="alert"><span title={error}>{error}</span><button onClick={() => void persist(positionRef.current)}>Retry saving</button></div>}
      <div className="learning-controls player-chrome" role="group" aria-label="Lesson playback controls">
        <div className="learning-timeline">
          <input aria-label="Lesson timeline" type="range" min={0} max={module.duration_ms} step={100} value={position} onChange={(e) => seek(Number(e.target.value))} />
          <div className="learning-checkpoint-markers">{module.checkpoints.map((q) => <span key={q.id} className={progress.answers[q.id]?.correct ? "is-passed" : ""} style={{ left: `${q.at_ms / module.duration_ms * 100}%` }} />)}</div>
        </div>
        <div className="learning-controls-row">
          <button className="learning-control" onClick={() => void togglePlay()} disabled={Boolean(blocked)} aria-label={playing ? "Pause lesson" : "Play lesson"}>{playing ? <Pause size={19} /> : <Play size={19} />}</button>
          <button className="learning-control" aria-label="Rewind ten seconds" onClick={() => seek(position - 10000)}><RotateCcw size={17} /></button>
          <span className="learning-time">{formatTime(position)} <span>/ {formatTime(module.duration_ms)}</span></span>
          <span className="learning-save-status" role="status">{module.checkpoints.filter((q) => progress.answers[q.id]?.correct).length}/{module.checkpoints.length} checks · {progress.completed ? "Completed" : saved ? "Saved" : "Auto-save"}</span>
          <div className="learning-control-spacer" />
          <label className="learning-volume"><Volume2 size={17} /><input aria-label="Volume" type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} /></label>
          <button className="learning-control" onClick={() => setCaptions(!captions)} aria-label="Toggle captions" aria-pressed={captions}>CC</button>
          <select aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="learning-speed">{[0.75, 1, 1.25, 1.5, 2].map((n) => <option key={n} value={n}>{n}×</option>)}</select>
          <button className="learning-control" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen lesson"} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        </div>
      </div>
    </div>
  </div>;
}

// Keep unusually long questions inside the available frame without introducing a scrollbar.
function PlayerOverlay({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => {
      if (!container.current || !card.current) return;
      const available = container.current;
      const content = card.current;
      const style = getComputedStyle(available);
      const height = available.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      content.style.setProperty("--checkpoint-scale", String(Math.min(1, height / Math.max(1, content.offsetHeight))));
    };
    const observer = new ResizeObserver(fit);
    if (container.current) observer.observe(container.current);
    if (card.current) observer.observe(card.current);
    fit();
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className="learning-question-overlay"><div ref={card} className="learning-question-card">{children}</div></div>;
}
