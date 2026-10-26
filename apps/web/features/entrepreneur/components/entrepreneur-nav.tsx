"use client";

import Link from "next/link";
import { Bell, BriefcaseBusiness, House, MessageCircle, BookOpen } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { LocaleToggle } from "@/components/locale-toggle";
import { useLocaleSwitch } from "@/lib/i18n/provider";

const copy = {
  am: { adviser: "አማካሪ", today: "ዛሬ", learn: "ትምህርት", business: "የእኔ ንግድ" },
  en: { adviser: "Adviser", today: "Today", learn: "Learn", business: "My Business" },
  om: { adviser: "Gorsaa", today: "Har'a", learn: "Barnoota", business: "Daldala koo" },
  so: { adviser: "La-taliye", today: "Maanta", learn: "Barasho", business: "Ganacsigayga" },
} as const;

export function EntrepreneurNav({ active }: { active: "adviser" | "home" | "learn" | "business" }) {
  const { locale } = useLocaleSwitch();
  const t = copy[locale];
  const items = [
    ["/chat", t.adviser, "adviser", MessageCircle],
    ["/home", t.today, "home", House],
    ["/learn", t.learn, "learn", BookOpen],
    ["/my-business", t.business, "business", BriefcaseBusiness],
  ] as const;
  return <>
    <header className="sticky top-0 z-30 border-b border-border-soft bg-surface/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-8"><Link href="/welcome" aria-label="Inkomoko"><Wordmark showProduct={false} /></Link><div className="flex items-center gap-2"><nav aria-label="Entrepreneur navigation" className="hidden items-center gap-1 md:flex">{items.map(([href, label, key]) => <Link key={href} href={href} aria-current={active === key ? "page" : undefined} className={active === key ? "inline-flex items-center gap-2 rounded-lg bg-surface-navy px-4 py-2.5 text-sm font-semibold text-brand-primary" : "rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-soft hover:text-brand-primary"}>{active === key && <span className="size-1.5 rounded-full bg-brand-accent" aria-hidden />}{label}</Link>)}</nav><button type="button" disabled aria-label="Messages coming soon" title="Messages coming soon" className="hidden size-10 items-center justify-center rounded-lg text-text-secondary opacity-60 md:inline-flex"><MessageCircle className="size-4" /></button><button type="button" disabled aria-label="Notifications coming soon" title="Notifications coming soon" className="hidden size-10 items-center justify-center rounded-lg text-text-secondary opacity-60 md:inline-flex"><Bell className="size-4" /></button><LocaleToggle className="scale-95" /></div></div></header>
    <nav aria-label="Entrepreneur navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border-soft bg-surface px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-4px_16px_rgba(11,42,91,0.06)] md:hidden">{items.map(([href, label, key, Icon]) => <Link key={href} href={href} aria-current={active === key ? "page" : undefined} className={active === key ? "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-brand-primary" : "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-text-secondary"}><Icon className="size-5" aria-hidden /><span className="max-w-full truncate px-1 text-[11px] font-semibold leading-4">{label}</span>{active === key && <span className="size-1 rounded-full bg-brand-accent" aria-hidden />}</Link>)}</nav>
  </>;
}
