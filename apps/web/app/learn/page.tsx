"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRight, Check, Play } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EntrepreneurNav } from "@/features/entrepreneur/components/entrepreneur-nav";
import { useLocaleSwitch } from "@/lib/i18n/provider";
import { ContentLanguageNotice } from "@/features/entrepreneur/components/content-language-notice";
type Lesson = { id: string; title: string; description: string; language: string; duration_seconds: number | null; status: string };
type Dashboard = { current_lesson: Lesson | null; next_lesson: Lesson | null; completed_lessons: Lesson[] };
const copy = { am: { title: "የእኔ ትምህርት", sub: "በንግድዎ ላይ የሚያግዝ የተመራ ጉዞ", now: "አሁን", next: "ቀጣይ", later: "በኋላ", finished: "የተጠናቀቀ", continue: "ይቀጥሉ", empty: "አማካሪዎ ቀጣዩን ትምህርት እዚህ ያክላል።", ask: "ስለ ንግድዎ ይጠይቁ", loading: "ትምህርቶችን በመጫን ላይ…", error: "ትምህርቶችን መክፈት አልተቻለም።", retry: "እንደገና ይሞክሩ" }, en: { title: "My learning", sub: "A guided path to support your business", now: "Right now", next: "Next for your business", later: "Later", finished: "Finished", continue: "Continue", empty: "Your adviser will add your next lesson here.", ask: "Ask about your business", loading: "Loading your learning path…", error: "Your learning path could not be loaded.", retry: "Try again" }, om: { title: "Barnoota koo", sub: "Daandii qajeelfamaa daldala kee gargaaru", now: "Amma", next: "Itti aanu", later: "Booda", finished: "Xumurame", continue: "Itti fufi", empty: "Gorsaan kee barnoota itti aanu asitti dabala.", ask: "Waa'ee daldala kee gaafadhu", loading: "Daandii barnootaa fe'aa jira…", error: "Daandiin barnootaa fe'amuu hin dandeenye.", retry: "Irra deebi'i" }, so: { title: "Barashadayda", sub: "Jid waxbarasho oo ganacsigaaga taageera", now: "Hadda", next: "Kan xiga", later: "Mar dambe", finished: "La dhammeeyay", continue: "Sii wad", empty: "La-taliyahaagu halkan ayuu casharka xiga ku dari doonaa.", ask: "Weydii ganacsigaaga", loading: "Jidka waxbarashada waa la rarayaa…", error: "Jidka waxbarashada lama soo rari karin.", retry: "Mar kale isku day" } } as const;
export default function LearnPage() {
  const { locale } = useLocaleSwitch();
  const t = copy[locale];
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => apiFetch<Dashboard>("/me/dashboard") });
  const d = q.data;
  const path = [d?.current_lesson, d?.next_lesson].filter((lesson): lesson is Lesson => Boolean(lesson));

  return (
    <div className="min-h-dvh bg-background text-secondary">
      <EntrepreneurNav active="learn" />
      <main className="mx-auto max-w-[1280px] px-5 py-9 pb-28 sm:px-8">
        <header className="mb-10">
          <p className="text-sm font-medium text-text-secondary">{t.sub}</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{t.title}</h1>
        </header>
        {q.isPending ? (
          <p className="max-w-3xl border-l-2 border-border-soft py-2 pl-5 text-text-secondary" aria-busy="true">{t.loading}</p>
        ) : q.isError ? (
          <section className="max-w-3xl border-l-2 border-destructive py-2 pl-5" role="alert">
            <p className="text-text-primary">{t.error}</p>
            <Button variant="outline" className="mt-4" onClick={() => void q.refetch()}>{t.retry}</Button>
          </section>
        ) : path.length === 0 ? (
          <section className="max-w-3xl border-y border-border-soft py-8">
            <p className="text-lg leading-7 text-text-secondary">{t.empty}</p>
            <Link href="/chat" className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-brand-primary hover:underline">
              {t.ask}<ArrowRight className="size-4" />
            </Link>
          </section>
        ) : (
          <div className={d?.completed_lessons?.length ? "grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]" : "max-w-4xl"}>
            <section>
              <ol className="relative ml-4 border-l border-border-strong/70 pl-8">
                {path.map((lesson, index) => {
                  const active = index === 0;
                  return (
                    <li key={lesson.id} className="relative pb-7 last:pb-0">
                      <span className={active ? "absolute -left-[2.45rem] top-5 flex size-7 items-center justify-center rounded-full bg-brand-accent text-white ring-4 ring-background" : "absolute -left-[2.45rem] top-5 flex size-7 items-center justify-center rounded-full border border-border-strong bg-background text-text-secondary ring-4 ring-background"}>
                        {active ? <Play className="size-4" /> : <span className="size-2 rounded-full bg-border-strong" />}
                      </span>
                      <article className={active ? "rounded-xl border border-border-soft bg-surface p-5 shadow-[0_2px_12px_rgba(11,42,91,0.04)] sm:p-6" : "rounded-xl border border-border-soft bg-background p-5 sm:p-6"}>
                        <p className="text-xs font-bold uppercase tracking-wide text-brand-primary">{active ? t.now : t.next}</p>
                        <h2 lang={lesson.language} className="mt-2 text-xl font-bold sm:text-2xl">{lesson.title}</h2>
                        <p lang={lesson.language} className="mt-2 max-w-2xl leading-7 text-text-secondary">{lesson.description}</p>
                        <div className="mt-3"><ContentLanguageNotice contentLanguage={lesson.language} selectedLanguage={locale} /></div>
                        <p className="mt-3 text-xs font-medium text-text-secondary">{lesson.language === "am" ? "አማርኛ" : lesson.language === "en" ? "English" : lesson.language}{lesson.duration_seconds ? ` · ${Math.ceil(lesson.duration_seconds / 60)} min` : ""}</p>
                        {active && <Button asChild className="mt-4 min-h-11"><Link href={`/learning/resources/${lesson.id}`}>{t.continue}</Link></Button>}
                      </article>
                    </li>
                  );
                })}
              </ol>
            </section>
            {d?.completed_lessons?.length ? (
              <section className="lg:border-l lg:border-border-soft lg:pl-10">
                <h2 className="mb-5 text-xl font-bold">{t.finished}</h2>
                <ul className="divide-y divide-border-soft">
                  {d.completed_lessons.map(lesson => <li key={lesson.id} className="flex gap-3 py-4"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"><Check className="size-4" /></span><div><h3 lang={lesson.language} className="font-semibold text-text-secondary">{lesson.title}</h3><p className="mt-1 text-sm text-text-secondary">{lesson.language === "am" ? "አማርኛ" : lesson.language === "en" ? "English" : lesson.language}</p></div></li>)}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
