/**
 * Sources are always retrieved and stored by the backend (citations, analytics); this only
 * controls whether the chat UI shows the source cards and the inline `[n]` citation badges.
 * Set NEXT_PUBLIC_SHOW_SOURCES=true to show them.
 */
export const SHOW_SOURCES = process.env.NEXT_PUBLIC_SHOW_SOURCES === "true";

const CITATION_MARKERS = /\s*\[\d{1,2}(?:\s*,\s*\d{1,2})*\](?![(:[])/g;

/** Answer text without `[n]` markers, for display and copy when sources are hidden. */
export function withoutCitations(text: string): string {
  return text.replace(CITATION_MARKERS, "");
}
