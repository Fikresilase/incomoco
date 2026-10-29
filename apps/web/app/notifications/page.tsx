"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { EntrepreneurNav } from "@/features/entrepreneur/components/entrepreneur-nav";
import { humanApi } from "@/features/human/api";

const labels: Record<string, string> = { new_human_message: "New message from your adviser", new_voice_note: "New voice note from your adviser", adviser_assigned: "You have a new adviser", adviser_reassigned: "Your adviser assignment changed", adviser_recommendation: "Your adviser recommended a course" };

export default function NotificationsPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["human-notifications"], queryFn: humanApi.notifications });
  const mark = useMutation({ mutationFn: humanApi.markNotificationRead, onSuccess: () => { void client.invalidateQueries({ queryKey: ["human-notifications"] }); void client.invalidateQueries({ queryKey: ["human-notification-count"] }); } });
  return <div className="min-h-dvh bg-background text-secondary"><EntrepreneurNav active="adviser" /><main className="mx-auto max-w-3xl px-4 py-8 sm:px-8"><header><p className="text-sm font-semibold text-brand-accent">Your support</p><h1 className="mt-1 text-3xl font-semibold">Notifications</h1></header><section className="mt-6 divide-y divide-border-soft rounded-2xl border border-border-soft bg-surface">{query.isPending ? <p className="p-6 text-text-secondary">Loading notifications...</p> : query.data?.length ? query.data.map((item) => <article key={item.id} className={`flex items-start gap-4 p-5 ${item.read_at ? "opacity-60" : ""}`}><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-coral text-brand-accent"><Bell className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-medium">{item.title ?? labels[item.event_type] ?? "You have a new update"}</p>{item.body && <p className="mt-1 text-sm text-text-secondary">{item.body}</p>}<p className="mt-1 text-xs text-text-secondary">{new Date(item.created_at).toLocaleString()}</p></div>{!item.read_at && <button type="button" aria-label="Mark as read" onClick={() => mark.mutate(item.id)} className="rounded-full p-2 text-brand-primary hover:bg-surface-navy"><Check className="size-4" /></button>}</article>) : <p className="p-8 text-center text-text-secondary">You have no notifications yet.</p>}</section></main></div>;
}
