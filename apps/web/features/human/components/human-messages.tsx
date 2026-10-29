"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mic, Play, Send, Square, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntrepreneurNav } from "@/features/entrepreneur/components/entrepreneur-nav";
import { startRecorder, type Recorder } from "@/lib/audio/recorder";
import { apiFetch } from "@/lib/api";
import { humanApi, type HumanMessage } from "../api";

type Person = { id?: string; entrepreneur_profile_id?: string; name: string; business_name: string | null; business_type: string | null; language: string };

export function HumanMessages({ adviserMode = false }: { adviserMode?: boolean }) {
  const router = useRouter();
  const client = useQueryClient();
  const people = useQuery({ queryKey: [adviserMode ? "adviser-people" : "my-assignment"], queryFn: adviserMode ? humanApi.adviserEntrepreneurs : humanApi.assignments });
  const account = useQuery({ queryKey: ["auth-account"], queryFn: () => apiFetch<{ account: { id: string } }>("/auth/me") });
  useEffect(() => { if (adviserMode && people.isError) router.replace("/adviser/login"); }, [adviserMode, people.isError, router]);
  const [selected, setSelected] = useState<string>();
  const [conversationId, setConversationId] = useState<string>();
  const [text, setText] = useState("");
  const [recording, setRecording] = useState<Recorder>();
  const [recordingMs, setRecordingMs] = useState(0);
  const list = (people.data ?? []) as Person[];
  const profileId = (item: Person | undefined) => item?.entrepreneur_profile_id ?? item?.id;
  const currentId = selected ?? profileId(list[0]);
  const current = list.find((item) => profileId(item) === currentId);
  const existing = useQuery({ queryKey: ["human-conversation", currentId], queryFn: () => humanApi.conversation(currentId!), enabled: Boolean(currentId) });
  const open = useMutation({ mutationFn: humanApi.openConversation, onSuccess: (data) => setConversationId(data.id) });
  useEffect(() => { if (existing.data === null && currentId && !open.isPending) open.mutate(currentId); }, [existing.data, currentId, open]);
  const resolvedConversationId = conversationId ?? existing.data?.id;
  const messages = useQuery({ queryKey: ["human-messages", resolvedConversationId], queryFn: () => humanApi.messages(resolvedConversationId!), enabled: Boolean(resolvedConversationId), refetchInterval: 15_000 });
  useEffect(() => {
    if (!resolvedConversationId || !messages.data) return;
    void humanApi.markRead(resolvedConversationId).then(() => {
      void client.invalidateQueries({ queryKey: ["human-notification-count"] });
      void client.invalidateQueries({ queryKey: ["human-notifications"] });
    });
  }, [client, messages.data, resolvedConversationId]);
  const send = useMutation({ mutationFn: (body: string) => humanApi.send(resolvedConversationId!, body), onSuccess: () => { setText(""); void client.invalidateQueries({ queryKey: ["human-messages", resolvedConversationId] }); } });
  const upload = useMutation({ mutationFn: (blob: Blob) => humanApi.upload(resolvedConversationId!, blob), onSuccess: () => void client.invalidateQueries({ queryKey: ["human-messages", resolvedConversationId] }) });
  const start = async () => { try { setRecording(await startRecorder()); } catch { /* browser explains microphone denial */ } };
  const stop = async () => { if (!recording) return; const result = await recording.stop(); setRecording(undefined); setRecordingMs(result.durationMs); upload.mutate(result.wav); };
  const audio = async (message: HumanMessage) => { const blob = await humanApi.audio(message.id); const url = URL.createObjectURL(blob); const player = new Audio(url); player.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true }); await player.play(); };
  const empty = !people.isPending && !people.isError && list.length === 0;
  if (people.isError) return <div className="min-h-dvh bg-background text-secondary">{!adviserMode && <EntrepreneurNav active="adviser" />}<main className="mx-auto max-w-6xl px-4 py-10 sm:px-8"><section className="rounded-2xl border border-border-soft bg-surface p-8 text-center"><h1 className="text-xl font-semibold">{adviserMode ? "Adviser sign-in required" : "Unable to load messages"}</h1><p className="mt-2 text-sm text-text-secondary">{adviserMode ? "Sign in with an active adviser account to view assigned entrepreneurs." : "Your session may have expired. Please sign in again."}</p></section></main></div>;
  return <div className="min-h-dvh bg-background text-secondary">{!adviserMode && <EntrepreneurNav active="adviser" />}<main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-8"><header><p className="text-sm font-semibold text-brand-accent">{adviserMode ? "Adviser workspace" : "Human support"}</p><h1 className="mt-1 text-3xl font-semibold">Messages</h1><p className="mt-2 text-text-secondary">{adviserMode ? "Keep in touch with the entrepreneurs assigned to you." : "Message your Inkomoko adviser privately."}</p></header>{empty ? <section className="rounded-2xl border border-border-soft bg-surface p-10 text-center"><UserRound className="mx-auto size-8 text-text-secondary" /><h2 className="mt-3 text-lg font-semibold">{adviserMode ? "No entrepreneurs assigned yet" : "No adviser assigned yet"}</h2><p className="mt-2 text-sm text-text-secondary">{adviserMode ? "Your assigned entrepreneurs will appear here after an administrator assigns them." : "Your messages will appear here when an adviser is assigned to your business."}</p></section> : <section className="grid min-h-[560px] overflow-hidden rounded-2xl border border-border-soft bg-surface lg:grid-cols-[280px_1fr]"><aside className="border-b border-border-soft lg:border-r lg:border-b-0"><div className="border-b border-border-soft p-4 text-sm font-semibold">{adviserMode ? "My entrepreneurs" : "Your adviser"}</div>{list.map((item) => { const id = profileId(item)!; return <button type="button" key={id} onClick={() => { setSelected(id); setConversationId(undefined); }} className={`w-full border-b border-border-soft p-4 text-left ${id === currentId ? "bg-surface-navy" : "hover:bg-surface-soft"}`}><p className="font-semibold">{item.name}</p><p className="mt-1 text-xs text-text-secondary">{item.business_type ?? item.business_name ?? item.language}</p></button>; })}</aside><div className="flex min-h-[560px] flex-col"><div className="border-b border-border-soft p-4"><p className="font-semibold">{current?.name}</p><p className="text-sm text-text-secondary">{current?.business_type ?? current?.business_name}</p></div><div className="flex-1 space-y-3 overflow-y-auto p-4">{existing.isPending || open.isPending || messages.isPending ? <Loader2 className="animate-spin text-text-secondary" /> : existing.isError || open.isError || messages.isError ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">We couldn&apos;t load this conversation. Please refresh and try again.</p> : (messages.data ?? []).length ? messages.data!.map((message) => { const mine = message.sender_account_id === account.data?.account.id; return <article key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${mine ? "ml-auto bg-brand-primary text-white" : "mr-auto bg-muted text-secondary"}`}><p className="mb-1 text-[11px] font-semibold opacity-70">{mine ? "You" : adviserMode ? current?.name : "Your adviser"}</p><p>{message.message_type === "audio" ? <Button variant={mine ? "secondary" : "outline"} size="sm" onClick={() => void audio(message)}><Play /> Play voice note</Button> : message.text_body}</p><time className="mt-2 block text-[11px] opacity-70">{new Date(message.created_at).toLocaleString()}</time></article>; }) : <p className="py-12 text-center text-sm text-text-secondary">Start a private conversation.</p>}</div><form className="flex items-center gap-2 border-t border-border-soft p-3" onSubmit={(event) => { event.preventDefault(); if (text.trim() && resolvedConversationId) send.mutate(text.trim()); }}><button type="button" aria-label={recording ? "Stop recording" : "Record voice note"} onClick={() => recording ? void stop() : void start()} className={`flex size-11 shrink-0 items-center justify-center rounded-full ${recording ? "bg-brand-accent text-white" : "bg-surface-navy text-brand-primary"}`}>{recording ? <Square className="size-4" /> : <Mic className="size-5" />}</button><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a message..." className="min-w-0 flex-1 rounded-full bg-muted px-4 py-3 text-sm outline-none" disabled={!resolvedConversationId} /><Button type="submit" size="icon" disabled={!text.trim() || send.isPending}><Send /></Button></form>{recordingMs > 0 && <p className="px-4 pb-3 text-xs text-text-secondary">Voice note sent.</p>}</div></section>}</main></div>;
}
