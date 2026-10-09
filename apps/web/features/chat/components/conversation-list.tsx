"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversationSummary } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { chatKeys, deleteConversation, listConversations } from "../api";

export interface ConversationListProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
}

/** Sidebar list from `GET /conversations` with delete. */
export function ConversationList({ activeId, onSelect, onDeleted }: ConversationListProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<ConversationSummary | null>(null);

  const query = useQuery({
    queryKey: chatKeys.conversations,
    queryFn: listConversations,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<ConversationSummary[]>(chatKeys.conversations, (prev) =>
        prev?.filter((c) => c.id !== id)
      );
      queryClient.removeQueries({ queryKey: chatKeys.conversation(id) });
      toast.success(t("chat.conversationDeleted"));
      onDeleted(id);
    },
    onError: (err) => toast.error(errorMessage(err, t("chat.deleteError"))),
  });

  if (query.isPending) {
    return (
      <div className="space-y-2 px-3 py-2" aria-busy="true" aria-label={t("common.loading")}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" style={{ opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground" role="alert">
        <p>{t("chat.loadConversationsError")}</p>
        <Button variant="outline" size="xs" className="mt-2" onClick={() => query.refetch()}>
          <RotateCcw />
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  if (query.data.length === 0) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">{t("chat.noConversations")}</p>;
  }

  return (
    <>
      <ul className="space-y-0.5 px-2 py-1">
        {query.data.map((conversation) => {
          const active = conversation.id === activeId;
          return (
            <li key={conversation.id} className="group/item relative">
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg py-2 pr-9 pl-3 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
                  active
                    ? "bg-secondary/[0.07] font-semibold text-secondary"
                    : "text-secondary hover:bg-muted"
                )}
              >
                <MessageSquare
                  className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                  aria-hidden
                />
                <span className="truncate">{conversation.title || "…"}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${t("chat.conversationOptions")}: ${conversation.title}`}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground opacity-100 hover:bg-background focus-visible:opacity-100 data-[state=open]:opacity-100 md:opacity-0 md:group-hover/item:opacity-100"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setToDelete(conversation)}
                  >
                    <Trash2 />
                    {t("chat.deleteConversation")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chat.deleteConversationTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("chat.deleteConversationBody", { title: toDelete?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
