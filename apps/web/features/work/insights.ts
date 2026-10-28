import type { BusinessAction, Customer, Todo, Transaction } from "./api";

export function financialSeries(
  transactions: Transaction[],
  month: string,
  currency: string,
) {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const points = Array.from({ length: days }, (_, index) => ({
    day: index + 1,
    income: 0,
    expense: 0,
    net: 0,
  }));
  for (const entry of transactions) {
    if (
      entry.currency !== currency ||
      !entry.occurred_on.startsWith(`${month}-`)
    )
      continue;
    const point = points[Number(entry.occurred_on.slice(8, 10)) - 1];
    if (!point) continue;
    // Chart coordinates use numbers; the authoritative ledger retains decimal strings.
    point[entry.kind] += Number(entry.amount);
    point.net = point.income - point.expense;
  }
  return points;
}

export function taskSummary(todos: Todo[], actions: BusinessAction[]) {
  const counts = {
    assigned: 0,
    inProgress: 0,
    completed: 0,
    needsHelp: 0,
    total: 0,
    percent: 0,
  };
  for (const todo of todos) {
    counts[
      todo.completed_at
        ? "completed"
        : todo.started_at
          ? "inProgress"
          : "assigned"
    ]++;
  }
  for (const action of actions) {
    if (action.status === "skipped") continue;
    counts[
      action.status === "completed"
        ? "completed"
        : action.status === "started"
          ? "inProgress"
          : action.status === "needs_help"
            ? "needsHelp"
            : "assigned"
    ]++;
  }
  counts.total =
    counts.assigned + counts.inProgress + counts.completed + counts.needsHelp;
  counts.percent = counts.total
    ? Math.round((100 * counts.completed) / counts.total)
    : 0;
  return counts;
}

function localDay(timestamp: string) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function customerSummary(
  customers: Customer[],
  month: string,
  today: string,
) {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  const until = end.toISOString().slice(0, 10);
  const followUps = customers
    .filter(
      (customer) => customer.follow_up_on && customer.follow_up_on <= until,
    )
    .sort((a, b) => a.follow_up_on!.localeCompare(b.follow_up_on!));
  return {
    total: customers.length,
    newThisMonth: customers.filter(
      (customer) =>
        customer.created_at &&
        localDay(customer.created_at).startsWith(`${month}-`),
    ).length,
    followUps,
    overdue: followUps.filter((customer) => customer.follow_up_on! < today)
      .length,
  };
}

export function sampleTransactions(
  month: string,
  persona = "aster",
): Transaction[] {
  const factor =
    (
      {
        aster: 1,
        hana: 0.8,
        mohammed: 1.4,
        bekele: 1.15,
        mulu: 0.65,
      } as Record<string, number>
    )[persona] ?? 1;
  return Array.from({ length: 24 }, (_, index) => {
    const day = index + 1;
    return [
      {
        id: `sample-income-${day}`,
        kind: "income" as const,
        amount: String(Math.round((420 + ((day * 173) % 1100)) * factor)),
        currency: "ETB",
        description: "Sample sale",
        occurred_on: `${month}-${String(day).padStart(2, "0")}`,
      },
      {
        id: `sample-expense-${day}`,
        kind: "expense" as const,
        amount: String(Math.round((150 + ((day * 97) % 520)) * factor)),
        currency: "ETB",
        description: "Sample expense",
        occurred_on: `${month}-${String(day).padStart(2, "0")}`,
      },
    ];
  }).flat();
}

export function sampleActivity(today: string) {
  const result: Record<string, number> = {};
  const end = new Date(`${today}T12:00:00Z`);
  for (let index = 0; index < 91; index++) {
    if (index % 5 === 2 || index % 9 === 4) continue;
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - index);
    result[day.toISOString().slice(0, 10)] = 1 + (index % 5);
  }
  return result;
}

export function sampleCustomers(
  month: string,
  today: string,
  persona = "aster",
): Customer[] {
  const [year, number] = month.split("-").map(Number);
  const previous = new Date(Date.UTC(year, number - 2, 1, 12)).toISOString();
  const names = ["Aster", "Hana", "Mulu", "Sara", "Meron", "Dawit"];
  const count =
    (
      { aster: 28, hana: 18, mohammed: 34, bekele: 22, mulu: 16 } as Record<
        string,
        number
      >
    )[persona] ?? 28;
  return Array.from({ length: count }, (_, index) => {
    const followUp = new Date(`${today}T12:00:00Z`);
    followUp.setUTCDate(followUp.getUTCDate() + index + 1);
    return {
      id: `sample-customer-${index}`,
      name: names[index] ?? `Sample customer ${index + 1}`,
      created_at:
        index < 6
          ? `${month}-${String(index + 1).padStart(2, "0")}T12:00:00Z`
          : previous,
      contact: "",
      notes: "",
      follow_up_on: index < 3 ? followUp.toISOString().slice(0, 10) : null,
    };
  });
}

export function sampleProfileProgress(persona: string) {
  const completed =
    (
      { aster: 8, hana: 5, mohammed: 9, bekele: 6, mulu: 3 } as Record<
        string,
        number
      >
    )[persona] ?? 8;
  const assigned = persona === "mulu" ? 4 : 2;
  const inProgress = persona === "hana" ? 3 : 4;
  const total = completed + assigned + inProgress;
  return {
    counts: {
      assigned,
      inProgress,
      completed,
      needsHelp: 0,
      total,
      percent: Math.round((100 * completed) / total),
    },
    lessons:
      (
        { aster: 6, hana: 4, mohammed: 5, bekele: 7, mulu: 2 } as Record<
          string,
          number
        >
      )[persona] ?? 6,
  };
}
