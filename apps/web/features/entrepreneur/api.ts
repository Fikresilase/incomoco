import { apiFetch } from "@/lib/api";
import type { Lang } from "@/lib/api";

export type BusinessStage = "idea" | "startup" | "operating" | "growing";

export interface EntrepreneurProfile {
  id: string;
  identity_type: "registered" | "guest";
  preferred_language: Lang;
  business_name: string | null;
  business_description: string | null;
  business_type: string | null;
  business_stage: BusinessStage | null;
  business_location: string | null;
  primary_business_challenge: string | null;
  learning_goal: string | null;
  preferred_learning_format: string | null;
  experience_level: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export const getEntrepreneurProfile = () =>
  apiFetch<EntrepreneurProfile>("/me/entrepreneur-profile");

export const updateEntrepreneurProfile = (body: Partial<Omit<EntrepreneurProfile, "id" | "identity_type" | "created_at" | "updated_at">>) =>
  apiFetch<EntrepreneurProfile>("/me/entrepreneur-profile", { method: "PATCH", body });
