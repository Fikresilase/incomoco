import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerSummary,
  financialSeries,
  sampleActivity,
  sampleCustomers,
  sampleTransactions,
  taskSummary,
} from "./insights";
import type { BusinessAction, Customer, Todo, Transaction } from "./api";

test("money charts separate currencies, aggregate daily entries, and preserve leap days", () => {
  const entry = (
    amount: string,
    currency = "ETB",
    occurred_on = "2024-02-29",
    kind: Transaction["kind"] = "income",
  ): Transaction => ({
    id: amount,
    amount,
    currency,
    occurred_on,
    kind,
    description: "Sale",
  });
  const points = financialSeries(
    [
      entry("100.10"),
      entry("0.20"),
      entry("30.05", "ETB", "2024-02-29", "expense"),
      entry("500", "USD"),
      entry("1000", "ETB", "2024-03-01"),
    ],
    "2024-02",
    "ETB",
  );
  assert.equal(points.length, 29);
  assert.equal(points[0].income, 0);
  assert.ok(Math.abs(points[28].income - 100.3) < 0.00001);
  assert.ok(Math.abs(points[28].net - 70.25) < 0.00001);
  assert.equal(financialSeries([], "2025-02", "ETB").length, 28);
});

test("task progress combines personal and assigned tasks without counting skipped work", () => {
  const todo = (
    started_at: string | null,
    completed_at: string | null,
  ): Todo => ({
    id: "task",
    title: "Task",
    due_date: null,
    started_at,
    completed_at,
  });
  const action = (status: BusinessAction["status"]): BusinessAction => ({
    id: status,
    title: status,
    description: "",
    due_date: null,
    target_count: null,
    progress_count: 0,
    progress_unit: null,
    status,
  });
  assert.deepEqual(
    taskSummary(
      [todo(null, null), todo("started", null), todo("started", "done")],
      [
        action("recommended"),
        action("started"),
        action("completed"),
        action("needs_help"),
        action("skipped"),
      ],
    ),
    {
      assigned: 2,
      inProgress: 2,
      completed: 2,
      needsHelp: 1,
      total: 7,
      percent: 29,
    },
  );
  assert.equal(taskSummary([], []).percent, 0);
});

test("customer summary uses dated records and includes overdue plus the next seven days", () => {
  const customer = (
    id: string,
    follow_up_on: string | null,
    created_at = new Date(2026, 9, 5, 12).toISOString(),
  ): Customer => ({
    id,
    name: id,
    contact: "",
    notes: "",
    created_at,
    follow_up_on,
  });
  const summary = customerSummary(
    [
      customer("overdue", "2026-10-27"),
      customer("soon", "2026-11-04"),
      customer("later", "2026-11-05"),
      customer("old", null, new Date(2026, 8, 3, 12).toISOString()),
    ],
    "2026-10",
    "2026-10-28",
  );
  assert.equal(summary.total, 4);
  assert.equal(summary.newThisMonth, 3);
  assert.equal(summary.overdue, 1);
  assert.deepEqual(
    summary.followUps.map((customer) => customer.id),
    ["overdue", "soon"],
  );
});

test("sample visuals derive their totals consistently without writing real records", () => {
  const entries = sampleTransactions("2026-10");
  const points = financialSeries(entries, "2026-10", "ETB");
  assert.equal(entries.length, 48);
  assert.equal(
    points.reduce((sum, point) => sum + point.income, 0),
    entries
      .filter((entry) => entry.kind === "income")
      .reduce((sum, entry) => sum + Number(entry.amount), 0),
  );
  const customers = customerSummary(
    sampleCustomers("2026-10", "2026-10-28"),
    "2026-10",
    "2026-10-28",
  );
  assert.equal(customers.total, 28);
  assert.equal(customers.newThisMonth, 6);
  assert.equal(customers.followUps.length, 3);
  const activity = sampleActivity("2026-10-28");
  assert.ok(
    Object.keys(activity).every(
      (day) => day >= "2026-07-30" && day <= "2026-10-28",
    ),
  );
  assert.ok(activity["2026-10-28"] > 0);
});

test("switching demo profiles changes sample money and customer data", () => {
  assert.notDeepEqual(
    sampleTransactions("2026-10", "aster"),
    sampleTransactions("2026-10", "hana"),
  );
  assert.equal(sampleCustomers("2026-10", "2026-10-28", "hana").length, 18);
  assert.equal(sampleCustomers("2026-10", "2026-10-28", "aster").length, 28);
});
