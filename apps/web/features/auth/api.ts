import { apiFetch, type AdminLoginRequest, type AdminUser } from "@/lib/api";

export const authKeys = {
  me: ["admin", "me"] as const,
};

export const login = (body: AdminLoginRequest) =>
  apiFetch<AdminUser>("/admin/login", { method: "POST", body });

export const logout = () => apiFetch<void>("/admin/logout", { method: "POST" });

export const getMe = () => apiFetch<AdminUser>("/admin/me");
