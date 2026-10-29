"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ExternalLink, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { Wordmark } from "@/components/brand/wordmark";
import { LocaleToggle } from "@/components/locale-toggle";
import { OfflineBanner } from "@/components/offline-banner";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { authKeys, getMe, logout } from "../api";

const NAV = [
  { href: "/admin", key: "overview" }, { href: "/admin/documents", key: "documents" },
  { href: "/admin/learning/skills", key: "learningSkills" }, { href: "/admin/learning/resources", key: "learningResources" },
  { href: "/admin/entrepreneurs", key: "entrepreneurs" }, { href: "/admin/adviser-queue", key: "adviserQueue" },
  { href: "/admin/advisers", key: "advisers" }, { href: "/admin/notifications", key: "notifications" },
  { href: "/admin/knowledge-gaps", key: "knowledgeGaps" },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: authKeys.me, queryFn: getMe, staleTime: 60_000 });
  const unauthorized = isApiError(me.error, 401);
  useEffect(() => { if (unauthorized) router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`); }, [unauthorized, pathname, router]);
  const signOut = useMutation({ mutationFn: logout, onSettled: () => { queryClient.clear(); router.replace("/admin/login"); }, onError: (err) => toast.error(errorMessage(err, t("common.genericError"))) });
  if (me.isPending || unauthorized) return <div className="flex min-h-dvh items-center justify-center" aria-busy="true"><Wordmark className="animate-pulse text-2xl" /><span className="sr-only">{t("common.loading")}</span></div>;
  if (me.isError) return <div className="flex min-h-dvh items-center justify-center px-6"><div role="alert" className="max-w-sm text-center"><AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden /><p className="font-semibold text-secondary">{errorMessage(me.error, t("common.genericError"), t("common.networkError"))}</p><Button className="mt-4" variant="outline" onClick={() => me.refetch()}>{t("common.retry")}</Button></div></div>;
  const nav = <nav aria-label={t("admin.navLabel")} className="flex gap-1 md:block md:space-y-1">{NAV.map((item) => { const active = pathname === item.href; return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex items-center whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors", active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/[0.07] hover:text-secondary")}>{t(`admin.${item.key}`)}</Link>; })}</nav>;
  return <div className="flex min-h-dvh bg-muted/40"><aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-background px-4 py-5 md:flex"><Link href="/admin" className="mb-8 flex items-center gap-2 px-2"><Wordmark showProduct={false} /><span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-secondary-foreground">{t("admin.console")}</span></Link>{nav}<div className="mt-auto space-y-2 border-t border-border pt-4"><Button asChild variant="ghost" size="sm" className="w-full justify-start"><Link href="/" target="_blank">{t("admin.openChat")}<ExternalLink /></Link></Button><LocaleToggle className="ml-2" /><Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => signOut.mutate()} disabled={signOut.isPending}><LogOut /><span>{t("admin.logout")}</span></Button></div></aside><div className="flex min-w-0 flex-1 flex-col"><header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur md:hidden"><div className="flex h-16 items-center justify-between px-4"><Link href="/admin"><Wordmark showProduct={false} /></Link><div className="flex items-center gap-2"><LocaleToggle /><Button variant="ghost" size="icon" onClick={() => signOut.mutate()} aria-label={t("admin.logout")}><LogOut /></Button></div></div><div className="overflow-x-auto px-4 pb-3">{nav}</div></header><OfflineBanner /><main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main></div></div>;
}
