"use client";
import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useWorkCopy } from "./copy";
import type { Dashboard } from "./api";

type DemoProfile = { key: string; name: string; business_name: string | null };
type DemoSession = { selected: string; profiles: DemoProfile[] };
const DemoContext = createContext<{
  selected: string;
  profiles: DemoProfile[];
  profile: DemoProfile;
  select: (key: string) => void;
  switching: boolean;
} | null>(null);

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const { t } = useWorkCopy();
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ["demo-session"],
    queryFn: () => apiFetch<DemoSession>("/demo/profiles"),
    staleTime: Infinity,
  });
  const change = useMutation({
    mutationFn: async (persona: string) => {
      await client.cancelQueries({ queryKey: ["dashboard"] });
      await client.cancelQueries({ queryKey: ["business-actions"] });
      return apiFetch<Dashboard>("/demo/login", {
        method: "POST",
        body: { persona },
      });
    },
    onSuccess: (data, selected) => {
      client.setQueryData<DemoSession>(["demo-session"], (old) =>
        old ? { ...old, selected } : old,
      );
      client.setQueryData(["dashboard"], data);
      for (const queryKey of [
        ["business-actions"],
        ["skill-status"],
        ["learning-resources"],
      ])
        void client.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (session.isPending)
    return (
      <div
        className="flex h-dvh items-center justify-center text-sm text-muted-foreground"
        aria-busy="true"
      >
        {t.loading}
      </div>
    );
  if (session.isError)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3">
        <p role="alert">{t.error}</p>
        <Button onClick={() => void session.refetch()}>{t.retry}</Button>
      </div>
    );
  const profile = session.data.profiles.find(
    (profile) => profile.key === session.data.selected,
  )!;
  return (
    <DemoContext.Provider
      value={{
        selected: session.data.selected,
        profiles: session.data.profiles,
        profile,
        select: (key) => change.mutate(key),
        switching: change.isPending,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemoSession() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("Demo session is unavailable");
  return context;
}
