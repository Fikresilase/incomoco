"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const CourseModal = dynamic(() => import("@/features/learning/course-modal"), { ssr: false });

export default function AmharicDemoPage() {
  const router = useRouter();
  return <main className="min-h-dvh bg-background"><CourseModal resourceId="demo" onClose={() => router.push("/learn")} /></main>;
}
