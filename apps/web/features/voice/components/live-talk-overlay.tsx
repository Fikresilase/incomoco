"use client";

import { Info, Mic, MicOff, PhoneOff, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { useLiveTalk } from "../hooks/use-live-talk";
import { Orb } from "./orb";

type LiveTalk = ReturnType<typeof useLiveTalk>;

export function LiveTalkOverlay({
  open,
  live,
  onClose,
  onReconnect,
}: {
  open: boolean;
  live: LiveTalk;
  onClose: () => void;
  onReconnect: () => void;
}) {
  const t = useTranslations("voice");
  const tc = useTranslations("common");
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [live.lines]);

  const statusLabel =
    live.status === "error"
      ? (live.error ?? t("connectionError"))
      : live.muted
        ? t("muted")
        : {
            idle: "",
            connecting: t("connecting"),
            listening: t("listening"),
            thinking: t("thinking"),
            speaking: t("speaking"),
          }[live.status];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-background p-0 ring-0 sm:max-w-none"
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <DialogTitle className="text-base font-bold text-secondary">{t("liveTalk")}</DialogTitle>
          <DialogDescription className="sr-only">{t("liveTalkDescription")}</DialogDescription>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("end")}>
            <X className="size-5" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center px-4">
          <div className="flex flex-1 flex-col items-center justify-center pt-2">
            <Orb status={live.status} levelRef={live.levelRef} muted={live.muted} />
            <p
              role="status"
              className={cn(
                "mt-6 min-h-6 text-center text-base font-semibold",
                live.status === "error" ? "text-destructive" : "text-secondary"
              )}
            >
              {statusLabel}
            </p>
            {live.status === "listening" && live.lines.length === 0 && !live.notice && (
              <p className="mt-1 text-center text-sm text-muted-foreground">{t("startHint")}</p>
            )}
            {live.notice && live.status !== "error" && (
              <p className="mt-2 flex items-center gap-1.5 text-center text-sm text-muted-foreground">
                <Info className="size-4 text-violet" aria-hidden />
                {live.notice}
              </p>
            )}
            {live.status === "error" && (
              <Button variant="outline" className="mt-4" onClick={onReconnect}>
                <RotateCcw />
                {t("reconnect")}
              </Button>
            )}
          </div>

          {/* Live transcript */}
          <div
            ref={transcriptRef}
            aria-label={t("transcriptLabel")}
            aria-live="polite"
            className="scrollbar-thin mb-4 max-h-[34vh] w-full max-w-2xl shrink-0 space-y-3 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_24px)] pt-6"
          >
            {live.lines.map((line) =>
              line.role === "user" ? (
                <div key={line.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-4 py-2 text-sm leading-6 text-secondary-foreground">
                    {line.pending ? (
                      <span className="inline-flex gap-1 py-1" aria-label={t("thinking")}>
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="size-1.5 animate-bounce rounded-full bg-secondary-foreground/70"
                            style={{ animationDelay: `${i * 120}ms` }}
                          />
                        ))}
                      </span>
                    ) : (
                      line.text
                    )}
                  </p>
                </div>
              ) : (
                <div key={line.id} className="flex gap-2.5">
                  <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 text-sm leading-6 text-foreground">
                    <span className="sr-only">{tc("assistant")}: </span>
                    {line.text || <span className="text-muted-foreground">…</span>}
                    {line.interrupted && (
                      <span className="ml-2 text-xs font-medium text-muted-foreground">
                        ({t("interrupted")})
                      </span>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-center gap-6 pt-2 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-lg"
                className="size-14"
                onClick={live.toggleMute}
                disabled={live.status === "connecting" || live.status === "error"}
                aria-pressed={live.muted}
                aria-label={live.muted ? t("unmute") : t("mute")}
              >
                {live.muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{live.muted ? t("unmute") : t("mute")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="icon-lg"
                className="size-14"
                onClick={onClose}
                aria-label={t("end")}
              >
                <PhoneOff className="size-6" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("end")}</TooltipContent>
          </Tooltip>
        </div>
      </DialogContent>
    </Dialog>
  );
}
