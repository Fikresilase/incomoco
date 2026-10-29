"use client";

import Link from "next/link";
import { Bell, BookOpen, MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Wordmark } from "@/components/brand/wordmark";
import { LocaleToggle } from "@/components/locale-toggle";
import { humanApi } from "../api";

export function AdviserNav({ active }: { active: "messages" | "notifications" | "courses" }) {
  const unread = useQuery({ queryKey: ["adviser-notification-count"], queryFn: humanApi.notificationCount, staleTime: 10_000 });
  return <header className="sticky top-0 z-30 border-b border-border-soft bg-surface/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-8"><Link href="/adviser" aria-label="Inkomoko"><Wordmark showProduct={false} /></Link><nav className="ml-auto flex items-center gap-1"><Link href="/adviser" className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${active === "messages" ? "bg-surface-navy text-brand-primary" : "text-text-secondary hover:bg-surface-soft"}`}><MessageCircle className="size-4" />Messages</Link><Link href="/adviser/courses" className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${active === "courses" ? "bg-surface-navy text-brand-primary" : "text-text-secondary hover:bg-surface-soft"}`}><BookOpen className="size-4" />Courses</Link><Link href="/adviser/notifications" className={`relative inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${active === "notifications" ? "bg-surface-navy text-brand-primary" : "text-text-secondary hover:bg-surface-soft"}`}><Bell className="size-4" />Notifications{(unread.data?.count ?? 0) > 0 && <span className="size-2 rounded-full bg-brand-accent" />}</Link><LocaleToggle className="scale-95" /></nav></div></header>;
}
