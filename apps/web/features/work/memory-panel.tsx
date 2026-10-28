"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkCopy } from "./copy";

type Memory = {
  facts: Record<string, { value: string; source: string; updated_at: string }>;
  revision: number;
  enabled: boolean;
  synced: boolean;
  pending: number;
  failed: number;
  markdown: string;
};
const keys = [
  "business_name",
  "business_type",
  "business_location",
  "business_goal",
  "business_challenge",
  "learning_preferences",
  "personal_context",
];
export function MemoryPanel() {
  const { t } = useWorkCopy();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ["memory"],
    queryFn: () => apiFetch<Memory>("/me/memory"),
    refetchInterval: 15000,
  });
  const [key, setKey] = useState(keys[0]);
  const [value, setValue] = useState("");
  const edit = useMutation({
    mutationFn: (changes: object) =>
      apiFetch("/me/memory", {
        method: "PATCH",
        body: { revision: q.data?.revision, ...changes },
      }),
    onSuccess: () => {
      setValue("");
      void client.invalidateQueries({ queryKey: ["memory"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      void q.refetch();
    },
  });
  if (q.isPending) return <p aria-busy="true">{t.loading}</p>;
  if (q.isError)
    return <Button onClick={() => void q.refetch()}>{t.retry}</Button>;
  function submit(event: FormEvent) {
    event.preventDefault();
    edit.mutate({ key, value });
  }
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold">{t.memory}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t.memoryHint}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={q.data.enabled}
          disabled={edit.isPending}
          onChange={(e) => edit.mutate({ enabled: e.target.checked })}
        />
        {t.enableMemory}
      </label>
      <div className="space-y-2">
        {Object.entries(q.data.facts).map(([name, fact]) => (
          <div key={name} className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs font-medium capitalize">
              {name.replaceAll("_", " ")}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{fact.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {fact.updated_at.slice(0, 10)} ·{" "}
              {fact.source === "user_edit" ? t.userEdit : t.chat}
            </p>
            <div className="mt-1 flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setKey(name);
                  setValue(fact.value);
                }}
              >
                {t.edit}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={edit.isPending}
                onClick={() => edit.mutate({ key: name, value: null })}
              >
                {t.forget}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-2">
        <label className="block text-xs">
          {t.memoryKey}
          <select
            aria-label={t.memoryKey}
            className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          >
            {keys.map((k) => (
              <option key={k} value={k}>
                {k.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <Input
          aria-label={t.memoryValue}
          placeholder={t.memoryValue}
          value={value}
          maxLength={1200}
          required
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={edit.isPending}>
          {t.save}
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {q.data.synced ? t.snapshotSynced : t.snapshotPending} ·{" "}
          {q.data.pending} {t.pending}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={edit.isPending}
          onClick={() => {
            if (window.confirm(t.confirmForget))
              edit.mutate({ forget_all: true });
          }}
        >
          {t.forgetAll}
        </Button>
      </div>
      {q.data.failed > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await apiFetch("/me/memory/retry", { method: "POST" });
              await q.refetch();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          {t.retry} ({q.data.failed})
        </Button>
      )}
    </section>
  );
}
