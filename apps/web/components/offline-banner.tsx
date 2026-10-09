"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";

/** Thin banner shown while the browser is offline. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const t = useTranslations("common");
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-secondary px-4 py-2 text-center text-sm font-medium text-secondary-foreground"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      {t("offline")}
    </div>
  );
}
