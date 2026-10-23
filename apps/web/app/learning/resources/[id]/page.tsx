"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Headphones } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { ListenButton } from "@/features/voice/components/listen-button";
import { EntrepreneurNav } from "@/features/entrepreneur/components/entrepreneur-nav";
import { useLocaleSwitch } from "@/lib/i18n/provider";
import { ContentLanguageNotice } from "@/features/entrepreneur/components/content-language-notice";
import { useVoiceCapabilities } from "@/features/voice/hooks/use-voice-capabilities";

type Resource = { id: string; title: string; description: string; skill_key: string; resource_type: string; language: string; difficulty_level: string; media_url: string | null; source_reference: string | null };
type Media = { media_type: string; url: string; expires_in: number };
const copy = {
  am: { back: "ወደ ትምህርቶቼ", intro: "ለንግድዎ ትምህርት", listen: "ያዳምጡ", understand: "የትምህርቱ ይዘት", adviser: "ከአማካሪዎ ጋር ይወያዩ", media: "የትምህርት ድምጽ", unavailable: "የዚህ ትምህርት ሚዲያ እስካሁን አልተገኘም።", audioUnavailable: "በዚህ ቋንቋ የድምጽ አገልግሎት አልተከፈተም።", audioError: "የድምጽ አገልግሎቱን ማግኘት አልተቻለም።", sample: "የናሙና ትምህርት", load: "ትምህርቱን በመክፈት ላይ…", error: "ይህን ትምህርት ማግኘት አልተቻለም።" },
  en: { back: "Back to learning", intro: "A lesson for your business", listen: "Listen", understand: "Lesson content", adviser: "Discuss with your adviser", media: "Listen to this lesson", unavailable: "This lesson’s media is not available yet.", audioUnavailable: "Audio is not available for this language yet.", audioError: "Audio service could not be checked.", sample: "Sample lesson", load: "Loading lesson...", error: "This lesson is unavailable." },
  om: { back: "Gara barnoota kootii deebi'i", intro: "Barnoota daldala keetiif", listen: "Dhaggeeffadhu", understand: "Qabiyyee barnootaa", adviser: "Gorsaa kee waliin mari'adhu", media: "Barnoota kana dhaggeeffadhu", unavailable: "Miidiyaan barnoota kanaa amma hin jiru.", audioUnavailable: "Sagaleen afaan kanaa amma hin deeggaramu.", audioError: "Tajaajilli sagalee mirkaneessuun hin danda'amne.", sample: "Barnoota fakkeenyaa", load: "Barnoota fe'aa jira…", error: "Barnootni kun hin jiru." },
  so: { back: "Ku noqo waxbarashadayda", intro: "Cashar ganacsigaaga ah", listen: "Dhageyso", understand: "Nuxurka casharka", adviser: "La hadal la-taliyahaaga", media: "Dhageyso casharkan", unavailable: "Warbaahinta casharkan weli lama heli karo.", audioUnavailable: "Codka luqaddan weli lama hawlgelin.", audioError: "Adeegga codka lama hubin karin.", sample: "Cashar tusaale ah", load: "Casharka waa la rarayaa…", error: "Casharkan lama heli karo." },
} as const;

export default function LearningResourcePage() {
  const { locale } = useLocaleSwitch();
  const t = copy[locale];
  const voiceCapabilities = useVoiceCapabilities();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const messageId = searchParams.get("message_id");
  const opened = useRef(false);
  const resource = useQuery({ queryKey: ["learning-resource", params.id], queryFn: () => apiFetch<Resource>(`/learning/resources/${params.id}`) });
  const media = useQuery({ queryKey: ["learning-resource-media", params.id], queryFn: () => apiFetch<Media>(`/learning/resources/${params.id}/media`), enabled: resource.isSuccess && resource.data.resource_type !== "text_lesson" && !resource.data.media_url });
  useEffect(() => { if (resource.data && !opened.current) { opened.current = true; const query = new URLSearchParams({ event_type: "learning_resource_opened" }); if (messageId) query.set("message_id", messageId); void apiFetch<void>(`/learning/resources/${params.id}/events?${query}`, { method: "POST" }).catch(() => undefined); } }, [resource.data, params.id, messageId]);
  if (resource.isPending) return <div className="min-h-dvh bg-background"><EntrepreneurNav active="learn" /><main className="mx-auto max-w-3xl p-6" aria-busy="true">{t.load}</main></div>;
  if (resource.isError) return <div className="min-h-dvh bg-background"><EntrepreneurNav active="learn" /><main className="mx-auto max-w-3xl p-6"><p role="alert">{t.error}</p><Button asChild className="mt-4"><Link href="/learn">{t.back}</Link></Button></main></div>;
  const item = resource.data;
  const mediaUrl = item.media_url ?? media.data?.url;
  const isMediaResource = item.resource_type === "audio" || item.resource_type === "video";
  const showDescription = !isMediaResource || !mediaUrl;
  return <div className="min-h-dvh bg-background text-secondary"><EntrepreneurNav active="learn" /><main className="mx-auto max-w-[1120px] space-y-8 px-5 py-7 pb-28 sm:px-8 sm:py-10"><Button asChild variant="ghost" className="-ml-3"><Link href="/learn"><ArrowLeft /> {t.back}</Link></Button><header className="max-w-3xl"><p className="text-sm font-semibold text-brand-primary">{t.intro}</p><h1 lang={item.language} className="mt-2 text-3xl font-bold sm:text-4xl">{item.title}</h1><p className="mt-4 text-sm text-text-secondary">{item.language === "am" ? "አማርኛ" : item.language === "en" ? "English" : item.language}</p><div className="mt-4 max-w-2xl"><ContentLanguageNotice contentLanguage={item.language} selectedLanguage={locale} /></div></header>{item.source_reference?.includes("DEMO") && <p className="w-fit border-l-2 border-brand-accent bg-surface px-3 py-1 text-sm font-medium text-brand-primary">{t.sample}</p>}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="min-w-0 border-y border-border-soft py-7" lang={item.language}>
          {showDescription && <><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-surface-navy text-brand-primary"><BookOpen className="size-5" /></span><h2 className="text-xl font-bold">{t.understand}</h2></div><div className="prose-chat mt-5 whitespace-pre-line text-base leading-8 text-text-primary">{item.description}</div></>}
          {item.resource_type === "audio" && mediaUrl && <section><div className="mb-4 flex items-center gap-3"><Headphones className="size-5 text-brand-primary" /><h2 className="font-semibold">{t.media}</h2></div><audio controls className="w-full" src={mediaUrl}><track kind="captions" /></audio></section>}
          {item.resource_type === "video" && mediaUrl && <video controls className="w-full rounded-lg" src={mediaUrl}><track kind="captions" /></video>}
          {isMediaResource && !mediaUrl && <p className="mt-5 text-sm text-text-secondary">{t.unavailable}</p>}
        </article>
        <aside className="space-y-5 lg:border-l lg:border-border-soft lg:pl-7">
          <section className="space-y-3"><h2 className="text-sm font-semibold text-text-secondary">{t.media}</h2><ListenButton text={`${item.title}. ${item.description}`} language={item.language} label={t.listen} />{voiceCapabilities.isError ? <p className="border-l-2 border-border-soft pl-3 text-sm leading-6 text-text-secondary" role="status">{t.audioError}</p> : !voiceCapabilities.isPending && !voiceCapabilities.canSpeak(item.language) ? <p className="border-l-2 border-border-soft pl-3 text-sm leading-6 text-text-secondary" role="status">{t.audioUnavailable}</p> : null}</section>
          <Link href="/chat" className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-primary hover:underline">{t.adviser}<ArrowLeft className="size-4 rotate-180" /></Link>
        </aside>
      </div>
      <Button asChild variant="outline" className="min-h-11"><Link href="/learn">{t.back}</Link></Button></main></div>;
}
