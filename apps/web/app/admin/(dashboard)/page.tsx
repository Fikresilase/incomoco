import type { Metadata } from "next";
import { AnalyticsOverview } from "@/features/analytics";

export const metadata: Metadata = { title: "Admin overview" };

export default function AdminOverviewPage() {
  return <AnalyticsOverview />;
}
