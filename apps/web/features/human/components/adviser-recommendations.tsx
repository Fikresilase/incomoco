"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { humanApi } from "../api";

type Resource = { id: string; title: string; description: string; language: string; approval_status?: string };

export function AdviserRecommendations() {
  const client = useQueryClient();
  const people = useQuery({ queryKey: ["adviser-people"], queryFn: humanApi.adviserEntrepreneurs });
  const resources = useQuery({ queryKey: ["approved-learning-resources"], queryFn: () => apiFetch<Resource[]>("/learning/resources") });
  const [profile, setProfile] = useState("");
  const [resource, setResource] = useState("");
  const [note, setNote] = useState("");
  const recommend = useMutation({ mutationFn: () => humanApi.recommend(profile, resource, note || undefined), onSuccess: () => { setNote(""); void client.invalidateQueries({ queryKey: ["human-notifications"] }); } });
  const selected = profile || people.data?.[0]?.id || "";
  return <section className="mx-auto mt-6 max-w-6xl rounded-2xl border border-border-soft bg-surface p-5 sm:p-6"><div><p className="text-sm font-semibold text-brand-accent">Learning support</p><h2 className="mt-1 text-xl font-semibold text-brand-primary">Recommend an approved course</h2><p className="mt-1 text-sm text-text-secondary">Choose a course already approved by Inkomoko. The entrepreneur will receive a notification.</p></div><div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1.5fr_auto]"><select value={selected} onChange={(event) => setProfile(event.target.value)} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">Choose entrepreneur</option>{(people.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={resource} onChange={(event) => setResource(event.target.value)} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">Choose approved course</option>{(resources.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.language}</option>)}</select><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" className="h-11 rounded-md border border-input bg-background px-3 text-sm" /><Button disabled={!selected || !resource || recommend.isPending} onClick={() => recommend.mutate()}>{recommend.isPending ? "Sending..." : "Recommend"}</Button></div>{recommend.isSuccess && <p className="mt-3 text-sm text-green-700">Recommendation sent.</p>}{recommend.isError && <p className="mt-3 text-sm text-red-700">Could not send this recommendation.</p>}</section>;
}
