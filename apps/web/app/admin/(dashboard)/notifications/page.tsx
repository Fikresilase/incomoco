"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export default function AdminNotificationsPage() {
  const [audience, setAudience] = useState<"all" | "entrepreneurs" | "advisers">("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const broadcast = useMutation({ mutationFn: () => apiFetch<{ recipient_count: number }>("/admin/notifications/broadcast", { method: "POST", body: { audience, title, body } }), onSuccess: () => { setTitle(""); setBody(""); } });
  return <main className="mx-auto max-w-2xl space-y-6"><header><p className="text-sm font-semibold text-primary">Communication</p><h1 className="mt-1 text-3xl font-bold text-secondary">Send notification</h1><p className="mt-2 text-muted-foreground">Send an organization-scoped announcement to active users, entrepreneurs, or advisers.</p></header><section className="rounded-2xl border border-border bg-card p-6"><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); broadcast.mutate(); }}><label className="block text-sm font-medium">Audience<select value={audience} onChange={(event) => setAudience(event.target.value as "all" | "entrepreneurs" | "advisers")} className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3"><option value="all">All entrepreneurs and advisers</option><option value="entrepreneurs">Entrepreneurs only</option><option value="advisers">Advisers only</option></select></label><label className="block text-sm font-medium">Title<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3" /></label><label className="block text-sm font-medium">Message<textarea required maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} className="mt-1 min-h-32 w-full rounded-md border border-input bg-background p-3" /></label>{broadcast.isSuccess && <p role="status" className="text-sm text-green-700">Notification sent to {broadcast.data.recipient_count} users.</p>}{broadcast.isError && <p role="alert" className="text-sm text-red-700">Could not send the notification.</p>}<Button type="submit" disabled={broadcast.isPending || !title.trim() || !body.trim()}>{broadcast.isPending ? "Sending..." : "Send notification"}</Button></form></section></main>;
}
