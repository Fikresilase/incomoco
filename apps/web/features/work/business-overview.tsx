"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useLocaleSwitch } from "@/lib/i18n/provider";
import { StoredBusinessTextNote } from "@/features/entrepreneur/components/content-language-notice";

type Dashboard = {
  business_name: string | null;
  business_type: string | null;
  business_stage: string | null;
  goal: { title: string; description: string } | null;
  current_action: {
    title: string;
    description: string;
    progress_count?: number;
    target_count?: number | null;
  } | null;
};
type Skill = { skill_key: string; status: string };

const copy = {
  am: {
    title: "የእኔ ንግድ",
    business: "ንግድ",
    goal: "ግቤ",
    week: "በዚህ ሳምንት",
    focus: "የንግድ ትኩረት",
    adviser: "ከአማካሪዎ ጋር ይነጋገሩ",
    noBusiness: "የንግድ መረጃ ገና አልተመዘገበም።",
    noGoal: "ግብ አልተመረጠም።",
    noAction: "ተግባር አልተመደበም።",
    noSkills: "የችሎታ ትኩረት ገና አልተመዘገበም።",
    loading: "የንግድ መረጃን በመጫን ላይ…",
    error: "የንግድ መረጃን መክፈት አልተቻለም።",
    retry: "እንደገና ይሞክሩ",
    progress: "እድገት",
  },
  en: {
    title: "My Business",
    business: "Business",
    goal: "My goal",
    week: "This week",
    focus: "Business focus",
    adviser: "Talk to your adviser",
    noBusiness: "Business details have not been added yet.",
    noGoal: "No goal has been selected yet.",
    noAction: "No action is assigned right now.",
    noSkills: "No skill focus has been recorded yet.",
    loading: "Loading business details…",
    error: "Business details could not be loaded.",
    retry: "Try again",
    progress: "Progress",
  },
  om: {
    title: "Daldala koo",
    business: "Daldala",
    goal: "Kaayyoo koo",
    week: "Torban kana",
    focus: "Xiyyeeffannoo daldalaa",
    adviser: "Gorsaa kee waliin haasa'i",
    noBusiness: "Odeeffannoon daldalaa amma hin galmoofne.",
    noGoal: "Kaayyoon amma hin filatamne.",
    noAction: "Hojii amma hin ramadamne.",
    noSkills: "Xiyyeeffannoon dandeettii amma hin galmoofne.",
    loading: "Odeeffannoo daldalaa fe'aa jira…",
    error: "Odeeffannoon daldalaa fe'amuu hin dandeenye.",
    retry: "Irra deebi'i",
    progress: "Adeemsa",
  },
  so: {
    title: "Ganacsigayga",
    business: "Ganacsi",
    goal: "Hadafkayga",
    week: "Toddobaadkan",
    focus: "Diiradda ganacsiga",
    adviser: "La hadal la-taliyahaaga",
    noBusiness: "Faahfaahinta ganacsiga weli lama diiwaangelin.",
    noGoal: "Hadaf weli lama dooran.",
    noAction: "Hawl hadda laguma darin.",
    noSkills: "Xirfad diiradda la saaray weli lama diiwaangelin.",
    loading: "Faahfaahinta ganacsiga waa la rarayaa…",
    error: "Faahfaahinta ganacsiga lama soo rari karin.",
    retry: "Mar kale isku day",
    progress: "Horumar",
  },
} as const;

const skillLabels = {
  cash_flow: {
    am: "የገንዘብ ፍሰት",
    en: "Cash flow",
    om: "Sochii maallaqaa",
    so: "Socodka lacagta",
  },
  pricing: {
    am: "ዋጋ አወጣጥ",
    en: "Pricing",
    om: "Gatii murteessuu",
    so: "Qiimeyn",
  },
  record_keeping: {
    am: "የመዝገብ አያያዝ",
    en: "Record keeping",
    om: "Galmee qabachuu",
    so: "Diiwaangelin",
  },
} as const;

const statusWords = {
  am: {
    needs_support: "ትኩረት ያስፈልጋል",
    developing: "በሂደት ላይ",
    understands: "ተረድቷል",
    applied: "በንግድ ላይ ተተግብሯል",
    unknown: "ገና አልተገመገመም",
  },
  en: {
    needs_support: "Needs attention",
    developing: "In progress",
    understands: "Understood",
    applied: "Applied in business",
    unknown: "Not assessed yet",
  },
  om: {
    needs_support: "Xiyyeeffannoo barbaada",
    developing: "Adeemsa irra jira",
    understands: "Hubatameera",
    applied: "Daldala keessatti hojiirra oole",
    unknown: "Hin madaalamne",
  },
  so: {
    needs_support: "Waxay u baahan tahay fiiro",
    developing: "Wuu socdaa",
    understands: "Waa la fahmay",
    applied: "Ganacsiga ayaa lagu dabaqay",
    unknown: "Weli lama qiimeyn",
  },
} as const;

const statusTone: Record<string, string> = {
  needs_support: "text-text-primary",
  developing: "text-info",
  understands: "text-success",
  applied: "text-success",
  unknown: "text-text-secondary",
};

export function BusinessOverview() {
  const { locale } = useLocaleSwitch();
  const t = copy[locale];
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<Dashboard>("/me/dashboard"),
  });
  const skills = useQuery({
    queryKey: ["skill-status"],
    queryFn: () => apiFetch<Skill[]>("/me/skill-status"),
  });

  return (
    <div className="bg-background text-secondary">
      <div className="mx-auto max-w-[1280px]">
        {!q.isPending && !q.isError && (
          <div className="mb-4 max-w-3xl">
            <StoredBusinessTextNote language={locale} />
          </div>
        )}
        {q.isPending ? (
          <p
            className="border-l-2 border-border-soft py-2 pl-5 text-text-secondary"
            aria-busy="true"
          >
            {t.loading}
          </p>
        ) : q.isError ? (
          <section
            role="alert"
            className="max-w-2xl border-l-2 border-destructive py-2 pl-5"
          >
            <p>{t.error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void q.refetch()}
            >
              {t.retry}
            </Button>
          </section>
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <section className="rounded-2xl border border-border-soft bg-surface p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                  {t.business}
                </p>
                <h2 className="mt-3 text-2xl font-bold">
                  {q.data.business_name || t.noBusiness}
                </h2>
                {(q.data.business_type || q.data.business_stage) && (
                  <p className="mt-2 text-text-secondary">
                    {[q.data.business_type, q.data.business_stage]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <div className="mt-4 rounded-xl border border-border-soft bg-background p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                    {t.goal}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold">
                    {q.data.goal?.title ?? t.noGoal}
                  </h3>
                  {q.data.goal?.description && (
                    <p className="mt-2 leading-6 text-text-secondary">
                      {q.data.goal.description}
                    </p>
                  )}
                </div>
              </section>
              <section className="rounded-2xl border border-border-soft bg-surface p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                  {t.week}
                </p>
                <h2 className="mt-3 text-xl font-semibold">
                  {q.data.current_action?.title ?? t.noAction}
                </h2>
                {q.data.current_action && (
                  <>
                    <p className="mt-2 text-text-secondary">
                      {q.data.current_action.description}
                    </p>
                    {q.data.current_action.target_count != null && (
                      <div className="mt-5">
                        <div
                          className="flex gap-2"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={q.data.current_action.target_count}
                          aria-valuenow={Math.min(
                            q.data.current_action.progress_count ?? 0,
                            q.data.current_action.target_count,
                          )}
                          aria-label={`${t.progress}: ${q.data.current_action.progress_count ?? 0} of ${q.data.current_action.target_count}`}
                        >
                          {Array.from(
                            {
                              length: Math.min(
                                q.data.current_action.target_count,
                                20,
                              ),
                            },
                            (_, index) => (
                              <span
                                key={index}
                                className={
                                  index <
                                  (q.data.current_action?.progress_count ?? 0)
                                    ? "size-4 rounded-full bg-success"
                                    : "size-4 rounded-full border-2 border-border-strong"
                                }
                              />
                            ),
                          )}
                        </div>
                        <p className="mt-3 text-sm font-semibold">
                          {q.data.current_action.progress_count ?? 0} /{" "}
                          {q.data.current_action.target_count}
                        </p>
                      </div>
                    )}
                  </>
                )}
                <div className="mt-4 border-t border-border-soft pt-5">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                    {t.focus}
                  </h2>
                  {skills.isPending ? (
                    <p
                      className="mt-3 text-sm text-text-secondary"
                      aria-busy="true"
                    >
                      {t.loading}
                    </p>
                  ) : skills.isError ? (
                    <p
                      className="mt-3 text-sm text-text-secondary"
                      role="status"
                    >
                      {t.noSkills}
                    </p>
                  ) : skills.data.length ? (
                    <ul className="mt-3 divide-y divide-border-soft">
                      {skills.data.map((skill) => {
                        const status =
                          skill.status in statusWords[locale]
                            ? (skill.status as keyof typeof statusWords.am)
                            : "unknown";
                        const translatedSkill =
                          skillLabels[
                            skill.skill_key as keyof typeof skillLabels
                          ]?.[locale];
                        return (
                          <li
                            key={skill.skill_key}
                            className="flex items-center justify-between gap-4 py-3"
                          >
                            <span className="font-medium">
                              {translatedSkill ??
                                skill.skill_key.replaceAll("_", " ")}
                            </span>
                            <span className="flex items-center gap-2 text-right text-sm font-medium">
                              <span
                                className={`size-2 shrink-0 rounded-full ${skill.status === "needs_support" ? "bg-warning" : skill.status === "applied" || skill.status === "understands" ? "bg-success" : skill.status === "developing" ? "bg-info" : "bg-border-strong"}`}
                                aria-hidden
                              />
                              <span className={statusTone[status]}>
                                {statusWords[locale][status]}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-text-secondary">
                      {t.noSkills}
                    </p>
                  )}
                </div>
              </section>
            </div>
            <Button asChild className="mt-6 min-h-12 px-5">
              <Link href="/chat">
                <MessageCircle className="size-4" />
                {t.adviser}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
