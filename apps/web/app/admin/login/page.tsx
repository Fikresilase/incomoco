import type { Metadata } from "next";
import { LoginForm } from "@/features/auth";

export const metadata: Metadata = { title: "Admin sign in" };

export default function AdminLoginPage() {
  return <LoginForm />;
}
