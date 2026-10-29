// Account: /api/auth/* (docs/BRAIN.md §4). Sign-in itself is `login` in
// lib/api.ts (the site's sign-in page uses it too).
import { request } from "./client";
import type { AuthConfig } from "./types";
import type { PublicUser } from "@/lib/api";

export const authConfig = () => request<AuthConfig>("/auth/config", { auth: false });

export const register = (email: string, password: string, name?: string, inviteCode?: string) =>
  request<{ token: string; user: PublicUser }>("/auth/register", {
    method: "POST",
    body: { json: { email, password, name, inviteCode } },
    auth: false,
  });

/** Ends every session of the account (this one included). */
export const logoutEverywhere = () => request<{ ok: boolean }>("/auth/logout-all", { method: "POST" });

/** Returns a new token; every other session ends. */
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ token: string }>("/auth/password", { method: "POST", body: { json: { currentPassword, newPassword } } });
