// Pal: /api/pal/* (docs/BRAIN.md §4).
import { request } from "./client";
import type { PalBreakdown, PalChatContext, PalChatReply } from "./types";

export const palBreakdown = (task: string, signal?: AbortSignal) =>
  request<PalBreakdown>("/pal/breakdown", { method: "POST", body: { json: { task } }, signal, timeoutMs: 60000 });

/** Run the on-device crisis check BEFORE calling this; a crisis-sounding message is never sent. */
export const palChat = (message: string, context: PalChatContext | null, signal?: AbortSignal) =>
  request<PalChatReply>("/pal/chat", { method: "POST", body: { json: { message, context } }, signal, timeoutMs: 60000 });

export const clearPalChat = () => request<{ deleted: number }>("/pal/chat", { method: "DELETE" });
