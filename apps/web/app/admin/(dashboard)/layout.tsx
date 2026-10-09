import type { ReactNode } from "react";
import { AdminShell } from "@/features/auth";

export default function AdminDashboardLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
