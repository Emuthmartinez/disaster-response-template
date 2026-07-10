"use client";

export const SESSION_INVALIDATED_EVENT = "admin:session-invalidated";

export type FetchInit = Parameters<typeof fetch>[1];

export async function adminFetch(
  input: Parameters<typeof fetch>[0],
  init?: FetchInit,
): Promise<Response> {
  const response = await fetch(input, { credentials: "same-origin", ...init });
  if (response.status === 401) {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    window.dispatchEvent(new Event(SESSION_INVALIDATED_EVENT));
  }
  return response;
}
