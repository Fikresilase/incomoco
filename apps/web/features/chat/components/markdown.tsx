"use client";

import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Source } from "@/lib/api";
import { SHOW_SOURCES, withoutCitations } from "../config";
import { CitationBadge } from "./citations";

const CITE_PREFIX = "#cite-";

/**
 * Turn `[1]`, `[2, 3]` citation markers into `[1](#cite-1)` links so the renderer can
 * swap them for badges. Markers that are real Markdown links (`[1](...)`) are untouched.
 */
export function linkifyCitations(markdown: string): string {
  return markdown.replace(
    /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\](?![(:[])/g,
    (_, list: string) =>
      list
        .split(/\s*,\s*/)
        .map((n) => `[${n}](${CITE_PREFIX}${n})`)
        .join("")
  );
}

function MarkdownImpl({ content, sources }: { content: string; sources: Source[] }) {
  const byIndex = useMemo(() => new Map(sources.map((s) => [s.index, s])), [sources]);
  const text = useMemo(
    () => (SHOW_SOURCES ? linkifyCitations(content) : withoutCitations(content)),
    [content]
  );

  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        if (href?.startsWith(CITE_PREFIX)) {
          const n = Number(href.slice(CITE_PREFIX.length));
          return <CitationBadge n={n} source={byIndex.get(n)} />;
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-violet underline underline-offset-2 hover:no-underline"
          >
            {children}
          </a>
        );
      },
      table: ({ children }) => (
        <div className="my-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">{children}</table>
        </div>
      ),
    }),
    [byIndex]
  );

  return (
    <div className="prose-chat">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Assistant Markdown with `[n]` citation badges. Raw HTML is never rendered. */
export const Markdown = memo(MarkdownImpl);
