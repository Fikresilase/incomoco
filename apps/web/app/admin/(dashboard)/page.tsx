"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, BriefcaseBusiness, MessageCircle, Users } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Overview = {
  registered_entrepreneurs: number;
  active_entrepreneurs: number;
  assigned_entrepreneurs: number;
  unassigned_entrepreneurs: number;
  learning_active_entrepreneurs: number;
  completed_learning_resources: number;
  active_business_goals: number;
  completed_business_actions: number;
  entrepreneurs_needing_follow_up: number;
  entrepreneurs_in_recent_conversations: number;
  adviser_recommendations: number;
  recommendations_completed: number;
  adviser_workloads: { id: string; name: string; assigned: number }[];
};

const measures: { key: Exclude<keyof Overview, "adviser_workloads">; label: string; detail: string }[] = [
  { key: "registered_entrepreneurs", label: "Registered entrepreneurs", detail: "Non-demo accounts in your organization" },
  { key: "active_entrepreneurs", label: "Active entrepreneurs", detail: "Learning, completed action, or human message in 30 days" },
  { key: "assigned_entrepreneurs", label: "Assigned to advisers", detail: "Currently assigned entrepreneurs" },
  { key: "unassigned_entrepreneurs", label: "Awaiting assignment", detail: "Registered entrepreneurs without an active adviser" },
  { key: "entrepreneurs_needing_follow_up", label: "Need follow-up", detail: "Entrepreneurs with an action marked needs help" },
  { key: "learning_active_entrepreneurs", label: "Learning recently", detail: "Distinct entrepreneurs with learning activity in 30 days" },
  { key: "completed_learning_resources", label: "Resources completed", detail: "Completed resource records, not distinct people" },
  { key: "active_business_goals", label: "Active business goals", detail: "Goals currently marked active" },
  { key: "completed_business_actions", label: "Actions completed", detail: "Business actions marked completed" },
  { key: "entrepreneurs_in_recent_conversations", label: "Recent human conversations", detail: "Distinct entrepreneurs messaged in 30 days" },
  { key: "adviser_recommendations", label: "Course recommendations", detail: "Approved resources recommended by advisers" },
  { key: "recommendations_completed", label: "Recommendations completed", detail: "Recommended resources later completed by entrepreneurs" },
];

export default function AdminOverviewPage() {
  const overview = useQuery({
    queryKey: ["admin", "mvp-overview"],
    queryFn: () => apiFetch<Overview>("/admin/mvp-overview"),
    meta: { requiresAdmin: true },
  });

  return (
    <main className="mx-auto max-w-6xl space-y-8 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Management overview</p>
          <h1 className="mt-1 text-2xl font-bold text-secondary">Entrepreneur support</h1>
          <p className="mt-2 text-sm text-muted-foreground">Real activity in your organization. Recent means the last 30 days.</p>
        </div>
        <Link href="/admin/advisers" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-secondary px-4 text-sm font-semibold text-white hover:opacity-90">
          Manage advisers <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {overview.isPending ? <p role="status">Loading organization activity...</p> : null}
      {overview.isError ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <p>Organization activity could not be loaded.</p>
          <button className="mt-2 text-sm font-semibold underline" onClick={() => overview.refetch()}>Retry</button>
        </div>
      ) : null}
      {overview.data ? (
        <>
          <section aria-label="Organization measures" className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
            {measures.map(({ key, label, detail }) => (
              <div key={key} className="min-w-0 bg-card p-5">
                <p className="text-sm font-semibold text-secondary">{label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-secondary">{overview.data![key]}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-secondary"><Users className="size-5" aria-hidden /><h2 className="text-lg font-bold">Adviser workload</h2></div>
              {overview.data.adviser_workloads.length ? (
                <ul className="divide-y rounded-md border bg-card">
                  {overview.data.adviser_workloads.map((item) => <li key={item.id} className="flex justify-between gap-4 px-4 py-3 text-sm"><span>{item.name}</span><strong>{item.assigned} assigned</strong></li>)}
                </ul>
              ) : <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">No active adviser assignments yet.</p>}
            </section>
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-secondary"><BriefcaseBusiness className="size-5" aria-hidden /><h2 className="text-lg font-bold">Next actions</h2></div>
              <div className="grid gap-2">
                <Link className="flex min-h-12 items-center gap-3 rounded-md border bg-card px-4 text-sm font-semibold hover:bg-muted" href="/admin/entrepreneurs"><Users className="size-4" aria-hidden /> Review entrepreneurs <ArrowRight className="ml-auto size-4" aria-hidden /></Link>
                <Link className="flex min-h-12 items-center gap-3 rounded-md border bg-card px-4 text-sm font-semibold hover:bg-muted" href="/admin/adviser-queue"><MessageCircle className="size-4" aria-hidden /> Follow-up queue <ArrowRight className="ml-auto size-4" aria-hidden /></Link>
                <Link className="flex min-h-12 items-center gap-3 rounded-md border bg-card px-4 text-sm font-semibold hover:bg-muted" href="/admin/learning/resources"><BookOpen className="size-4" aria-hidden /> Approved learning <ArrowRight className="ml-auto size-4" aria-hidden /></Link>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
