"use client";

import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, FileUp, Loader2, Play } from "lucide-react";
import { useState } from "react";
import { AdviserNav } from "@/features/human/components/adviser-nav";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const CourseModal = dynamic(() => import("@/features/learning/course-modal"), { ssr: false });
type Course = { id: string; title: string; language: string; status: string; error: string | null; lessons: { id: string; title: string; status: string; ready: boolean }[] };

export default function AdviserCoursesPage() {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  const courses = useQuery({ queryKey: ["adviser-courses"], queryFn: () => apiFetch<Course[]>("/adviser/courses"),
    refetchInterval: (query) => query.state.data?.some((c) => ["queued", "generating"].includes(c.status)) ? 4000 : false });
  const upload = useMutation({ mutationFn: () => {
    const body = new FormData(); body.append("file", file!); body.append("language", language);
    return apiFetch("/adviser/courses", { method: "POST", body });
  }, onSuccess: () => { setFile(null); setLanguage(""); setUploadKey((n) => n + 1); void client.invalidateQueries({ queryKey: ["adviser-courses"] }); } });
  const action = useMutation({ mutationFn: ({ id, action }: { id: string; action: "publish" | "retry" }) => apiFetch(`/adviser/courses/${id}/${action}`, { method: "POST" }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["adviser-courses"] }); void client.invalidateQueries({ queryKey: ["learning-resources"] }); } });
  return <><AdviserNav active="courses" /><main className="mx-auto max-w-5xl px-5 py-10">
    <div className="flex items-center gap-3"><BookOpen className="size-7 text-brand-primary" /><h1 className="text-3xl font-bold">Prepare learning courses</h1></div>
    <p className="mt-3 max-w-2xl leading-7 text-text-secondary">Upload your training material. We’ll prepare narrated animations and practice questions once, ready for learners to watch. Preview each lesson before publishing.</p>
    <form className="mt-7 grid gap-4 rounded-2xl border border-border-soft bg-surface p-5 sm:grid-cols-[1fr_auto_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); if (file && language) upload.mutate(); }}>
      <label className="grid gap-2 text-sm font-medium">Source document<input key={uploadKey} type="file" accept=".pdf,.docx,.txt,.md" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block max-w-full rounded-lg border p-2" /><span className="text-xs font-normal text-text-secondary">PDF, DOCX, TXT, or Markdown · up to 25 MB</span></label>
      <label className="grid gap-2 text-sm font-medium">Lesson language<select required value={language} onChange={(e) => setLanguage(e.target.value)} className="min-h-11 rounded-lg border bg-white px-3"><option value="" disabled>Choose lesson language</option><option value="en">English</option><option value="am">አማርኛ</option><option value="om">Afaan Oromo</option><option value="so">Somali</option></select></label>
      <Button type="submit" disabled={!file || !language || upload.isPending}>{upload.isPending ? <Loader2 className="animate-spin" /> : <FileUp />}Prepare course</Button>
    </form>
    {upload.isError && <p role="alert" className="mt-3 text-destructive">{upload.error.message}</p>}
    {action.isError && <p role="alert" className="mt-3 text-destructive">{action.error.message}</p>}
    {courses.isPending && <p className="mt-8" aria-busy="true">Loading courses…</p>}
    {courses.isError && <p className="mt-8 text-destructive" role="alert">{courses.error.message}</p>}
    <div className="mt-8 grid gap-5">{courses.data?.map((course) => <article key={course.id} className="rounded-2xl border border-border-soft bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{course.title}</h2><p className="mt-1 text-sm capitalize text-text-secondary">{course.language} · {course.status === "ready" ? "Prepared" : course.status} · {course.lessons.length} lessons</p></div>
        {course.status === "ready" && (course.lessons.every((l) => l.status === "approved") ? <span className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="size-4" />Published</span> : <Button disabled={action.isPending} onClick={() => action.mutate({ id: course.id, action: "publish" })}>Publish course</Button>)}
        {course.status === "failed" && <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({ id: course.id, action: "retry" })}>Retry preparation</Button>}
        {["queued", "generating"].includes(course.status) && <Loader2 aria-label="Preparing" className="size-5 animate-spin text-brand-primary" />}
      </div>
      {course.error && <p className="mt-3 text-sm text-destructive">{course.error}</p>}
      <ol className="mt-4 divide-y divide-border-soft">{course.lessons.map((lesson, index) => <li key={lesson.id} className="flex items-center justify-between gap-3 py-3"><span>{index + 1}. {lesson.title}</span><Button variant="outline" size="sm" disabled={!lesson.ready} onClick={() => setPreview(lesson.id)}><Play className="size-4" />{lesson.ready ? "Preview" : "Preparing…"}</Button></li>)}</ol>
    </article>)}</div>
    {courses.data?.length === 0 && <p className="mt-8 text-text-secondary">Your prepared courses will appear here.</p>}
    {preview && <CourseModal resourceId={preview} preview onClose={() => setPreview(null)} />}
  </main></>;
}
