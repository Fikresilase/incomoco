"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getEntrepreneurProfile,
  updateEntrepreneurProfile,
  type BusinessStage,
} from "../api";
import { useWorkCopy } from "@/features/work/copy";
import { MemoryPanel } from "@/features/work/memory-panel";

export function EntrepreneurProfilePanel() {
  const { t } = useWorkCopy();
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: ["entrepreneur-profile"],
    queryFn: getEntrepreneurProfile,
  });
  const mutation = useMutation({
    mutationFn: updateEntrepreneurProfile,
    onSuccess: (data) => {
      client.setQueryData(["entrepreneur-profile"], data);
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(t.saved);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (profile.isPending) return <p aria-busy="true">{t.loading}</p>;
  if (profile.isError)
    return <Button onClick={() => void profile.refetch()}>{t.retry}</Button>;
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      business_name: String(form.get("name")).trim() || null,
      business_type: String(form.get("type")).trim() || null,
      business_description: String(form.get("description")).trim() || null,
      business_stage: (String(form.get("stage")) ||
        null) as BusinessStage | null,
    });
  }
  return (
    <div className="space-y-6">
      <form onSubmit={save} key={profile.data.updated_at} className="space-y-3">
        {[
          ["name", t.businessName, profile.data.business_name, 200],
          ["type", t.businessType, profile.data.business_type, 120],
          [
            "description",
            t.businessDescription,
            profile.data.business_description,
            2000,
          ],
        ].map(([name, label, value, max]) => (
          <label key={String(name)} className="block text-xs font-medium">
            {label}
            <Input
              name={String(name)}
              defaultValue={String(value ?? "")}
              maxLength={Number(max)}
              className="mt-1"
            />
          </label>
        ))}
        <label className="block text-xs font-medium">
          {t.stage}
          <select
            name="stage"
            defaultValue={profile.data.business_stage ?? ""}
            className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="">—</option>
            {["idea", "startup", "operating", "growing"].map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        </label>
        <Button size="sm" disabled={mutation.isPending}>
          {t.save}
        </Button>
      </form>
      <MemoryPanel />
    </div>
  );
}
