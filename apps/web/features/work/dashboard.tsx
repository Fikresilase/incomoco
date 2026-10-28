"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getWork,
  workKey,
  type WorkData,
  type Todo,
  type BusinessAction,
  type Transaction,
  type Customer,
  type Dashboard,
} from "./api";
import {
  Panel as Card,
  MetricCard,
  FinancialOverview,
  TaskProgress,
  LearningProgress,
  CustomerProgress,
} from "./dashboard-panels";
import {
  financialSeries,
  taskSummary,
  customerSummary,
  sampleTransactions,
  sampleActivity,
  sampleCustomers,
} from "./insights";
import { useWorkCopy } from "./copy";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-xs font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
function useSave() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method = "POST",
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) => apiFetch(path, { method, body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: workKey });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      void client.invalidateQueries({ queryKey: ["business-actions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function ActivityGrid({
  data,
  today,
  sample = false,
}: {
  data: Record<string, number>;
  today: string;
  sample?: boolean;
}) {
  const { t } = useWorkCopy();
  const end = new Date(today + "T12:00:00Z");
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 90);
  const padding = (start.getUTCDay() + 6) % 7;
  const dates = Array.from({ length: 91 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t.consistency}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t.activityHint}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">
            {Object.values(data).filter((count) => count > 0).length}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              {t.activeDays}
            </span>
          </p>
          {sample && (
            <span className="text-[10px] text-muted-foreground">
              {t.previewShort}
            </span>
          )}
        </div>
      </div>
      <div className="scrollbar-thin mt-4 overflow-x-auto pb-1">
        <div
          className="grid w-full min-w-[300px] grid-flow-col grid-rows-7 gap-1.5"
          role="group"
          aria-label={t.consistency}
        >
          {Array.from({ length: padding }, (_, i) => (
            <span key={`padding-${i}`} className="h-4" />
          ))}
          {dates.map((day) => {
            const count = data[day] ?? 0;
            return (
              <span
                key={day}
                tabIndex={0}
                title={`${day}: ${count}`}
                aria-label={`${day}: ${count}`}
                className={`h-4 w-full rounded-[4px] focus-visible:outline-2 focus-visible:outline-brand-primary ${count >= 4 ? "bg-brand-primary" : count >= 2 ? "bg-success" : count ? "bg-success/40" : "bg-muted"}`}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {dates[0]} — {today}
        </span>
        <span className="flex items-center gap-1.5">
          {t.less}
          <span className="size-3 rounded bg-muted" />
          <span className="size-3 rounded bg-success/40" />
          <span className="size-3 rounded bg-success" />
          <span className="size-3 rounded bg-brand-primary" />
          {t.more}
        </span>
      </div>
    </Card>
  );
}

function todoStatus(todo: Todo) {
  return todo.completed_at
    ? "completed"
    : todo.started_at
      ? "in_progress"
      : "assigned";
}

function Todos({ data }: { data: WorkData }) {
  const { t } = useWorkCopy();
  const save = useSave();
  const actions = useQuery({
    queryKey: ["business-actions"],
    queryFn: () => apiFetch<BusinessAction[]>("/me/actions"),
  });
  const [editing, setEditing] = useState<Todo | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  function reset() {
    setEditing(null);
    setTitle("");
    setDue("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await save
      .mutateAsync({
        path: `/me/work/todos${editing ? `/${editing.id}` : ""}`,
        method: editing ? "PUT" : "POST",
        body: {
          title,
          due_date: due || null,
          status: editing ? todoStatus(editing) : "assigned",
        },
      })
      .then(reset)
      .catch(() => {});
  }
  return (
    <Card className="h-full">
      <h2 className="text-sm font-semibold">{t.todos}</h2>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <Input
            aria-label={t.task}
            placeholder={t.task}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={240}
          />
        </div>
        <Input
          className="w-36"
          aria-label={t.due}
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <Button
          size="icon"
          aria-label={editing ? t.save : t.add}
          disabled={save.isPending}
        >
          {editing ? <Check /> : <Plus />}
        </Button>
        {editing && (
          <Button type="button" variant="ghost" onClick={reset}>
            {t.cancel}
          </Button>
        )}
      </form>
      <ul className="mt-3 divide-y divide-border-soft">
        {data.todos.map((todo) => (
          <li key={todo.id} className="flex flex-wrap items-center gap-2 py-2">
            <input
              type="checkbox"
              aria-label={`${t.done}: ${todo.title}`}
              checked={Boolean(todo.completed_at)}
              disabled={save.isPending}
              onChange={(e) =>
                save.mutate({
                  path: `/me/work/todos/${todo.id}`,
                  method: "PUT",
                  body: {
                    title: todo.title,
                    due_date: todo.due_date,
                    status: e.target.checked ? "completed" : "assigned",
                  },
                })
              }
              className="size-4 accent-brand-primary"
            />
            <div className="min-w-32 flex-1">
              <p
                className={`break-words text-sm ${todo.completed_at ? "text-muted-foreground line-through" : ""}`}
              >
                {todo.title}
              </p>
              {todo.due_date && (
                <p
                  className={`text-xs ${!todo.completed_at && todo.due_date < data.today ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {todo.due_date}
                </p>
              )}
            </div>
            <select
              aria-label={`${t.status}: ${todo.title}`}
              value={todoStatus(todo)}
              disabled={save.isPending}
              className="h-8 max-w-full rounded-lg border border-input bg-background px-2 text-xs"
              onChange={(e) =>
                save.mutate({
                  path: `/me/work/todos/${todo.id}`,
                  method: "PUT",
                  body: {
                    title: todo.title,
                    due_date: todo.due_date,
                    status: e.target.value,
                  },
                })
              }
            >
              <option value="assigned">{t.assigned}</option>
              <option value="in_progress">{t.inProgress}</option>
              <option value="completed">{t.completedStatus}</option>
            </select>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${t.edit}: ${todo.title}`}
              onClick={() => {
                setEditing(todo);
                setTitle(todo.title);
                setDue(todo.due_date ?? "");
              }}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={save.isPending}
              aria-label={`${t.remove}: ${todo.title}`}
              onClick={() => {
                if (window.confirm(t.confirmDelete))
                  save.mutate({
                    path: `/me/work/todos/${todo.id}`,
                    method: "DELETE",
                  });
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
        {actions.data?.map((action) => (
          <li
            key={`action-${action.id}`}
            className="flex flex-wrap items-center gap-2 py-3"
          >
            <input
              type="checkbox"
              className="size-4 accent-brand-primary"
              aria-label={`${t.done}: ${action.title}`}
              checked={action.status === "completed"}
              disabled={
                save.isPending ||
                action.status === "completed" ||
                action.status === "skipped"
              }
              onChange={() =>
                save.mutate({ path: `/me/actions/${action.id}/complete` })
              }
            />
            <div className="min-w-32 flex-1">
              <p
                className={`break-words text-sm ${action.status === "completed" ? "text-muted-foreground line-through" : ""}`}
              >
                {action.title}
              </p>
              {action.description && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {action.description}
                </p>
              )}
              {action.due_date && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {action.due_date.slice(0, 10)}
                </p>
              )}
              {action.target_count && (
                <div className="mt-2 space-y-1">
                  <progress
                    className="h-1.5 w-full accent-brand-primary"
                    aria-label={action.title}
                    value={Math.min(action.progress_count, action.target_count)}
                    max={action.target_count}
                  />
                  <p className="text-xs text-muted-foreground">
                    {action.progress_count}/{action.target_count}{" "}
                    {action.progress_unit}
                  </p>
                </div>
              )}
            </div>
            <select
              aria-label={`${t.status}: ${action.title}`}
              value={action.status}
              disabled={
                save.isPending ||
                action.status === "completed" ||
                action.status === "skipped"
              }
              className="h-8 max-w-full rounded-lg border border-input bg-background px-2 text-xs"
              onChange={(e) =>
                save.mutate({
                  path: `/me/actions/${action.id}/${({ started: "start", completed: "complete", needs_help: "needs-help" } as Record<string, string>)[e.target.value]}`,
                })
              }
            >
              <option value="recommended" disabled>
                {t.assigned}
              </option>
              <option value="started">{t.inProgress}</option>
              <option value="completed">{t.completedStatus}</option>
              <option value="needs_help">{t.needsHelp}</option>
              <option value="skipped" disabled>
                {t.skipped}
              </option>
            </select>
          </li>
        ))}
      </ul>
      {actions.isPending && (
        <p aria-busy="true" className="mt-3 text-sm text-muted-foreground">
          {t.loading}
        </p>
      )}
      {actions.isError && (
        <div role="alert" className="mt-3">
          <p className="text-sm text-muted-foreground">{t.error}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void actions.refetch()}
          >
            {t.retry}
          </Button>
        </div>
      )}
      {!data.todos.length && actions.isSuccess && !actions.data.length && (
        <p className="mt-4 text-sm text-muted-foreground">{t.empty}</p>
      )}
    </Card>
  );
}

type Editor =
  | { kind: "transaction"; row?: Transaction }
  | { kind: "customer"; row?: Customer };
function RecordEditor({
  editor,
  today,
  close,
}: {
  editor: Editor;
  today: string;
  close: () => void;
}) {
  const { t } = useWorkCopy();
  const save = useSave();
  const transaction = editor.kind === "transaction";
  const row = editor.row;
  const tx = transaction ? editor.row : undefined;
  const customer = !transaction ? editor.row : undefined;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const body = transaction
      ? {
          kind: value("kind"),
          amount: value("amount"),
          currency: value("currency").toUpperCase(),
          description: value("description"),
          occurred_on: value("date"),
        }
      : {
          name: value("name"),
          contact: value("contact"),
          notes: value("notes"),
          follow_up_on: value("follow_up_on") || null,
        };
    await save
      .mutateAsync({
        path: `/me/work/${transaction ? "transactions" : "customers"}${row ? `/${row.id}` : ""}`,
        method: row ? "PUT" : "POST",
        body,
      })
      .then(close)
      .catch(() => {});
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {row ? t.edit : transaction ? t.addTransaction : t.addCustomer}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {transaction ? (
            <>
              <div className="flex gap-4 text-sm">
                <label>
                  <input
                    type="radio"
                    name="kind"
                    value="income"
                    defaultChecked={!tx || tx.kind === "income"}
                  />{" "}
                  {t.income}
                </label>
                <label>
                  <input
                    type="radio"
                    name="kind"
                    value="expense"
                    defaultChecked={tx?.kind === "expense"}
                  />{" "}
                  {t.expense}
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.amount}>
                  <Input
                    name="amount"
                    type="number"
                    min="0.01"
                    max="999999999999.99"
                    step="0.01"
                    required
                    defaultValue={tx?.amount}
                  />
                </Field>
                <Field label={t.currency}>
                  <Input
                    name="currency"
                    required
                    minLength={3}
                    maxLength={3}
                    pattern="[A-Za-z]{3}"
                    defaultValue={tx?.currency ?? "ETB"}
                  />
                </Field>
              </div>
              <Field label={t.description}>
                <Input
                  name="description"
                  required
                  maxLength={240}
                  defaultValue={tx?.description}
                />
              </Field>
              <Field label={t.date}>
                <Input
                  name="date"
                  type="date"
                  required
                  defaultValue={tx?.occurred_on ?? today}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={t.name}>
                <Input
                  name="name"
                  required
                  maxLength={160}
                  defaultValue={customer?.name}
                />
              </Field>
              <Field label={t.contact}>
                <Input
                  name="contact"
                  maxLength={240}
                  defaultValue={customer?.contact}
                />
              </Field>
              <Field label={t.notes}>
                <textarea
                  name="notes"
                  className="min-h-20 w-full rounded-lg border border-input bg-background p-2 text-sm"
                  maxLength={2000}
                  defaultValue={customer?.notes}
                />
              </Field>
              <Field label={t.followUp}>
                <Input
                  name="follow_up_on"
                  type="date"
                  defaultValue={customer?.follow_up_on ?? ""}
                />
              </Field>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending}
              onClick={close}
            >
              {t.cancel}
            </Button>
            <Button disabled={save.isPending}>{t.save}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WorkDashboard() {
  const { t, locale } = useWorkCopy();
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setHour(new Date().getHours());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);
  const [month, setMonth] = useState("");
  const [sample, setSample] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const save = useSave();
  const q = useQuery({
    queryKey: [...workKey, month],
    queryFn: () => getWork(month || undefined),
  });
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<Dashboard>("/me/dashboard"),
  });
  const lessons = useQuery({
    queryKey: ["learning-resources", locale],
    queryFn: () =>
      apiFetch<{ id: string; title: string }[]>(
        `/learning/resources?language=${locale}`,
      ),
  });
  const assignedActions = useQuery({
    queryKey: ["business-actions"],
    queryFn: () => apiFetch<BusinessAction[]>("/me/actions"),
  });
  const data = q.data;
  const d = dashboard.data;
  const entries =
    sample && data
      ? sampleTransactions(data.month)
      : (data?.transactions ?? []);
  const currencies = [
    ...new Set(entries.map((entry) => entry.currency)),
  ].sort();
  const currency = currencies.includes(selectedCurrency)
    ? selectedCurrency
    : (currencies[0] ?? "ETB");
  const points = financialSeries(entries, data?.month ?? "2000-01", currency);
  const income = sample
    ? points.reduce((sum, point) => sum + point.income, 0)
    : Number(data?.totals[currency]?.income ?? 0);
  const expense = sample
    ? points.reduce((sum, point) => sum + point.expense, 0)
    : Number(data?.totals[currency]?.expense ?? 0);
  const entryCount = entries.filter(
    (entry) => entry.currency === currency,
  ).length;
  const counts = sample
    ? {
        assigned: 2,
        inProgress: 4,
        completed: 8,
        needsHelp: 0,
        total: 14,
        percent: 57,
      }
    : taskSummary(data?.todos ?? [], assignedActions.data ?? []);
  const customerStats = customerSummary(
    sample && data
      ? sampleCustomers(data.month, data.today)
      : (data?.customers ?? []),
    data?.month ?? "2000-01",
    data?.today ?? "2000-01-01",
  );
  const completedIds = new Set(
    d?.completed_lessons.map((lesson) => lesson.id) ?? [],
  );
  const completedLessons = sample
    ? 6
    : (lessons.data ?? []).filter((lesson) => completedIds.has(lesson.id))
        .length;
  const totalLessons = sample ? 10 : (lessons.data?.length ?? 0);
  const currentLesson = sample
    ? { id: "sample", title: t.sampleLesson }
    : (lessons.data?.find((lesson) => lesson.id === d?.current_lesson?.id) ??
      lessons.data?.find((lesson) => !completedIds.has(lesson.id)));
  const money = (amount: string | number, currency: string) =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(amount))} ${currency}`;
  function remove(collection: string, id: string) {
    if (window.confirm(t.confirmDelete))
      save.mutate({ path: `/me/work/${collection}/${id}`, method: "DELETE" });
  }
  return (
    <main className="mx-auto max-w-[1440px] space-y-4 px-3 py-2 pb-6 sm:px-5">
      <h1 className="sr-only">{t.business}</h1>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="text-base font-semibold tracking-tight">
          {hour === null
            ? t.hello
            : hour < 12
              ? t.morning
              : hour < 18
                ? t.afternoon
                : t.evening}
          {d?.profile_name?.trim()
            ? `, ${d.profile_name.trim().split(/\s+/)[0]}`
            : ""}
        </p>
        {sample && (
          <span
            role="status"
            className="rounded-full bg-surface-coral px-2 py-1 text-[10px] font-medium leading-4 text-brand-accent"
          >
            {t.sampleLabel}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Input
            type="month"
            aria-label={t.month}
            value={month || data?.month || ""}
            onChange={(e) => setMonth(e.target.value)}
            className="h-8 w-32 border-0 bg-transparent px-1 text-xs shadow-none"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={sample ? t.live : t.sample}
            title={sample ? t.live : t.sample}
            onClick={() => setSample(!sample)}
            aria-pressed={sample}
          >
            <FlaskConical className="size-4" />
          </Button>
        </div>
      </div>
      {d?.demo_account && (
        <p className="rounded-lg bg-surface-navy px-3 py-2 text-xs text-muted-foreground">
          {t.demoNotice}
        </p>
      )}
      {q.isPending ? (
        <p aria-busy="true">{t.loading}</p>
      ) : q.isError ? (
        <Card>
          <p role="alert">{t.error}</p>
          <Button className="mt-3" onClick={() => void q.refetch()}>
            {t.retry}
          </Button>
        </Card>
      ) : (
        data && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label={t.income}
                value={entryCount ? money(income, currency) : "—"}
                caption={`${entryCount} ${t.entriesRecorded}`}
                kind="income"
                points={points.map((point) => point.income)}
                sample={sample}
              />
              <MetricCard
                label={t.expense}
                value={entryCount ? money(expense, currency) : "—"}
                caption={data.month}
                kind="expense"
                points={points.map((point) => point.expense)}
                sample={sample}
              />
              <MetricCard
                label={t.net}
                value={entryCount ? money(income - expense, currency) : "—"}
                caption={`${currency} · ${data.month}`}
                kind="net"
                points={points.map((point) => point.net)}
                sample={sample}
              />
              <MetricCard
                label={t.customers}
                value={String(customerStats.total)}
                caption={`${customerStats.newThisMonth} ${t.newCustomers.toLowerCase()}`}
                kind="customers"
                sample={sample}
              />
            </div>
            <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
              <FinancialOverview
                points={points}
                currency={currency}
                currencies={currencies}
                onCurrencyChange={setSelectedCurrency}
                hasEntries={entryCount > 0}
                month={data.month}
                sample={sample}
                onAdd={() => setEditor({ kind: "transaction" })}
                formatMoney={money}
              />
              <TaskProgress
                counts={counts}
                loading={!sample && assignedActions.isPending}
                error={!sample && assignedActions.isError}
                retry={() => void assignedActions.refetch()}
                sample={sample}
              />
            </div>
            <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                {sample && (
                  <p className="mb-2 px-1 text-[10px] text-muted-foreground">
                    {t.realRecords}
                  </p>
                )}
                <Todos data={data} />
              </div>
              <LearningProgress
                completed={completedLessons}
                total={totalLessons}
                lesson={currentLesson}
                loading={!sample && (lessons.isPending || dashboard.isPending)}
                error={!sample && (lessons.isError || dashboard.isError)}
                retry={() => {
                  void lessons.refetch();
                  void dashboard.refetch();
                }}
                sample={sample}
              />
              <CustomerProgress
                summary={customerStats}
                sample={sample}
                onAdd={() => setEditor({ kind: "customer" })}
              />
            </div>
            <ActivityGrid
              data={sample ? sampleActivity(data.today) : data.activity}
              today={data.today}
              sample={sample}
            />
            <div className="flex items-center justify-between px-1 pt-1">
              <h2 className="text-sm font-semibold">{t.yourRecords}</h2>
              {sample && (
                <span className="rounded-full bg-surface-navy px-2 py-1 text-[10px] text-muted-foreground">
                  {t.realRecords}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">{t.transactions}</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditor({ kind: "transaction" })}
                  >
                    <Plus className="size-4" />
                    {t.addTransaction}
                  </Button>
                </div>
                <div className="scrollbar-thin mt-3 max-h-96 overflow-auto">
                  {data.transactions.length ? (
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="py-2 font-normal">{t.description}</th>
                          <th className="px-2 font-normal">{t.amount}</th>
                          <th>
                            <span className="sr-only">{t.edit}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft">
                        {data.transactions.map((row) => (
                          <tr key={row.id}>
                            <td className="py-2">
                              <p className="max-w-52 break-words">
                                {row.description}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {row.occurred_on} ·{" "}
                                {row.kind === "income" ? t.income : t.expense}
                              </p>
                            </td>
                            <td
                              className={`whitespace-nowrap px-2 ${row.kind === "income" ? "text-success" : ""}`}
                            >
                              {row.kind === "income" ? "+" : "−"}
                              {money(row.amount, row.currency)}
                            </td>
                            <td className="whitespace-nowrap">
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`${t.edit}: ${row.description}`}
                                onClick={() =>
                                  setEditor({ kind: "transaction", row })
                                }
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={save.isPending}
                                aria-label={`${t.remove}: ${row.description}`}
                                onClick={() => remove("transactions", row.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="py-5 text-sm text-muted-foreground">
                      {t.empty}
                    </p>
                  )}
                </div>
              </Card>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">{t.customers}</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditor({ kind: "customer" })}
                  >
                    <Plus className="size-4" />
                    {t.addCustomer}
                  </Button>
                </div>
                <ul className="scrollbar-thin mt-3 max-h-96 divide-y divide-border-soft overflow-auto">
                  {data.customers.map((row) => (
                    <li key={row.id} className="flex items-start gap-2 py-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-navy text-xs font-semibold">
                        {row.name.slice(0, 1)}
                      </span>
                      <div className="min-w-0 flex-1 break-words">
                        <p className="text-sm font-medium">{row.name}</p>
                        {row.contact && (
                          <p className="text-xs text-muted-foreground">
                            {row.contact}
                          </p>
                        )}
                        {row.notes && (
                          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                            {row.notes}
                          </p>
                        )}
                        {row.follow_up_on && (
                          <p className="mt-1 text-xs text-brand-primary">
                            {t.followUp}: {row.follow_up_on}
                          </p>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`${t.edit}: ${row.name}`}
                        onClick={() => setEditor({ kind: "customer", row })}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={save.isPending}
                        aria-label={`${t.remove}: ${row.name}`}
                        onClick={() => remove("customers", row.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
                {!data.customers.length && (
                  <p className="py-5 text-sm text-muted-foreground">
                    {t.empty}
                  </p>
                )}
              </Card>
            </div>
            {editor && (
              <RecordEditor
                key={`${editor.kind}-${editor.row?.id ?? "new"}`}
                editor={editor}
                today={data.today}
                close={() => setEditor(null)}
              />
            )}
          </>
        )
      )}
    </main>
  );
}
