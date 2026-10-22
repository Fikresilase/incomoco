"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type Resource = { id: string; title: string; description: string; skill_key: string; resource_type: string; language: string; difficulty_level: string; media_url: string | null; source_reference: string | null };
type Media = { media_type: string; url: string; expires_in: number };

export default function LearningResourcePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const messageId = searchParams.get("message_id");
  const opened = useRef(false);
  const resource = useQuery({ queryKey: ["learning-resource", params.id], queryFn: () => apiFetch<Resource>(`/learning/resources/${params.id}`) });
  const media = useQuery({ queryKey: ["learning-resource-media", params.id], queryFn: () => apiFetch<Media>(`/learning/resources/${params.id}/media`), enabled: resource.isSuccess && resource.data.resource_type !== "text_lesson" && !resource.data.media_url });
  useEffect(() => { if (resource.data && !opened.current) { opened.current = true; const query = new URLSearchParams({ event_type: "learning_resource_opened" }); if (messageId) query.set("message_id", messageId); void apiFetch<void>(`/learning/resources/${params.id}/events?${query}`, { method: "POST" }).catch(() => undefined); } }, [resource.data, params.id, messageId]);
  if (resource.isPending) return <main className="mx-auto max-w-2xl p-6">Loading resource...</main>;
  if (resource.isError) return <main className="mx-auto max-w-2xl p-6"><p role="alert">This resource is unavailable.</p><Button asChild className="mt-4"><Link href="/chat">Back to chat</Link></Button></main>;
  const item = resource.data;
  const mediaUrl = item.media_url ?? media.data?.url;
  return <main className="mx-auto max-w-2xl space-y-5 p-6"><Button asChild variant="ghost"><Link href="/chat"><ArrowLeft /> Back to chat</Link></Button><header><p className="text-xs uppercase tracking-wide text-muted-foreground">{item.skill_key} · {item.language.toUpperCase()} · {item.difficulty_level}</p><h1 className="mt-2 text-3xl font-bold text-secondary">{item.title}</h1><p className="mt-3 text-muted-foreground">{item.description}</p></header>{item.resource_type === "text_lesson" && <article className="rounded-lg border border-border bg-card p-5 leading-7"><p>{item.description}</p><p className="mt-4 text-sm text-muted-foreground">Trainer-approved lesson content.</p></article>}{item.resource_type === "audio" && mediaUrl && <audio controls className="w-full" src={mediaUrl}><track kind="captions" /></audio>}{item.resource_type === "video" && mediaUrl && <video controls className="w-full rounded-lg" src={mediaUrl}><track kind="captions" /></video>}{item.source_reference && <p className="text-xs text-muted-foreground">Source: {item.source_reference}</p>}{item.resource_type !== "text_lesson" && !mediaUrl && <p className="text-sm text-muted-foreground">Media is not available yet.</p>}</main>;
}
