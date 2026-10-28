"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  BriefcaseBusiness,
  Menu,
  SquarePen,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { LocaleToggle } from "@/components/locale-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { EntrepreneurProfilePanel } from "@/features/entrepreneur/components/profile-panel";
import { getEntrepreneurProfile } from "@/features/entrepreneur/api";
import { getWork, workKey } from "./api";
import { useWorkCopy } from "./copy";

type ChatControls = {
  newChat: () => void;
  select: (id: string) => void;
  deleted: (id: string) => void;
};
const ChatNavigation =
  createContext<MutableRefObject<ChatControls | null> | null>(null);
export function useChatNavigation() {
  return useContext(ChatNavigation);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = [
    "/chat",
    "/work",
    "/home",
    "/learn",
    "/learning",
    "/my-business",
  ].some((path) => pathname === path || pathname.startsWith(path + "/"));
  return active ? <WorkspaceShell>{children}</WorkspaceShell> : children;
}

function WorkspaceShell({ children }: { children: ReactNode }) {
  const { t } = useWorkCopy();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const chat = useRef<ChatControls | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profile = useQuery({
    queryKey: ["entrepreneur-profile"],
    queryFn: getEntrepreneurProfile,
  });
  const work = useQuery({
    queryKey: [...workKey, "notifications"],
    queryFn: () => getWork(),
    refetchInterval: 60000,
  });
  const isChat = pathname === "/chat";
  const isLearn =
    pathname === "/learn" ||
    pathname.startsWith("/work/learn") ||
    pathname.startsWith("/learning/");
  const notifications = [
    ...(work.data?.todos
      .filter(
        (todo) =>
          !todo.completed_at &&
          todo.due_date &&
          todo.due_date <= work.data.today,
      )
      .map((todo) => ({
        id: todo.id,
        title: todo.title,
        date: todo.due_date,
        href: "/work",
      })) ?? []),
    ...(work.data?.customers
      .filter(
        (customer) =>
          customer.follow_up_on && customer.follow_up_on <= work.data.today,
      )
      .map((customer) => ({
        id: customer.id,
        title: customer.name,
        date: customer.follow_up_on,
        href: "/work",
      })) ?? []),
  ];
  function navigateConversation(id?: string) {
    setMobileOpen(false);
    if (chat.current) {
      if (id) chat.current.select(id);
      else chat.current.newChat();
    } else router.push(id ? `/chat?c=${id}` : "/chat");
  }
  const sidebar = (
    <>
      <div className="flex h-12 items-center px-2">
        <Button
          variant="ghost"
          className="h-10 w-full justify-start rounded-lg px-3"
          aria-label="Close sidebar"
          onClick={() => {
            setExpanded(false);
            setMobileOpen(false);
          }}
        >
          <Menu className="size-4 shrink-0" />
        </Button>
      </div>
      <nav className="space-y-1 px-2">
        <Button
          variant="ghost"
          className="h-10 w-full justify-start gap-2 rounded-lg px-3"
          onClick={() => navigateConversation()}
        >
          <SquarePen className="size-4" />
          {t.newChat}
        </Button>
        <Link
          href="/work"
          onClick={() => setMobileOpen(false)}
          aria-current={!isChat ? "page" : undefined}
          className={`flex h-10 items-center gap-2 rounded-lg border border-transparent px-3 text-sm font-medium ${!isChat ? "bg-surface-navy text-brand-primary" : "hover:bg-muted"}`}
        >
          <BriefcaseBusiness className="size-4" />
          {t.work}
        </Link>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto pt-4">
        <p className="px-4 pb-1 text-xs text-muted-foreground">{t.history}</p>
        <ConversationList
          activeId={search.get("c")}
          onSelect={(id) => navigateConversation(id)}
          onDeleted={(id) => chat.current?.deleted(id)}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          setMobileOpen(false);
          setProfileOpen(true);
        }}
        className="m-2 flex min-h-12 shrink-0 items-center gap-3 rounded-xl px-2 text-left hover:bg-muted"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white">
          <UserRound className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {profile.data?.business_name || t.business}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t.profile}
          </span>
        </span>
      </button>
    </>
  );
  const rail = (
    <>
      <div className="flex h-12 items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex"
          aria-label="Expand sidebar"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
        >
          <Menu className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open sidebar"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-4" />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        aria-label={t.newChat}
        onClick={() => navigateConversation()}
      >
        <SquarePen className="size-4" />
      </Button>
      <Button asChild variant="ghost" size="icon" className="h-10 w-10">
        <Link href="/work" aria-label={t.work}>
          <BriefcaseBusiness className="size-4" />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="mb-2 mt-auto"
        aria-label={t.profile}
        onClick={() => {
          setMobileOpen(false);
          setProfileOpen(true);
        }}
      >
        <UserRound className="size-4" />
      </Button>
    </>
  );
  return (
    <ChatNavigation.Provider value={chat}>
      <div className="flex h-dvh overflow-hidden bg-background text-secondary">
        <aside
          aria-label="Sidebar"
          className="flex w-14 shrink-0 flex-col items-center gap-1 bg-surface-soft md:hidden"
        >
          {rail}
        </aside>
        {expanded ? (
          <aside
            aria-label="Sidebar"
            className="hidden w-60 shrink-0 flex-col bg-surface-soft md:flex"
          >
            {sidebar}
          </aside>
        ) : (
          <aside
            aria-label="Sidebar"
            className="hidden w-14 shrink-0 flex-col items-center gap-1 bg-surface-soft md:flex"
          >
            {rail}
          </aside>
        )}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-[85%] max-w-xs gap-0 bg-surface-soft p-0"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t.history}</SheetTitle>
              <SheetDescription>{t.profile}</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 px-3">
            <Link href="/chat" className="flex h-12 shrink-0 items-center">
              <Wordmark showProduct={false} className="text-base" />
            </Link>
            {!isChat && (
              <div className="order-3 flex w-full justify-center pb-1 sm:absolute sm:left-1/2 sm:top-2 sm:order-none sm:w-auto sm:-translate-x-1/2 sm:pb-0">
                <WorkTabs active={isLearn ? "learn" : "business"} />
              </div>
            )}
            <div className="ml-auto flex items-center gap-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t.notifications}${notifications.length ? ` (${notifications.length})` : ""}`}
                    className="relative"
                  >
                    <Bell className="size-4" />
                    {notifications.length > 0 && (
                      <span className="absolute right-2 top-2 size-1.5 rounded-full bg-brand-accent" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-80 w-72 overflow-y-auto"
                >
                  <DropdownMenuLabel>{t.notifications}</DropdownMenuLabel>
                  {work.isError ? (
                    <DropdownMenuItem onSelect={() => void work.refetch()}>
                      {t.retry}
                    </DropdownMenuItem>
                  ) : notifications.length ? (
                    notifications.map((item) => (
                      <DropdownMenuItem key={item.id} asChild>
                        <Link
                          href={item.href}
                          className="flex flex-col items-start gap-1 py-2"
                        >
                          <span>{item.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.date}
                          </span>
                        </Link>
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <p className="p-3 text-sm text-muted-foreground">
                      {work.isPending ? t.loading : t.noNotifications}
                    </p>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <LocaleToggle />
            </div>
          </header>
          <div
            className={`min-h-0 flex-1 ${isChat ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}
          >
            {children}
          </div>
        </div>
      </div>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.profile}</DialogTitle>
          </DialogHeader>
          <EntrepreneurProfilePanel />
        </DialogContent>
      </Dialog>
    </ChatNavigation.Provider>
  );
}

function WorkTabs({ active }: { active: "business" | "learn" }) {
  const { t } = useWorkCopy();
  return (
    <nav
      aria-label={t.work}
      className="inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5"
    >
      {[
        ["business", "/work", t.business],
        ["learn", "/work/learn", t.learn],
      ].map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors ${active === key ? "bg-surface text-brand-primary shadow-sm" : "text-muted-foreground hover:text-brand-primary"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
