"use client";

import { AudioLines } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveTalk } from "../hooks/use-live-talk";
import { LiveTalkOverlay } from "./live-talk-overlay";
import type { Lang } from "@/lib/api";

export interface LiveTalkButtonProps {
  conversationId: string | null;
  lang: Lang;
  disabled?: boolean;
  /** Called after the session ends with the conversation the voice turns were saved to. */
  onEnded: (conversationId: string | null) => void;
}

/** Opens the full-screen live talk overlay. */
export function LiveTalkButton({ conversationId, lang, disabled, onEnded }: LiveTalkButtonProps) {
  const t = useTranslations("voice");
  const live = useLiveTalk();
  const [open, setOpen] = useState(false);

  const openOverlay = () => {
    setOpen(true);
    live.start(conversationId, lang);
  };

  const close = () => {
    const id = live.end() ?? conversationId;
    setOpen(false);
    onEnded(id);
  };

  const reconnect = () => {
    live.start(live.currentConversationId() ?? conversationId, lang);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={openOverlay}
            disabled={disabled}
            aria-label={t("liveTalk")}
            className="text-primary hover:bg-primary/10 hover:text-primary"
          >
            <AudioLines className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("liveTalk")}</TooltipContent>
      </Tooltip>
      <LiveTalkOverlay open={open} live={live} onClose={close} onReconnect={reconnect} />
    </>
  );
}
