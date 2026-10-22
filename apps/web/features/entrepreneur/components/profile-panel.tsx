"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getEntrepreneurProfile, updateEntrepreneurProfile, type BusinessStage } from "../api";

export function EntrepreneurProfilePanel() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["entrepreneur-profile"], queryFn: getEntrepreneurProfile });
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<BusinessStage | "">("");
  const mutation = useMutation({
    mutationFn: () => updateEntrepreneurProfile({ business_type: type || null, business_description: description || null, business_stage: stage || null, onboarding_completed: true }),
    onSuccess: (data) => queryClient.setQueryData(["entrepreneur-profile"], data),
  });

  if (profile.isPending) return <p className="px-1 text-xs text-muted-foreground">Loading profile...</p>;
  if (profile.isError) return <p className="px-1 text-xs text-destructive">Profile unavailable</p>;
  const current = profile.data;
  return (
    <details className="border-t border-border px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-secondary">
        {current.identity_type === "guest" ? "Guest entrepreneur profile" : "Entrepreneur profile"}
      </summary>
      <div className="mt-3 space-y-2">
        <Input defaultValue={current.business_type ?? ""} onChange={(e) => setType(e.target.value)} placeholder="Business type (optional)" maxLength={120} />
        <Input defaultValue={current.business_description ?? ""} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your business (optional)" maxLength={2000} />
        <Select defaultValue={current.business_stage ?? undefined} onValueChange={(value) => setStage(value as BusinessStage)}>
          <SelectTrigger aria-label="Business stage"><SelectValue placeholder="Business stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="idea">Idea</SelectItem><SelectItem value="startup">Startup</SelectItem><SelectItem value="operating">Operating</SelectItem><SelectItem value="growing">Growing</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : "Save profile"}
        </Button>
      </div>
    </details>
  );
}
