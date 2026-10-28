"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useDemoSession } from "@/features/work/demo-session";
import { useWorkCopy } from "@/features/work/copy";

export function EntrepreneurProfilePanel() {
  const { t } = useWorkCopy();
  const demo = useDemoSession();
  const client = useQueryClient();
  const memory = useQuery({
    queryKey: ["memory"],
    queryFn: () =>
      apiFetch<{ enabled: boolean; revision: number }>("/me/memory"),
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch<{ enabled: boolean; revision: number }>("/me/memory", {
        method: "PATCH",
        body: { revision: memory.data?.revision, enabled },
      }),
    onSuccess: (data) => client.setQueryData(["memory"], data),
    onError: (error: Error) => {
      toast.error(error.message);
      void memory.refetch();
    },
  });
  return (
    <div className="space-y-5 py-2">
      <label className="block text-xs font-medium">
        {t.demoProfile}
        <select
          aria-label={t.demoProfile}
          className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          value={demo.selected}
          disabled={demo.switching}
          onChange={(event) => demo.select(event.target.value)}
        >
          {demo.profiles.map((profile) => (
            <option key={profile.key} value={profile.key}>
              {profile.name} · {profile.business_name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-4 text-sm">
        <span>{t.enableMemory}</span>
        <input
          type="checkbox"
          role="switch"
          aria-label={t.enableMemory}
          checked={memory.data?.enabled ?? false}
          disabled={memory.isPending || memory.isError || update.isPending}
          onChange={(event) => update.mutate(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="relative h-6 w-11 shrink-0 rounded-full bg-slate-200 transition-colors after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-brand-primary peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
        />
      </label>
      {memory.isError && (
        <p role="alert" className="text-xs text-destructive">
          {t.error}
        </p>
      )}
    </div>
  );
}
