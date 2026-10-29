"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export default function AdviserLoginPage() {
  const router = useRouter(); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const login = useMutation({ mutationFn: () => apiFetch("/auth/login", { method: "POST", body: { email, password } }), onSuccess: () => router.replace("/adviser") });
  return <main className="flex min-h-dvh items-center justify-center bg-background px-4"><form onSubmit={(event) => { event.preventDefault(); login.mutate(); }} className="w-full max-w-sm space-y-4 rounded-2xl border border-border-soft bg-surface p-6 shadow-sm"><div><p className="text-sm font-semibold text-brand-accent">Inkomoko</p><h1 className="mt-1 text-2xl font-semibold text-brand-primary">Adviser sign in</h1><p className="mt-2 text-sm text-text-secondary">Use the account created by your administrator.</p></div><Input required type="email" autoComplete="username" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} /><Input required type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />{login.isError && <p role="alert" className="text-sm text-red-600">Could not sign in. Check your account details.</p>}<Button className="w-full" disabled={login.isPending}>{login.isPending ? "Signing in..." : "Sign in"}</Button></form></main>;
}
