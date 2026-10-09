"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { requiresAdmin?: boolean };
    mutationMeta: { requiresAdmin?: boolean };
  }
}

/** Admin requests that come back 401 mean the admin cookie expired: send them to login. */
function redirectToLogin(error: unknown, meta?: { requiresAdmin?: boolean }) {
  if (!meta?.requiresAdmin) return;
  if (!(error instanceof ApiError) || error.status !== 401) return;
  if (typeof window === "undefined" || window.location.pathname === "/admin/login") return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.replace(`/admin/login?next=${next}&expired=1`);
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => redirectToLogin(error, query.meta),
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => redirectToLogin(error, mutation.meta),
    }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Don't retry client errors (401/404/...); retry transient failures twice.
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster position="top-center" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
