import { apiBlob, apiFetch, apiRequest } from "@/lib/api";

export type HumanPerson = { id: string; name: string; business_name: string | null; business_type: string | null; language: string; is_demo?: boolean; adviser?: string | null; adviser_account_id?: string | null; assigned_at?: string };
export type Adviser = { id: string; email: string; display_name: string; is_active: boolean };
export type AssignmentHistory = { id: string; entrepreneur_profile_id: string; entrepreneur_name: string; adviser_account_id: string; adviser_name: string; assigned_by_account_id: string; assigned_by_name: string; status: string; assigned_at: string; ended_at: string | null; reason: string | null };
export type Assignment = { id: string; entrepreneur_profile_id: string; adviser_account_id: string; assigned_at: string; name: string; business_name: string | null; business_type: string | null; language: string; adviser_name?: string | null };
export type HumanConversation = { id: string; entrepreneur_profile_id: string; adviser_assignment_id: string; status: string };
export type HumanMessage = { id: string; sender_account_id: string; message_type: "text" | "audio"; text_body: string | null; created_at: string; read_at: string | null };
export type HumanNotification = { id: string; event_type: string; related_entity_id: string; title?: string | null; body?: string | null; created_at: string; read_at: string | null };

export const humanApi = {
  advisers: () => apiFetch<Adviser[]>("/human/admin/advisers"),
  assignmentHistory: () => apiFetch<AssignmentHistory[]>("/human/admin/assignments/history"),
  createAdviser: (body: { email: string; display_name: string; password: string }) => apiFetch<Adviser>("/human/admin/advisers", { method: "POST", body: { ...body, role: "adviser" } }),
  deactivate: (id: string) => apiFetch(`/human/admin/advisers/${id}/deactivate`, { method: "POST", body: {} }),
  adminEntrepreneurs: () => apiFetch<HumanPerson[]>("/human/admin/entrepreneurs"),
  adviserEntrepreneurs: () => apiFetch<HumanPerson[]>("/human/adviser/entrepreneurs"),
  assignments: () => apiFetch<Assignment[]>("/human/assignments"),
  assign: (body: { entrepreneur_profile_id: string; adviser_account_id: string; reason?: string }) => apiFetch("/human/assignments", { method: "POST", body }),
  removeAssignment: (id: string) => apiFetch(`/human/admin/assignments/${id}/remove`, { method: "POST", body: {} }),
  conversation: (profileId: string) => apiFetch<HumanConversation | null>(`/human/conversations/${profileId}`),
  openConversation: (profileId: string) => apiFetch<HumanConversation>(`/human/conversations/${profileId}`, { method: "POST", body: {} }),
  messages: (id: string) => apiFetch<HumanMessage[]>(`/human/conversations/${id}/messages`),
  send: (id: string, text_body: string) => apiFetch<HumanMessage>(`/human/conversations/${id}/messages`, { method: "POST", body: { text_body } }),
  upload: async (id: string, blob: Blob) => { const form = new FormData(); form.append("audio", blob, "voice.wav"); const response = await apiRequest(`/human/conversations/${id}/audio`, { method: "POST", body: form }); return response.json() as Promise<HumanMessage>; },
  audio: (id: string) => apiBlob(`/human/messages/${id}/audio`),
  notifications: () => apiFetch<HumanNotification[]>("/human/notifications"),
  notificationCount: () => apiFetch<{ count: number }>("/human/notifications/unread-count"),
  markNotificationRead: (id: string) => apiFetch(`/human/notifications/${id}/read`, { method: "POST", body: {} }),
  markRead: (id: string) => apiFetch(`/human/conversations/${id}/read`, { method: "POST", body: {} }),
  recommendations: (profileId: string) => apiFetch<Array<{ id: string; learning_resource_id: string; title: string; note: string | null }>>(`/human/recommendations/${profileId}`),
  recommend: (profileId: string, learning_resource_id: string, note?: string) => apiFetch(`/human/recommendations/${profileId}`, { method: "POST", body: { learning_resource_id, note } }),
};
