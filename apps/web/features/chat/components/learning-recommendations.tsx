"use client";

import { BookOpen, FileText, Headphones, PlaySquare } from "lucide-react";
import Link from "next/link";
import type { LearningRecommendation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useEffect } from "react";

const ICONS = { audio: Headphones, video: PlaySquare, document: FileText, guideline: FileText, text_lesson: BookOpen };

export function LearningRecommendations({ items, messageId }: { items: LearningRecommendation[]; messageId: string }) {
  useEffect(() => {
    void Promise.all(items.map((item) => apiFetch<void>(`/learning/resources/${item.resource_id}/events?event_type=learning_recommendation_shown&message_id=${messageId}`, { method: "POST" }).catch(() => undefined)));
  }, [items, messageId]);
  if (!items.length) return null;
  return <section className="mt-3 space-y-2" aria-label="Recommended for you">
    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Recommended for you</p>
    {items.map((item) => { const Icon = ICONS[item.resource_type]; return <div key={item.resource_id} className="rounded-lg border border-border bg-card p-3">
      <div className="flex gap-3"><Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><div className="min-w-0 flex-1"><p className="font-semibold text-secondary">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.description}</p><p className="mt-2 text-xs text-muted-foreground">{item.resource_type.replace("_", " ")} · {item.language.toUpperCase()}{item.duration_seconds ? ` · ${Math.ceil(item.duration_seconds / 60)} min` : ""}</p></div></div>
      <Button asChild size="sm" className="mt-3"><Link href={`/learning/resources/${item.resource_id}?message_id=${messageId}`}>Open resource</Link></Button>
    </div>; })}
  </section>;
}
