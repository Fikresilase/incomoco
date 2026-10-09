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
  { href: "/admin", key: "overview" },
  { href: "/admin/documents", key: "documents" },
] as const;

/** Route guard + chrome for admin pages. Redirects to /admin/login on 401. */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const me = useQuery({ queryKey: authKeys.me, queryFn: getMe, staleTime: 60_000 });
  const unauthorized = isApiError(me.error, 401);

  useEffect(() => {
    if (unauthorized) {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [unauthorized, pathname, router]);

  const signOut = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear();
      router.replace("/admin/login");
    },
    onError: (err) => toast.error(errorMessage(err, t("common.genericError"))),
  });

  if (me.isPending || unauthorized) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <Wordmark className="animate-pulse text-2xl" />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  if (me.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div role="alert" className="max-w-sm text-center">
          <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden />
          <p className="font-semibold text-secondary">
            {errorMessage(me.error, t("common.genericError"), t("common.networkError"))}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => me.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-md focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
          >
            <Wordmark showProduct={false} />
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-secondary-foreground">
              {t("admin.console")}
            </span>
          </Link>
          <nav aria-label={t("admin.navLabel")} className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
                    active ? "bg-secondary/[0.07] text-secondary" : "text-muted-foreground hover:text-secondary"
                  )}
                >
                  {t(`admin.${item.key}`)}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
              <Link href="/" target="_blank">
                {t("admin.openChat")}
                <ExternalLink />
              </Link>
            </Button>
            <LocaleToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut.mutate()}
              disabled={signOut.isPending}
              aria-label={`${t("admin.logout")} (${me.data.username})`}
            >
              <LogOut />
              <span className="hidden sm:inline">{t("admin.logout")}</span>
            </Button>
          </div>
        </div>
        <nav
          aria-label={t("admin.navLabel")}
          className="flex gap-1 overflow-x-auto px-4 pb-2 sm:hidden"
        >
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap",
                  active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"
                )}
              >
                {t(`admin.${item.key}`)}
              </Link>
            );
          })}
        </nav>
      </header>
      <OfflineBanner />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
