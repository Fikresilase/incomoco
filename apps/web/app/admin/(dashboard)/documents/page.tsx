import type { Metadata } from "next";
import { DocumentsManager } from "@/features/documents";

export const metadata: Metadata = { title: "Knowledge base" };

export default function AdminDocumentsPage() {
  return <DocumentsManager />;
}
