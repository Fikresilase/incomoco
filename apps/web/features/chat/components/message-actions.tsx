"use client";
import { Loader2, Square, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isPersisted, type UIMessage } from "../types";
export function MessageActions({ message, readAloud }: { message: UIMessage; canRegenerate?: boolean; onRegenerate?: () => void; readAloud: { supported: boolean; playing: boolean; loading: boolean; toggle: () => void } }) { const t = useTranslations("chat"); if (!isPersisted(message) || !readAloud.supported) return null; const label = readAloud.loading ? t("loadingAudio") : readAloud.playing ? t("stopReading") : t("readAloud"); return <div className="mt-2"><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={label} aria-pressed={readAloud.playing} disabled={readAloud.loading} onClick={readAloud.toggle}>{readAloud.loading ? <Loader2 className="animate-spin" /> : readAloud.playing ? <Square className="fill-current" /> : <Volume2 />}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip></div>; }
