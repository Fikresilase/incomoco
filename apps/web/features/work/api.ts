import { apiFetch } from "@/lib/api";
export type Todo = {
  id: string;
  title: string;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
};
export type Transaction = {
  id: string;
  kind: "income" | "expense";
  amount: string;
  currency: string;
  description: string;
  occurred_on: string;
};
export type Customer = {
  id: string;
  name: string;
  contact: string;
  notes: string;
  follow_up_on: string | null;
};
export type WorkData = {
  month: string;
  today: string;
  todos: Todo[];
  customers: Customer[];
  transactions: Transaction[];
  totals: Record<string, { income: string; expense: string }>;
  activity: Record<string, number>;
  customer_count: number;
};
export type BusinessAction = {
  id: string;
  title: string;
  description: string;
  status: "recommended" | "started" | "completed" | "needs_help" | "skipped";
  due_date: string | null;
  target_count: number | null;
  progress_count: number;
  progress_unit: string | null;
};
export type Dashboard = {
  demo_account: boolean;
  profile_name: string;
  business_name: string | null;
  today_priority: string;
  priority_reason: string;
  current_lesson: { id: string; title: string } | null;
  completed_lessons: { id: string }[];
  next_actions: {
    id: string;
    title: string;
    status: string;
    due_date: string | null;
  }[];
  goal: { title: string } | null;
};
export function getWork(month?: string) {
  return apiFetch<WorkData>("/me/work", {
    query: {
      month,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
}
export const workKey = ["work"];
