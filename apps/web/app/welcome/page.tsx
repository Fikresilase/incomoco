"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Mic, Volume2, VolumeX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { apiBlob, apiFetch } from "@/lib/api";
import { useDictation } from "@/features/voice/hooks/use-dictation";
import { useVoiceCapabilities } from "@/features/voice/hooks/use-voice-capabilities";
import { useLocaleSwitch } from "@/lib/i18n/provider";
import { LocaleToggle } from "@/components/locale-toggle";

type Dashboard = { profile_name: string; business_name: string | null; language: string; current_action: { title: string } | null };
type UiState = "ready" | "listening" | "processing" | "speaking" | "error";
const copy = {
  en: { welcome: "Welcome", prompt: "How can I help your business today?", back: "Open your business journey", type: "Type instead", send: "Continue", retry: "Try again", listen: "Listening", ready: "Tap the microphone when you are ready", processing: "One moment", speaking: "Speaking", mute: "Mute adviser", unmute: "Unmute adviser", error: "Voice is unavailable. You can continue by text.", transcript: "I heard you say", start: "Start listening", stop: "Stop listening" },
  am: { welcome: "እንኳን ደህና መጡ", prompt: "ዛሬ በንግድዎ ምን ልርዳዎ?", back: "ወደ የንግድ ጉዞዎ", type: "በጽሑፍ ይጠይቁ", send: "ይቀጥሉ", retry: "እንደገና ይሞክሩ", listen: "እያዳመጥኩ ነው", ready: "ለመናገር ዝግጁ ሲሆኑ ማይክሮፎኑን ይጫኑ", processing: "አንድ አፍታ…", speaking: "እየተናገርኩ ነው", mute: "የአማካሪውን ድምጽ ያጥፉ", unmute: "የአማካሪውን ድምጽ ያብሩ", error: "ድምጽ አልተገኘም። በጽሑፍ መቀጠል ይችላሉ።", transcript: "የሰማሁት", start: "ማዳመጥ ይጀምሩ", stop: "ማዳመጥ ያቁሙ" },
  om: { welcome: "Baga nagaan dhuftan", prompt: "Har'a daldala keessan irratti akkan isin gargaaru barbaaddu?", back: "Gara adeemsa daldalaa deebi'i", type: "Barreessaa gaafadhu", send: "Itti fufi", retry: "Irra deebi'i", listen: "Dhaggeeffachaan jira", ready: "Yeroo qophooftan maayikiroofonii tuqaa", processing: "Xiqqoo eeggadhaa…", speaking: "Dubbachaan jira", mute: "Sagalee gorsaa cufi", unmute: "Sagalee gorsaa bani", error: "Sagaleen hin hojjenne. Barreeffamaan itti fufuu dandeessu.", transcript: "Waan ani dhaga'e", start: "Dhaggeeffachuu jalqabi", stop: "Dhaggeeffachuu dhaabi" },
  so: { welcome: "Soo dhawoow", prompt: "Sideen maanta ganacsigaaga uga caawin karaa?", back: "Fur safarka ganacsigaaga", type: "Qor halkii", send: "Sii wad", retry: "Mar kale isku day", listen: "Waan dhageysanayaa", ready: "Taabo makarafoonka markaad diyaar tahay", processing: "Hal daqiiqad…", speaking: "Waan hadlayaa", mute: "Aamusii la-taliyaha", unmute: "Codka la-taliyaha daar", error: "Codku ma shaqaynayo. Qoraal ayaad ku sii wadan kartaa.", transcript: "Waxaan maqlay", start: "Bilow dhageysiga", stop: "Jooji dhageysiga" },
} as const;

export default function WelcomePage() {
  const router = useRouter();
  const { locale } = useLocaleSwitch();
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => apiFetch<Dashboard>("/me/dashboard") });
  const voiceCapabilities = useVoiceCapabilities();
  const [muted, setMuted] = useState(false);
  const [state, setState] = useState<UiState>("ready");
  const [transcript, setTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [showTyped, setShowTyped] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const d = useMemo(() => dashboard.data ? { ...dashboard.data, language: locale } : undefined, [dashboard.data, locale]);
  const t = copy[locale];
  const name = d?.profile_name.split(/[ &]/)[0] || "";
  const greeting = `${t.welcome} ${name}. ${t.prompt}`;
  const greetingSupported = voiceCapabilities.canSpeak(locale);
  const { state: recorderState, start, stop } = useDictation(text => { setTranscript(text); setState("ready"); }, undefined, locale);

  useEffect(() => {
    if (!d || !greetingSupported || muted || audioRef.current) return;
    let cancelled = false;
    void apiBlob("/voice/speak-text", { method: "POST", body: { text: greeting, language: locale, context: "dashboard" } }).then(blob => {
      if (cancelled) return;
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      setState("speaking");
      const releaseAudio = () => {
        URL.revokeObjectURL(objectUrl);
        if (audioRef.current === audio) audioRef.current = null;
      };
      audio.onended = () => { releaseAudio(); setState("ready"); };
      audio.onerror = () => { releaseAudio(); setState("ready"); };
      return audio.play();
    }).catch(() => setState("ready"));
    return () => {
      cancelled = true;
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        URL.revokeObjectURL(audio.src);
        audioRef.current = null;
      }
    };
  }, [d, greeting, greetingSupported, locale, muted]);

  function toggleListening() {
    if (recorderState === "recording") { setState("processing"); void stop(); return; }
    if (recorderState === "starting") return;
    audioRef.current?.pause(); audioRef.current = null;
    setState("listening"); void start().catch(() => setState("error"));
  }
  function continueToChat(message: string) { const clean = message.trim(); if (!clean) return; sessionStorage.setItem("inkomoko_welcome_message", clean); router.push("/chat"); }
  const active = state === "listening";
  const speaking = state === "speaking" && greetingSupported && !muted;
  const stateText = active ? t.listen : state === "processing" || recorderState === "transcribing" ? t.processing : speaking ? t.speaking : state === "error" ? t.error : t.ready;

  return <main className="flex min-h-dvh flex-col bg-background px-5 py-5 text-secondary sm:px-8"><header className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4"><Wordmark showProduct={false} className="text-xl" /><div className="flex items-center gap-2"><LocaleToggle />{greetingSupported && <Button variant="ghost" size="icon" className="size-11" aria-label={muted ? t.unmute : t.mute} onClick={() => { setMuted(value => !value); audioRef.current?.pause(); audioRef.current = null; setState("ready"); }}>{muted ? <VolumeX /> : <Volume2 />}<span className="sr-only">{muted ? t.unmute : t.mute}</span></Button>}</div></header><section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center py-10 text-center"><p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-primary">{locale === "am" ? "የኢንኮሞኮ አማካሪ" : locale === "om" ? "Gorsaa Inkomoko" : locale === "so" ? "La-taliyaha Inkomoko" : "Inkomoko Adviser"}</p><h1 lang={locale} className="mt-6 text-4xl font-bold leading-tight sm:text-5xl">{name ? `${t.welcome}, ${name}` : t.welcome}</h1>{d?.business_name && <p className="mt-2 text-base text-text-secondary">{d.business_name}</p>}<p lang={locale} className="mt-5 max-w-lg text-xl leading-8 text-text-secondary">{t.prompt}</p><div className={speaking ? "relative mt-12 flex size-44 items-center justify-center rounded-full border border-brand-primary/30 bg-surface-navy" : active ? "relative mt-12 flex size-44 items-center justify-center rounded-full border border-brand-accent/45 bg-surface-coral" : "relative mt-12 flex size-44 items-center justify-center rounded-full border border-brand-accent/20 bg-surface-coral"}><span className={speaking ? "absolute inset-3 animate-pulse rounded-full border border-brand-primary/20" : active ? "absolute inset-3 animate-pulse rounded-full border border-brand-accent/25" : "absolute inset-3 rounded-full border border-brand-accent/15"} /><Button type="button" size="icon" className="z-10 size-20 rounded-full" aria-label={active ? t.stop : t.start} onClick={toggleListening}>{active ? <span className="size-6 rounded-sm bg-current" /> : <Mic className="size-8" />}</Button></div><p className="mt-7 min-h-6 text-base font-medium" role="status" aria-live="polite">{stateText}</p>{transcript.trim() && <div className="mt-6 w-full border-t border-border-soft pt-5 text-left"><p className="text-sm font-semibold text-brand-primary">{t.transcript}</p><p className="mt-2 text-lg leading-7">{transcript}</p><div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => continueToChat(transcript)} className="min-h-11">{t.send}<ArrowRight /></Button><Button variant="ghost" className="min-h-11" onClick={() => { setTranscript(""); setState("ready"); }}>{t.retry}</Button><Button variant="ghost" className="min-h-11" onClick={() => { setShowTyped(true); setTranscript(""); }}>{t.type}</Button></div></div>}{showTyped && <div className="mt-5 flex w-full gap-2"><input className="min-h-12 min-w-0 flex-1 rounded-lg border border-border-soft bg-surface px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary" aria-label={t.type} value={typed} onChange={event => setTyped(event.target.value)} onKeyDown={event => { if (event.key === "Enter") continueToChat(typed); }} /><Button className="min-h-12" onClick={() => continueToChat(typed)}>{t.send}</Button></div>}</section><footer className="mx-auto flex w-full max-w-2xl items-center justify-center gap-3 border-t border-border-soft pt-4"><Button variant="ghost" className="min-h-11" onClick={() => setShowTyped(value => !value)}>{t.type}</Button><Link className="inline-flex min-h-11 items-center px-3 text-sm text-text-secondary hover:text-brand-primary" href="/home">{t.back}</Link></footer></main>;
}
