"use client";

import { useMutation } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Rating } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { sendFeedback } from "../api";
import { isPersisted, type UIMessage } from "../types";
import { SHOW_SOURCES, withoutCitations } from "../config";

function ActionButton({
  label,
  onClick,
  pressed,
  disabled,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className={cn("text-muted-foreground hover:text-secondary", className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export interface MessageActionsProps {
  message: UIMessage;
  canRegenerate: boolean;
  onRegenerate: () => void;
  readAloud: {
    playing: boolean;
    loading: boolean;
    toggle: () => void;
  };
}

/** 👍/👎, copy, regenerate, read aloud. */
export function MessageActions({
  message,
  canRegenerate,
  onRegenerate,
  readAloud,
}: MessageActionsProps) {
  const t = useTranslations("chat");
  const [rating, setRating] = useState<Rating | null>(message.feedback);
  const [copied, setCopied] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");
  const persisted = isPersisted(message);

  const feedback = useMutation({
    mutationFn: (body: { rating: Rating; comment?: string }) =>
      sendFeedback(message.id, body),
    onError: (err, _vars, previous) => {
      toast.error(errorMessage(err, t("feedbackError")));
      setRating((previous as Rating | null | undefined) ?? null);
    },
    onMutate: () => rating,
  });

  const rate = (value: Rating) => {
    if (!persisted) return;
    setRating(value);
    feedback.mutate({ rating: value });
    if (value === -1) setCommentOpen(true);
    else toast.success(t("feedbackThanks"));
  };

  const submitComment = () => {
    const text = comment.trim();
    setCommentOpen(false);
    if (text) feedback.mutate({ rating: -1, comment: text });
    toast.success(t("feedbackThanks"));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SHOW_SOURCES ? message.content : withoutCitations(message.content));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("copyError"));
    }
  };

  return (
    <div className="-ml-2 flex flex-wrap items-center gap-0.5">
      <ActionButton
        label={t("helpful")}
        pressed={rating === 1}
        disabled={!persisted}
        onClick={() => rate(1)}
        className={rating === 1 ? "text-success" : undefined}
      >
        <ThumbsUp className={cn(rating === 1 && "fill-current")} />
      </ActionButton>

      <Popover open={commentOpen} onOpenChange={setCommentOpen}>
        <PopoverAnchor asChild>
          <span className="inline-flex">
            <ActionButton
              label={t("notHelpful")}
              pressed={rating === -1}
              disabled={!persisted}
              onClick={() => rate(-1)}
              className={rating === -1 ? "text-destructive" : undefined}
            >
              <ThumbsDown className={cn(rating === -1 && "fill-current")} />
            </ActionButton>
          </span>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-80">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitComment();
            }}
          >
            <Label htmlFor={`fb-${message.id}`} className="text-sm font-semibold text-secondary">
              {t("feedbackCommentLabel")}
            </Label>
            <Textarea
              id={`fb-${message.id}`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("feedbackCommentPlaceholder")}
              maxLength={1000}
              className="min-h-20 text-sm"
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm">
                {t("feedbackSubmit")}
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>

      <ActionButton label={copied ? t("copied") : t("copy")} onClick={copy}>
        {copied ? <Check /> : <Copy />}
      </ActionButton>

      {canRegenerate && (
        <ActionButton label={t("regenerate")} onClick={onRegenerate}>
          <RefreshCw />
        </ActionButton>
      )}

      <ActionButton
        label={
          readAloud.loading
            ? t("loadingAudio")
            : readAloud.playing
              ? t("stopReading")
              : t("readAloud")
        }
        pressed={readAloud.playing}
        disabled={!persisted}
        onClick={readAloud.toggle}
        className={readAloud.playing ? "text-primary" : undefined}
      >
        {readAloud.loading ? (
          <Loader2 className="animate-spin" />
        ) : readAloud.playing ? (
          <Square className="fill-current" />
        ) : (
          <Volume2 />
        )}
      </ActionButton>
    </div>
  );
}
