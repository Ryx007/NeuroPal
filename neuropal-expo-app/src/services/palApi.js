// Pal's server calls (neuropal-backend/src/routes/pal.js). Offline-first:
// every function here resolves, never throws. When the server is not
// configured, known to be down, in mock mode, rate-limited or failing, the
// caller gets a local answer plus a `reason` it can say out loud.
//
//   requestBreakdown(task)        → { steps, source, reason?, message? } or, for a
//                                   task that sounds like a crisis, { steps: [], crisis: true, reply }
//   sendPalChat(message, context) → { reply, crisis, source, reason?, message? }
//   clearPalChat()                → true when the server copy is gone
//
// source: 'server' | 'local'. reason (local only): 'mock' | 'offline' |
// 'limited' (429: hourly cap or daily AI budget) | 'error'.

import { getApiStatus, recheckApi, apiConfigured } from "../store/ApiLink";
import { apiClient, describeNetworkError, USE_MOCK } from "./network";
import { CRISIS_REPLY, TASK_MAX_CHARS, cleanSteps, localBreakdown, looksLikeCrisis } from "./palAssistant";

// LLM round-trips: the cloud model answers in seconds, a local model can take
// much longer — the sheet offers the offline answer while it waits.
const AI_TIMEOUT_MS = 60000;

function unreachable() {
  if (USE_MOCK) return "mock";
  if (!apiConfigured) return "offline";
  const state = getApiStatus().state;
  if (state === "down" || state === "unconfigured") {
    recheckApi(); // maybe it's back: the next try can use it
    return "offline";
  }
  return null;
}

function classify(error) {
  const status = error?.response?.status;
  if (status === 429) {
    return { reason: "limited", message: error.response.data?.error || "Pal has done a lot of thinking for now." };
  }
  if (!error?.response) return { reason: "offline", message: describeNetworkError(error) };
  return { reason: "error", message: describeNetworkError(error) };
}

export async function requestBreakdown(task, { signal } = {}) {
  const clean = String(task || "").trim().slice(0, TASK_MAX_CHARS);
  const local = (reason, message) => ({ steps: localBreakdown(clean), source: "local", reason, message });
  if (!clean) return local("error", "Write the task first.");
  // Safety first, and offline: never turn a crisis into a to-do list.
  if (looksLikeCrisis(clean)) return { steps: [], crisis: true, reply: CRISIS_REPLY, source: "local" };
  const skip = unreachable();
  if (skip) return local(skip);
  try {
    const { data } = await apiClient.post("pal/breakdown", { task: clean }, { timeout: AI_TIMEOUT_MS, signal });
    if (data?.crisis) return { steps: [], crisis: true, reply: String(data.reply || CRISIS_REPLY), source: "server" };
    const steps = cleanSteps(data?.steps);
    if (!steps) return local("error", "The server's steps didn't come out right.");
    return { steps, source: "server" };
  } catch (error) {
    const { reason, message } = classify(error);
    return local(reason, message);
  }
}

export async function sendPalChat(message, context, { signal } = {}) {
  const text = String(message || "").trim().slice(0, 1000);
  // Safety first, and offline: a message that sounds like a crisis gets the
  // same careful answer every time, straight away, and is not sent anywhere.
  if (looksLikeCrisis(text)) return { reply: CRISIS_REPLY, crisis: true, source: "local" };
  const skip = unreachable();
  if (skip) return { reply: null, crisis: false, source: "local", reason: skip };
  try {
    const { data } = await apiClient.post("pal/chat", { message: text, context }, { timeout: AI_TIMEOUT_MS, signal });
    const reply = String(data?.reply || "").trim();
    if (!reply) return { reply: null, crisis: false, source: "local", reason: "error", message: "The server sent an empty reply." };
    return { reply, crisis: Boolean(data?.crisis), source: "server" };
  } catch (error) {
    const { reason, message: why } = classify(error);
    return { reply: null, crisis: false, source: "local", reason, message: why };
  }
}

export async function clearPalChat() {
  if (unreachable()) return false;
  try {
    await apiClient.delete("pal/chat", { timeout: 15000 });
    return true;
  } catch (error) {
    return false;
  }
}
