"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { LocaleToggle } from "@/components/locale-toggle";
import { OfflineBanner } from "@/components/offline-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isApiError } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { authKeys, login } from "../api";

/** Only allow same-origin admin paths as the post-login destination. */
function safeNext(value: string | null): string {
  if (value && value.startsWith("/admin") && !value.startsWith("//")) return value;
  return "/admin";
}

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const expired = searchParams.get("expired") === "1";

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
      router.replace(safeNext(searchParams.get("next")));
    },
  });

  const errorText = mutation.error
    ? isApiError(mutation.error, 401)
      ? t("admin.login.invalid")
      : errorMessage(mutation.error, t("admin.login.error"), t("common.networkError"))
    : null;

  return (
    <div className="flex min-h-dvh flex-col bg-muted/50">
      <OfflineBanner />
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Link href="/" className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none">
          <Wordmark />
        </Link>
        <LocaleToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <Card className="w-full max-w-sm animate-in py-8 shadow-sm duration-300 fade-in slide-in-from-bottom-2">
          <CardHeader className="px-7">
            <span aria-hidden className="mb-3 block h-1 w-8 rounded-full bg-primary" />
            <CardTitle className="text-xl font-bold text-secondary">{t("admin.login.title")}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {t("admin.login.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-7">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({ username: username.trim(), password });
              }}
              noValidate
            >
              {(errorText || expired) && (
                <p
                  role="alert"
                  className={
                    errorText
                      ? "flex items-start gap-2 rounded-lg bg-destructive/5 px-3 py-2 text-sm text-destructive"
                      : "flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2 text-sm text-secondary"
                  }
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {errorText ?? t("admin.sessionExpired")}
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="username" className="font-semibold text-secondary">
                  {t("admin.login.username")}
                </Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  autoFocus
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-invalid={Boolean(errorText) || undefined}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="font-semibold text-secondary">
                  {t("admin.login.password")}
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={Boolean(errorText) || undefined}
                  className="h-11"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={mutation.isPending || !username.trim() || !password}
              >
                {mutation.isPending && <Loader2 className="animate-spin" />}
                {mutation.isPending ? t("admin.login.submitting") : t("admin.login.submit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
