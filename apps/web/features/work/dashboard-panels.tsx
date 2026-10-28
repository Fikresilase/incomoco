"use client";

import Link from "next/link";
import { type ComponentProps } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowUpRightIcon,
  BookOpen,
  ChartNoAxesCombined,
  ChevronRight,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkCopy } from "./copy";
import { customerSummary, financialSeries, taskSummary } from "./insights";

export function Panel({
  children,
  className = "",
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-[1.4rem] border border-[#e8edf3] bg-white p-4 shadow-[0_4px_24px_rgba(11,42,91,0.035)] sm:p-5 ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

function Preview({ show }: { show: boolean }) {
  const { t } = useWorkCopy();
  return show ? (
    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] leading-4 font-medium text-brand-primary">
      {t.previewShort}
    </span>
  ) : null;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length || !values.some((value) => value !== 0)) return null;
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const path = values
    .map(
      (value, i) =>
        `${i ? "L" : "M"}${(i / Math.max(1, values.length - 1)) * 88},${28 - ((value - min) / (max - min)) * 24}`,
    )
    .join(" ");
  return (
    <svg
      aria-hidden
      viewBox="0 0 88 32"
      className="h-8 w-22 shrink-0"
      fill="none"
    >
      <path d={`${path} L88,32 L0,32 Z`} fill={color} opacity="0.09" />
      <path
        d={path}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MetricCard({
  label,
  value,
  caption,
  kind,
  points = [],
  sample = false,
}: {
  label: string;
  value: string;
  caption: string;
  kind: "income" | "expense" | "net" | "customers";
  points?: number[];
  sample?: boolean;
}) {
  const { t } = useWorkCopy();
  const primary = kind === "income";
  const Icon = {
    income: ArrowDownLeft,
    expense: ArrowUpRight,
    net: Wallet,
    customers: Users,
  }[kind];
  return (
    <Panel
      className="relative motion-safe:transition-transform motion-safe:hover:-translate-y-0.5"
      style={
        primary
          ? {
              padding: 16,
              background: "linear-gradient(125deg, #f36b4e, #ef4d32)",
              borderColor: "transparent",
              color: "white",
              boxShadow: "0 10px 28px rgba(241,90,59,.16)",
            }
          : { padding: 16 }
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={`text-xs font-medium ${primary ? "text-white/90" : "text-muted-foreground"}`}
        >
          {label}
        </p>
        <span
          className={`flex size-7 items-center justify-center rounded-xl ${primary ? "bg-white/20" : kind === "net" ? "bg-[#eef0ff] text-[#6464c8]" : "bg-[#f3f6fa] text-brand-primary"}`}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 break-words text-[1.7rem] font-semibold leading-tight tracking-tight sm:text-[1.85rem]">
        {value}
      </p>
      <div className="mt-2 flex min-h-8 items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            title={caption}
            className={`truncate text-[11px] leading-4 ${primary ? "text-white/80" : "text-muted-foreground"}`}
          >
            {caption}
          </p>
          {sample && (
            <p
              className={`mt-1 text-[10px] leading-3 ${primary ? "text-white/80" : "text-muted-foreground"}`}
            >
              {t.previewShort}
            </p>
          )}
        </div>
        <Sparkline
          values={points}
          color={
            primary ? "#ffffff" : kind === "expense" ? "#f15a3b" : "#0b2a5b"
          }
        />
      </div>
    </Panel>
  );
}

export function FinancialOverview({
  points,
  currency,
  currencies,
  onCurrencyChange,
  hasEntries,
  month,
  sample,
  onAdd,
  formatMoney,
}: {
  points: ReturnType<typeof financialSeries>;
  currency: string;
  currencies: string[];
  onCurrencyChange: (currency: string) => void;
  hasEntries: boolean;
  month: string;
  sample: boolean;
  onAdd: () => void;
  formatMoney: (amount: number, currency: string) => string;
}) {
  const { t, locale } = useWorkCopy();
  const total = points.reduce((sum, point) => sum + point.income, 0);
  return (
    <Panel className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t.moneyOverview}</h2>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight">
              {hasEntries ? formatMoney(total, currency) : "—"}
            </span>
            <span className="text-[11px] leading-4 text-muted-foreground">
              {t.income} · {month}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Preview show={sample} />
          <select
            aria-label={t.currencyLabel}
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            className="h-8 rounded-lg border border-border-soft bg-surface-soft px-2 text-xs font-medium"
          >
            {(currencies.length ? currencies : [currency]).map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 text-[11px] leading-4 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand-accent" />
          {t.income}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand-primary" />
          {t.expense}
        </span>
      </div>
      {hasEntries ? (
        <div
          className="mt-2 h-48 min-w-0"
          role="img"
          aria-label={`${t.recordedMoney}: ${month}, ${currency}`}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              accessibilityLayer
              data={points}
              margin={{ top: 16, right: 0, left: -18, bottom: 0 }}
              barGap={2}
            >
              <CartesianGrid
                vertical={false}
                stroke="#edf0f5"
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                interval={6}
                tick={{ fontSize: 10, fill: "#8b96a8" }}
                tickFormatter={(day) => String(day).padStart(2, "0")}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#8b96a8" }}
                tickFormatter={(value) =>
                  new Intl.NumberFormat(locale, {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(value)
                }
              />
              <Tooltip
                cursor={{ fill: "#f3f6fa" }}
                contentStyle={{
                  borderRadius: 14,
                  border: "1px solid #e8edf3",
                  fontSize: 12,
                  boxShadow: "0 8px 24px #0b2a5b12",
                }}
                labelFormatter={(day) =>
                  `${month}-${String(day).padStart(2, "0")}`
                }
                formatter={(value, name) => [
                  formatMoney(Number(value), currency),
                  name === "income" ? t.income : t.expense,
                ]}
              />
              <Bar
                dataKey="income"
                fill="#f15a3b"
                radius={[4, 4, 0, 0]}
                maxBarSize={13}
                isAnimationActive={false}
              />
              <Bar
                dataKey="expense"
                fill="#0b2a5b"
                radius={[4, 4, 0, 0]}
                maxBarSize={13}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4 flex min-h-48 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border-soft bg-gradient-to-b from-surface-soft/70 to-white px-4 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-surface-coral text-brand-accent">
            <ChartNoAxesCombined className="size-5" />
          </span>
          <p className="mt-3 text-sm font-semibold">{t.chartEmpty}</p>
          <p className="mt-1 max-w-64 text-xs leading-5 text-muted-foreground">
            {t.chartEmptyHint}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 text-brand-accent"
            onClick={onAdd}
          >
            {t.addTransaction}
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}
    </Panel>
  );
}

export function TaskProgress({
  counts,
  loading,
  error,
  retry,
  sample,
}: {
  counts: ReturnType<typeof taskSummary>;
  loading: boolean;
  error: boolean;
  retry: () => void;
  sample: boolean;
}) {
  const { t } = useWorkCopy();
  return (
    <Panel className="h-full">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t.taskProgress}</h2>
        <Preview show={sample} />
      </div>
      {loading ? (
        <p
          aria-busy="true"
          className="py-10 text-center text-sm text-muted-foreground"
        >
          {t.loading}
        </p>
      ) : error ? (
        <Button className="mt-8" onClick={retry}>
          {t.retry}
        </Button>
      ) : (
        <>
          <div className="mt-5 flex items-center gap-5">
            <div className="relative size-28 shrink-0">
              <svg
                viewBox="0 0 120 120"
                className="size-full -rotate-90"
                aria-hidden
              >
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="#f0f2f7"
                  strokeWidth="10"
                />
                {counts.completed > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="#7465d8"
                    strokeWidth="10"
                    pathLength="100"
                    strokeDasharray={`${counts.percent} 100`}
                    strokeLinecap="round"
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tracking-tight">
                  {counts.total ? `${counts.percent}%` : "—"}
                </span>
                <span className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                  {t.completedStatus}
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-3xl font-semibold tracking-tight">
                {counts.completed}
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  / {counts.total}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.totalTasks}
              </p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {counts.total ? t.allTasks : t.noTasksHint}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-2.5">
            {[
              [t.assigned, counts.assigned, "#bbc5d4"],
              [t.inProgress, counts.inProgress, "#7465d8"],
              [t.completedStatus, counts.completed, "#2f7a57"],
              ...(counts.needsHelp
                ? [[t.needsHelp, counts.needsHelp, "#f15a3b"]]
                : []),
            ].map(([label, value, color]) => (
              <div
                key={String(label)}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: String(color) }}
                />
                <span className="flex-1 text-muted-foreground">
                  {String(label)}
                </span>
                <span className="font-semibold tabular-nums">
                  {Number(value)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

export function LearningProgress({
  completed,
  total,
  lesson,
  loading,
  error,
  retry,
  sample,
}: {
  completed: number;
  total: number;
  lesson?: { id: string; title: string };
  loading: boolean;
  error: boolean;
  retry: () => void;
  sample: boolean;
}) {
  const { t } = useWorkCopy();
  const percent = total
    ? Math.min(100, Math.round((100 * completed) / total))
    : 0;
  return (
    <Panel
      className="relative h-full"
      style={{
        background: "linear-gradient(135deg,#f3f0ff,#fafaff)",
        borderColor: "#eae5fb",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-white text-[#7465d8]">
          <BookOpen className="size-4" />
        </span>
        <Preview show={sample} />
      </div>
      <h2 className="mt-4 text-sm font-semibold">{t.courseProgress}</h2>
      {loading ? (
        <p aria-busy="true" className="mt-3 text-sm text-muted-foreground">
          {t.loading}
        </p>
      ) : error ? (
        <Button variant="ghost" onClick={retry}>
          {t.retry}
        </Button>
      ) : (
        <>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <p className="text-2xl font-semibold tracking-tight">
              {completed}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {total}
              </span>
            </p>
            <span className="text-sm font-semibold text-[#7465d8]">
              {percent}%
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {t.lessonsCompleted}
          </p>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-white"
            role="progressbar"
            aria-label={t.courseProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="h-full rounded-full bg-[#7465d8]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-4 line-clamp-2 min-h-10 text-xs font-medium leading-5">
            {lesson?.title ?? t.noLessons}
          </p>
          <Button asChild variant="ghost" className="-ml-3 mt-1 text-xs">
            <Link
              href={
                lesson && !sample
                  ? `/learning/resources/${lesson.id}`
                  : "/work/learn"
              }
            >
              {t.continue}
              <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        </>
      )}
    </Panel>
  );
}

export function CustomerProgress({
  summary,
  sample,
  onAdd,
}: {
  summary: ReturnType<typeof customerSummary>;
  sample: boolean;
  onAdd: () => void;
}) {
  const { t } = useWorkCopy();
  return (
    <Panel className="h-full">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t.customerOverview}</h2>
        <Preview show={sample} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-soft p-3">
          <p className="text-2xl font-semibold">{summary.newThisMonth}</p>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
            {t.newCustomers}
          </p>
        </div>
        <div className="rounded-xl bg-surface-coral p-3">
          <p className="text-2xl font-semibold text-brand-accent">
            {summary.followUps.length}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
            {t.upcomingFollowUps}
          </p>
        </div>
      </div>
      <p className="mt-4 text-[10px] leading-4 text-muted-foreground">
        {t.nextSevenDays}
      </p>
      <ul className="mt-1 divide-y divide-border-soft/60">
        {summary.followUps.slice(0, 3).map((customer, index) => (
          <li key={customer.id} className="flex items-center gap-2 py-1.5">
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] leading-4 font-semibold ${index % 2 ? "bg-[#f0edfc] text-[#7465d8]" : "bg-surface-navy text-brand-primary"}`}
            >
              {customer.name.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">
              {customer.name}
            </span>
            <span className="text-[10px] leading-4 text-muted-foreground">
              {customer.follow_up_on?.slice(5)}
            </span>
          </li>
        ))}
      </ul>
      {!summary.followUps.length && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {t.noFollowUps}
        </p>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="-ml-3 mt-2 text-xs"
        onClick={onAdd}
      >
        {t.addCustomer}
        <ArrowUpRightIcon className="size-3.5" />
      </Button>
    </Panel>
  );
}
