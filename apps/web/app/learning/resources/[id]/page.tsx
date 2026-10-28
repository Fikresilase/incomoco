"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Check, Headphones } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { ListenButton } from "@/features/voice/components/listen-button";
import { useLocaleSwitch } from "@/lib/i18n/provider";
import { ContentLanguageNotice } from "@/features/entrepreneur/components/content-language-notice";
import { useVoiceCapabilities } from "@/features/voice/hooks/use-voice-capabilities";

type Practice = { question: string; options: string[]; answer: number; feedback: string };
type LessonContent = { objective?: string; sections?: { title: string; body: string }[]; example?: string; practice?: Practice; apply?: string };
type Resource = { id: string; title: string; description: string; skill_key: string; resource_type: string; language: string; difficulty_level: string; media_url: string | null; source_reference: string | null; course_key?: string | null; chapter_number?: number | null; lesson_content?: LessonContent | null };
type Media = { media_type: string; url: string; expires_in: number };
const copy = {
  am: { back: "ወደ ትምህርቶቼ", intro: "ለንግድዎ ትምህርት", listen: "ያዳምጡ", understand: "የትምህርቱ ይዘት", adviser: "ከአማካሪዎ ጋር ይወያዩ", media: "የትምህርት ድምጽ", unavailable: "የዚህ ትምህርት ሚዲያ እስካሁን አልተገኘም።", audioUnavailable: "በዚህ ቋንቋ የድምጽ አገልግሎት አልተከፈተም።", audioError: "የድምጽ አገልግሎቱን ማግኘት አልተቻለም።", sample: "የናሙና ትምህርት", load: "ትምህርቱን በመክፈት ላይ…", error: "ይህን ትምህርት ማግኘት አልተቻለም።" },
  en: { back: "Back to learning", intro: "A lesson for your business", listen: "Listen", understand: "Lesson content", adviser: "Discuss with your adviser", media: "Listen to this lesson", unavailable: "This lesson’s media is not available yet.", audioUnavailable: "Audio is not available for this language yet.", audioError: "Audio service could not be checked.", sample: "Sample lesson", load: "Loading lesson...", error: "This lesson is unavailable." },
  om: { back: "Gara barnoota kootii deebi'i", intro: "Barnoota daldala keetiif", listen: "Dhaggeeffadhu", understand: "Qabiyyee barnootaa", adviser: "Gorsaa kee waliin mari'adhu", media: "Barnoota kana dhaggeeffadhu", unavailable: "Miidiyaan barnoota kanaa amma hin jiru.", audioUnavailable: "Sagaleen afaan kanaa amma hin deeggaramu.", audioError: "Tajaajilli sagalee mirkaneessuun hin danda'amne.", sample: "Barnoota fakkeenyaa", load: "Barnoota fe'aa jira…", error: "Barnootni kun hin jiru." },
  so: { back: "Ku noqo waxbarashadayda", intro: "Cashar ganacsigaaga ah", listen: "Dhageyso", understand: "Nuxurka casharka", adviser: "La hadal la-taliyahaaga", media: "Dhageyso casharkan", unavailable: "Warbaahinta casharkan weli lama heli karo.", audioUnavailable: "Codka luqaddan weli lama hawlgelin.", audioError: "Adeegga codka lama hubin karin.", sample: "Cashar tusaale ah", load: "Casharka waa la rarayaa…", error: "Casharkan lama heli karo." },
} as const;

function PracticeStep({ practice, ui }: { practice: Practice; ui: { practice: string; retry: string } }) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;
  return <section className="mt-8 rounded-2xl bg-surface-navy p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-wide text-brand-primary">{ui.practice}</p><h2 className="mt-2 text-xl font-bold">{practice.question}</h2><div className="mt-4 grid gap-2">{practice.options.map((option, index) => <button type="button" key={option} onClick={() => setSelected(index)} className={selected === index ? "min-h-11 rounded-xl border-2 border-brand-primary bg-white px-4 text-left font-medium" : "min-h-11 rounded-xl border border-border-soft bg-white/80 px-4 text-left font-medium hover:border-brand-primary"}><span className="mr-2 text-text-secondary">{String.fromCharCode(65 + index)}.</span>{option}</button>)}</div>{answered && <p className={selected === practice.answer ? "mt-4 font-medium text-success" : "mt-4 font-medium text-brand-accent"} role="status">{selected === practice.answer ? practice.feedback : ui.retry}</p>}</section>;
}

function LessonSlides({ content, language }: { content: LessonContent; language: string }) {
  const slides = useMemo(() => {
    const core = [
    { title: "Start here", body: content.objective ?? "Begin with one useful idea for your business.", detail: "Read this step slowly. You can return to it at any time while completing the lesson." },
    ...(content.sections ?? []).map(section => ({ title: section.title, body: section.body, detail: "Connect this idea to one example from your own business records." })),
    ...(content.example ? [{ title: "A practical example", body: content.example, detail: "Notice the numbers and the order of the calculation before trying your own example." }] : []),
    ...(content.practice ? [{ title: "Check your understanding", body: content.practice.question, detail: "Choose the answer that best matches the lesson. You will receive feedback immediately." }] : []),
    ...(content.apply ? [{ title: "Apply it today", body: content.apply, detail: "Write down what you did. Your adviser can help you review the result." }] : []),
    { title: "Review", body: content.objective ?? "You have completed the main idea.", detail: "Before you finish, name one action you will take in your business." },
    ];
    const practice = Array.from({ length: Math.max(0, 20 - core.length) }, (_, position) => ({ title: `Business reflection ${position + 1}`, body: "How does this idea appear in your business this week?", detail: "Use your own sales, expense, customer, or planning record. Write one fact and one next action before continuing." }));
    return [...core, ...practice];
  }, [content]);
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  return <section className="mt-8" aria-label="Lesson slides" lang={language}><div className="flex items-center justify-between gap-4"><p className="text-sm font-semibold text-brand-primary">Step {index + 1} of {slides.length}</p><div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-accent transition-all" style={{ width: `${((index + 1) / slides.length) * 100}%` }} /></div></div><article className="mt-3 min-h-[260px] rounded-2xl border border-border-soft bg-surface p-6 shadow-[0_4px_20px_rgba(11,42,91,0.05)] sm:p-8"><p className="text-xs font-bold uppercase tracking-wide text-brand-primary">{slide.title}</p><h2 className="mt-3 text-2xl font-bold leading-tight">{slide.body}</h2><p className="mt-5 max-w-2xl text-base leading-8 text-text-secondary">{slide.detail}</p></article><div className="mt-4 flex items-center justify-between gap-3"><Button variant="outline" className="min-h-11" disabled={index === 0} onClick={() => setIndex(value => value - 1)}><ArrowLeft /> Previous</Button><Button className="min-h-11" disabled={index === slides.length - 1} onClick={() => setIndex(value => value + 1)}>Next <ArrowLeft className="rotate-180" /></Button></div></section>;
}

export default function LearningResourcePage() {
  const { locale } = useLocaleSwitch();
  const t = copy[locale];
  const ui = locale === "am" ? { practice: "ልምምድ", retry: "እንደገና ይመልከቱ", completed: "ተጠናቋል", complete: "ምዕራፉን አጠናቅቅ", saveError: "ምዕራፉን ማስቀመጥ አልተቻለም።" } : locale === "om" ? { practice: "Shaakala", retry: "Irra deebi'ii ilaali", completed: "Xumurame", complete: "Boqonnaa xumuri", saveError: "Boqonnaa kana kuusuun hin danda'amne." } : locale === "so" ? { practice: "Tababar", retry: "Dib u eeg oo isku day", completed: "La dhammeeyay", complete: "Dhammaystir cutubka", saveError: "Cutubka lama kaydin karin." } : { practice: "Practice", retry: "Not quite. Review the example and try again.", completed: "Completed", complete: "Mark chapter complete", saveError: "This chapter could not be saved." };
  const voiceCapabilities = useVoiceCapabilities();
  const client = useQueryClient();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const messageId = searchParams.get("message_id");
  const opened = useRef(false);
  const resource = useQuery({ queryKey: ["learning-resource", params.id], queryFn: () => apiFetch<Resource>(`/learning/resources/${params.id}`) });
  const complete = useMutation({ mutationFn: () => apiFetch<void>(`/learning/resources/${params.id}/complete`, { method: "POST" }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["dashboard"] }); } });
  const media = useQuery({ queryKey: ["learning-resource-media", params.id], queryFn: () => apiFetch<Media>(`/learning/resources/${params.id}/media`), enabled: resource.isSuccess && resource.data.resource_type !== "text_lesson" && !resource.data.media_url });
  useEffect(() => { if (resource.data && !opened.current) { opened.current = true; const query = new URLSearchParams({ event_type: "learning_resource_opened" }); if (messageId) query.set("message_id", messageId); void apiFetch<void>(`/learning/resources/${params.id}/events?${query}`, { method: "POST" }).catch(() => undefined); } }, [resource.data, params.id, messageId]);
  if (resource.isPending) return <div className="min-h-full bg-background"><main className="mx-auto max-w-3xl p-6" aria-busy="true">{t.load}</main></div>;
  if (resource.isError) return <div className="min-h-full bg-background"><main className="mx-auto max-w-3xl p-6"><p role="alert">{t.error}</p><Button asChild className="mt-4"><Link href="/learn">{t.back}</Link></Button></main></div>;
  const item = resource.data;
  const mediaUrl = item.media_url ?? media.data?.url;
  const isMediaResource = item.resource_type === "audio" || item.resource_type === "video";
  const showDescription = !isMediaResource || !mediaUrl;
  return <div className="min-h-full bg-background text-secondary"><main className="mx-auto max-w-[1120px] space-y-8 px-5 py-4 pb-8 sm:px-8 sm:py-5"><Button asChild variant="ghost" className="-ml-3"><Link href="/learn"><ArrowLeft /> {t.back}</Link></Button><header className="max-w-3xl"><p className="text-sm font-semibold text-brand-primary">{t.intro}</p><h1 lang={item.language} className="mt-2 text-3xl font-bold sm:text-4xl">{item.title}</h1><p className="mt-4 text-sm text-text-secondary">{item.language === "am" ? "አማርኛ" : item.language === "en" ? "English" : item.language}</p><div className="mt-4 max-w-2xl"><ContentLanguageNotice contentLanguage={item.language} selectedLanguage={locale} /></div></header>{item.source_reference?.includes("DEMO") && <p className="w-fit border-l-2 border-brand-accent bg-surface px-3 py-1 text-sm font-medium text-brand-primary">{t.sample}</p>}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="min-w-0 border-y border-border-soft py-7" lang={item.language}>
          {showDescription && <><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-surface-navy text-brand-primary"><BookOpen className="size-5" /></span><h2 className="text-xl font-bold">{t.understand}</h2></div>{item.lesson_content ? <LessonSlides content={item.lesson_content} language={item.language} /> : <div className="prose-chat mt-5 whitespace-pre-line text-base leading-8 text-text-primary">{item.description}</div>}{item.lesson_content?.practice && <PracticeStep practice={item.lesson_content.practice} ui={ui} />}{item.lesson_content?.apply && <section className="mt-6 rounded-xl border border-border-soft bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-brand-primary">Apply to your business</p><p className="mt-2 leading-7">{item.lesson_content.apply}</p><Link href="/chat" className="mt-4 inline-flex min-h-10 items-center gap-2 font-semibold text-brand-primary hover:underline">Ask your adviser <ArrowLeft className="size-4 rotate-180" /></Link></section>}</>}
          {item.resource_type === "audio" && mediaUrl && <section><div className="mb-4 flex items-center gap-3"><Headphones className="size-5 text-brand-primary" /><h2 className="font-semibold">{t.media}</h2></div><audio controls className="w-full" src={mediaUrl}><track kind="captions" /></audio></section>}
          {item.resource_type === "video" && mediaUrl && <video controls className="w-full rounded-lg" src={mediaUrl}><track kind="captions" /></video>}
          {isMediaResource && !mediaUrl && <p className="mt-5 text-sm text-text-secondary">{t.unavailable}</p>}
        </article>
        <aside className="space-y-5 lg:border-l lg:border-border-soft lg:pl-7">
          <section className="space-y-3"><h2 className="text-sm font-semibold text-text-secondary">{t.media}</h2><ListenButton text={`${item.title}. ${item.description}`} language={item.language} label={t.listen} />{voiceCapabilities.isError ? <p className="border-l-2 border-border-soft pl-3 text-sm leading-6 text-text-secondary" role="status">{t.audioError}</p> : !voiceCapabilities.isPending && !voiceCapabilities.canSpeak(item.language) ? <p className="border-l-2 border-border-soft pl-3 text-sm leading-6 text-text-secondary" role="status">{t.audioUnavailable}</p> : null}</section>
          <Link href="/chat" className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-primary hover:underline">{t.adviser}<ArrowLeft className="size-4 rotate-180" /></Link>
        </aside>
      </div>
      <div className="flex flex-wrap items-center gap-3"><Button className="min-h-11" disabled={complete.isPending} onClick={() => complete.mutate()}><Check /> {complete.isSuccess ? ui.completed : ui.complete}</Button><Button asChild variant="outline" className="min-h-11"><Link href="/learn">{t.back}</Link></Button></div>{complete.isError && <p className="text-sm text-destructive" role="alert">{ui.saveError}</p>}</main></div>;
}
