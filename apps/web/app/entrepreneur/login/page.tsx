"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, isApiError } from "@/lib/api";

type AuthResult = { account: { display_name: string; roles: string[] } };

export default function EntrepreneurLoginPage() {
  const router = useRouter();
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = registering
        ? await apiFetch<AuthResult>("/auth/register", { method: "POST", body: { email, password, display_name: name } })
        : await apiFetch<AuthResult>("/auth/login", { method: "POST", body: { email, password } });
      if (!result.account.roles.includes("entrepreneur")) {
        setError("This account is not an entrepreneur account.");
        return;
      }
      router.replace("/messages");
    } catch (caught) {
      setError(isApiError(caught) ? caught.detail : "We could not sign you in. Please try again.");
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border-soft bg-surface p-6 shadow-sm sm:p-8">
        <Link href="/" className="text-sm font-semibold text-brand-primary">Inkomoko</Link>
        <p className="mt-8 text-sm font-semibold text-brand-accent">Entrepreneur account</p>
        <h1 className="mt-1 text-2xl font-semibold text-brand-primary">{registering ? "Create your account" : "Sign in to your business workspace"}</h1>
        <p className="mt-2 text-sm text-text-secondary">Use your account to access private adviser messages and your business profile.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          {registering && <Input required placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} />}
          <Input required type="email" autoComplete="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Input required minLength={12} type="password" autoComplete={registering ? "new-password" : "current-password"} placeholder={registering ? "Password (12+ characters)" : "Password"} value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button className="w-full" type="submit">{registering ? "Create account" : "Sign in"}</Button>
        </form>
        <button type="button" className="mt-5 text-sm font-medium text-brand-primary hover:underline" onClick={() => { setRegistering((value) => !value); setError(null); }}>
          {registering ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>
        <p className="mt-5 text-xs leading-5 text-text-secondary">If you selected a demo business first, creating an account here connects that selected demo profile to your account.</p>
      </section>
    </main>
  );
}
