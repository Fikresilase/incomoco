"use client";

import { AlertCircle, Menu, PanelLeftClose, PanelLeftOpen, SquarePen } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { LocaleToggle } from "@/components/locale-toggle";
import { OfflineBanner } from "@/components/offline-banner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { cn } from "@/lib/utils";
import { useChat } from "../hooks/use-chat";
import { useReadAloud } from "../hooks/use-read-aloud";
import type { ComposerToolsContext } from "../types";
import { Composer, type ComposerHandle } from "./composer";
import { ConversationList } from "./conversation-list";
import { EmptyState } from "./empty-state";
import { Thread } from "./thread";

export interface ChatAppProps {
  /** Extra composer controls (dictation, live talk), composed in by the route. */
  ComposerTools?: ComponentType<{ ctx: ComposerToolsContext }>;
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ThreadSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pt-8 sm:px-6" aria-busy="true">
      <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
    </div>
  );
}

export function ChatApp({ ComposerTools }: ChatAppProps) {
  const t = useTranslations();
  const chat = useChat();
  const readAloud = useReadAloud();
  const online = useOnlineStatus();
  const composerRef = useRef<ComposerHandle>(null);

  const [input, setInput] = useState("");
  const [fromDictation, setFromDictation] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { selectConversation, send, refreshAfterVoice, conversationId } = chat;

  const handleInputChange = (value: string) => {
    setInput(value);
    if (!value.trim()) setFromDictation(false);
  };

  const submit = () => {
    send(input, fromDictation ? "dictation" : "text");
    setInput("");
    setFromDictation(false);
  };

  const newChat = useCallback(() => {
    selectConversation(null);
    setDrawerOpen(false);
    setInput("");
    setFromDictation(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [selectConversation]);

  const openConversation = useCallback(
    (id: string) => {
      selectConversation(id);
      setDrawerOpen(false);
    },
    [selectConversation]
  );

  const onDeleted = useCallback(
    (id: string) => {
      if (id === conversationId) newChat();
    },
    [conversationId, newChat]
  );

  const insertText = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setInput((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")} ${clean}` : clean));
    setFromDictation(true);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const toolsContext = useMemo<ComposerToolsContext>(
    () => ({
      conversationId,
      disabled: chat.streaming || !online,
      insertText,
      onLiveTalkEnded: refreshAfterVoice,
    }),
    [conversationId, chat.streaming, online, insertText, refreshAfterVoice]
  );

  const sidebarBody = (
    <>
      <div className="px-3 pb-2">
        <Button variant="outline" className="w-full justify-start" onClick={newChat}>
          <SquarePen />
          {t("chat.newChat")}
        </Button>
      </div>
      <nav aria-label={t("chat.conversations")} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-3">
        <h2 className="px-5 pt-3 pb-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
          {t("chat.conversations")}
        </h2>
        <ConversationList
          activeId={conversationId}
          onSelect={openConversation}
          onDeleted={onDeleted}
        />
      </nav>
      <div className="border-t border-border px-5 py-3">
        <Link
          href="/admin"
          className="text-xs font-semibold text-muted-foreground hover:text-secondary focus-visible:underline"
        >
          {t("chat.admin")}
        </Link>
      </div>
    </>
  );

  const hasMessages = chat.messages.length > 0;
  const showEmpty = !conversationId && !hasMessages;

  let body: ReactNode;
  if (chat.isLoading) {
    body = (
      <div className="min-h-0 flex-1">
        <ThreadSkeleton />
      </div>
    );
  } else if (chat.loadError) {
    body = (
      <div className="flex flex-1 items-center justify-center px-6">
        <div role="alert" className="max-w-sm text-center">
          <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden />
          <p className="font-semibold text-secondary">
            {chat.notFound ? t("chat.conversationNotFound") : t("chat.loadConversationError")}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {!chat.notFound && (
              <Button variant="outline" onClick={chat.reload}>
                {t("common.retry")}
              </Button>
            )}
            <Button onClick={newChat}>{t("chat.newChat")}</Button>
          </div>
        </div>
      </div>
    );
  } else if (showEmpty) {
    body = <EmptyState onPick={(text) => send(text)} disabled={!online} />;
  } else {
    body = (
      <Thread
        messages={chat.messages}
        streaming={chat.streaming}
        onRegenerate={chat.regenerate}
        onRetry={chat.retry}
        readAloud={readAloud}
      />
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <a
        href="#chat-input"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-secondary focus:px-4 focus:py-2 focus:text-sm focus:text-secondary-foreground"
      >
        {t("common.skipToContent")}
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-muted/40 transition-[width] duration-200 md:flex",
          collapsed ? "w-0 overflow-hidden border-r-0" : "w-72"
        )}
        aria-hidden={collapsed || undefined}
        inert={collapsed || undefined}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Wordmark />
          <IconAction label={t("chat.collapseSidebar")} onClick={() => setCollapsed(true)}>
            <PanelLeftClose />
          </IconAction>
        </div>
        {sidebarBody}
      </aside>

      {/* Mobile drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-[85%] max-w-xs gap-0 bg-background p-0">
          <SheetHeader className="h-14 justify-center px-4 py-0">
            <SheetTitle>
              <Wordmark />
            </SheetTitle>
            <SheetDescription className="sr-only">{t("chat.conversations")}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">{sidebarBody}</div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
          <div className="md:hidden">
            <IconAction label={t("chat.openSidebar")} onClick={() => setDrawerOpen(true)}>
              <Menu />
            </IconAction>
          </div>
          {collapsed && (
            <div className="hidden items-center gap-1 md:flex">
              <IconAction label={t("chat.expandSidebar")} onClick={() => setCollapsed(false)}>
                <PanelLeftOpen />
              </IconAction>
              <IconAction label={t("chat.newChat")} onClick={newChat}>
                <SquarePen />
              </IconAction>
            </div>
          )}
          <div className={cn("px-1 md:hidden", collapsed && "md:block")}>
            <Wordmark className="text-base" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <div className="md:hidden">
              <IconAction label={t("chat.newChat")} onClick={newChat}>
                <SquarePen />
              </IconAction>
            </div>
            <LocaleToggle />
          </div>
        </header>
        <OfflineBanner />

        <main className="flex min-h-0 flex-1 flex-col" id="main">
          {body}
          <div className="shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-6">
            <div className="mx-auto w-full max-w-3xl">
              <Composer
                ref={composerRef}
                value={input}
                onChange={handleInputChange}
                onSubmit={submit}
                onStop={chat.stop}
                streaming={chat.streaming}
                disabled={!online}
                tools={ComposerTools ? <ComposerTools ctx={toolsContext} /> : null}
              />
              <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">
                {t("chat.disclaimer")}
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
