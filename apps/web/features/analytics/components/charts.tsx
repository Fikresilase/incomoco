"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, formatShortDate } from "@/lib/format";
import { AXIS, GRID } from "../colors";

export interface SeriesDef<K extends string> {
  key: K;
  label: string;
  color: string;
}

export function ChartCard({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5 ${className ?? ""}`}>
      <h2 className="text-base font-bold text-secondary">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Legend<K extends string>({ series }: { series: SeriesDef<K>[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-xs font-semibold text-secondary">
          <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ChartTooltip<K extends string>({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>;
  label?: unknown;
  series: SeriesDef<K>[];
}) {
  const locale = useLocale();
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-bold text-secondary">{formatShortDate(String(label), locale)}</p>
      <ul className="space-y-1">
        {series.map((s) => {
          const item = payload.find((p) => p.dataKey === s.key);
          return (
            <li key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.label}
              </span>
              <span className="font-semibold text-secondary tabular-nums">
                {formatNumber(Number(item?.value ?? 0), locale)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Visible-on-demand table view of a time series (accessibility + exact numbers). */
function SeriesTable<K extends string>({
  data,
  series,
}: {
  data: ({ date: string } & Record<K, number>)[];
  series: SeriesDef<K>[];
}) {
  const t = useTranslations("admin.overviewPage");
  const locale = useLocale();
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-violet hover:underline">
        {t("showTable")}
      </summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-bold text-secondary">
                {t("date")}
              </th>
              {series.map((s) => (
                <th key={s.key} scope="col" className="px-3 py-2 text-right font-bold text-secondary">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.date} className="border-t border-border">
                <td className="px-3 py-1.5 text-secondary">{formatShortDate(row.date, locale)}</td>
                {series.map((s) => (
                  <td key={s.key} className="px-3 py-1.5 text-right tabular-nums">
                    {formatNumber(row[s.key], locale)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function NoData() {
  const t = useTranslations("admin.overviewPage");
  return (
    <div className="flex h-56 items-center justify-center rounded-lg bg-muted/50 text-sm text-muted-foreground">
      {t("noData")}
    </div>
  );
}

function useAxisProps() {
  const locale = useLocale();
  return {
    x: {
      dataKey: "date",
      tickFormatter: (v: string) => formatShortDate(v, locale),
      tick: { fill: AXIS, fontSize: 11 },
      tickLine: false,
      axisLine: { stroke: GRID },
      minTickGap: 24,
      interval: "preserveStartEnd" as const,
      tickMargin: 8,
    },
    y: {
      tick: { fill: AXIS, fontSize: 11 },
      tickLine: false,
      axisLine: false,
      allowDecimals: false,
      width: 36,
      tickFormatter: (v: number) => formatNumber(v, locale),
    },
  };
}

/** Daily counts as lines (one shared y-axis: all series are counts). */
export function TimeLineChart<K extends string>({
  data,
  series,
}: {
  data: ({ date: string } & Record<K, number>)[];
  series: SeriesDef<K>[];
}) {
  const axis = useAxisProps();
  const empty = data.every((row) => series.every((s) => !row[s.key]));
  if (data.length === 0 || empty) return <NoData />;
  return (
    <>
      <Legend series={series} />
      <div className="h-60 w-full min-w-0 overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis {...axis.x} />
            <YAxis {...axis.y} />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              content={(p) => (
                <ChartTooltip active={p.active} payload={p.payload} label={p.label} series={series} />
              )}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SeriesTable data={data} series={series} />
    </>
  );
}

/** Daily stacked bars (e.g. positive vs negative feedback). */
export function StackedBarChart<K extends string>({
  data,
  series,
}: {
  data: ({ date: string } & Record<K, number>)[];
  series: SeriesDef<K>[];
}) {
  const axis = useAxisProps();
  const empty = data.every((row) => series.every((s) => !row[s.key]));
  if (data.length === 0 || empty) return <NoData />;
  return (
    <>
      <Legend series={series} />
      <div className="h-60 w-full min-w-0 overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis {...axis.x} />
            <YAxis {...axis.y} />
            <Tooltip
              cursor={{ fill: "rgba(0,32,95,0.04)" }}
              content={(p) => (
                <ChartTooltip active={p.active} payload={p.payload} label={p.label} series={series} />
              )}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="stack"
                fill={s.color}
                stroke="#fff"
                strokeWidth={1}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : undefined}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SeriesTable data={data} series={series} />
    </>
  );
}

/** Share-of-total bars with direct labels (count + percent). */
export function SplitBars({
  items,
}: {
  items: { key: string; label: string; value: number; color: string }[];
}) {
  const locale = useLocale();
  const total = items.reduce((n, i) => n + i.value, 0);
  if (total === 0) return <NoData />;
  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const share = item.value / total;
        return (
          <li key={item.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-secondary">
                <span className="size-2.5 rounded-full" style={{ background: item.color }} aria-hidden />
                {item.label}
              </span>
              <span className="text-muted-foreground tabular-nums">
                <span className="font-semibold text-secondary">{formatNumber(item.value, locale)}</span>
                {" · "}
                {new Intl.NumberFormat(locale === "am" ? "am-ET" : "en-US", {
                  style: "percent",
                  maximumFractionDigits: 0,
                }).format(share)}
              </span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-label={item.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(share * 100)}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%`, background: item.color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
