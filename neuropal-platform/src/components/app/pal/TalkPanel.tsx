"use client";
// "Talk": a short chat with Pal (POST /api/pal/chat), the last 10 messages
// on screen. Every message goes through the crisis check FIRST: one that
// sounds like a crisis is never sent; Pal answers here with a careful reply,
// the calming steps and people to call. The server's own crisis reply
// (crisis: true) is shown the same way. Replies are spoken by the announcer.
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/neuropal/client";
import type { DayData } from "@/lib/neuropal/day";
import { palSay, type PalLook } from "@/lib/neuropal/look";
import { clearPalChat, palChat } from "@/lib/neuropal/pal";
import { chatContext, CRISIS_REPLY, looksLikeCrisis, MESSAGE_MAX_CHARS } from "@/lib/neuropal/palLogic";
import { CHAT_SHOWN, clearLocalChat, pushChat, useChat, type PalChatItem } from "@/lib/neuropal/palState";
import { announce } from "../common/announce";
import { ROUTES } from "../common/appNav";
import { HelpLines } from "../common/HelpLines";
import { LeafIcon, SendIcon } from "../common/icons";
import styles from "./pal.module.css";

function fallbackLine(pal: PalLook, e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0 && !/took too long/.test(e.message)) return palSay(pal, "talkOffline");
    if (e.status === 429) return e.message || "That’s a lot of chat for now. The other tools here still work.";
  }
  return palSay(pal, "talkError");
}

export function TalkPanel({ pal, day }: { pal: PalLook; day: DayData }) {
  const id = useId();
  const chat = useChat();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const shown = chat.slice(-CHAT_SHOWN);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, sending]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setCleared(null);
    pushChat({ role: "user", text });
    // The safety net runs before anything leaves this browser.
    if (looksLikeCrisis(text)) {
      pushChat({ role: "pal", text: CRISIS_REPLY, crisis: true, local: true });
      announce(`${pal.name}: ${CRISIS_REPLY}`, { assertive: true });
      return;
    }
    setSending(true);
    announce(`${pal.name} is thinking…`);
    let reply: string;
    try {
      const context = chatContext({ state: day.state, now: new Date(), anchors: day.anchors, tasks: day.tasks, pal });
      const r = await palChat(text, context);
      reply = r?.reply || palSay(pal, "talkError");
      pushChat({ role: "pal", text: reply, crisis: Boolean(r?.crisis), local: !r?.reply });
      if (r?.crisis) {
        if (alive.current) setSending(false);
        announce(`${pal.name}: ${reply}`, { assertive: true });
        return;
      }
    } catch (err) {
      reply = fallbackLine(pal, err);
      pushChat({ role: "pal", text: reply, local: true });
    }
    if (!alive.current) return; // closed meanwhile: don't speak over whatever came next
    setSending(false);
    announce(`${pal.name}: ${reply}`);
    inputRef.current?.focus();
  };

  const clearAll = async () => {
    clearLocalChat();
    setConfirmClear(false);
    let line: string;
    try {
      await clearPalChat();
      line = "Cleared here and on your server.";
    } catch {
      line = "Cleared in this browser. The server copy stays until it can be reached.";
    }
    if (!alive.current) return;
    setCleared(line);
    inputRef.current?.focus();
  };

  return (
    <div className={`${styles.tool} ${styles.talk}`}>
      <h2 className={`np-display ${styles.toolTitle}`}>Talk</h2>
      <p className={styles.intro}>{palSay(pal, "talk")}</p>

      {day.state === "red" ? (
        <div className={styles.redLine}>
          <p>If this feels like too much, the calming steps are here.</p>
          <Link href={ROUTES.calm} className="np-btn np-btn--small">
            <LeafIcon />
            Calming steps
          </Link>
        </div>
      ) : null}

      <ol ref={listRef} className={styles.messages} aria-label={`Chat with ${pal.name}`} tabIndex={shown.length ? 0 : undefined}>
        {shown.map((m) => (
          <Message key={m.id} m={m} pal={pal} />
        ))}
        {!shown.length ? <li className={styles.emptyChat}>No messages yet.</li> : null}
      </ol>
      {sending ? <p className={styles.thinking}>{pal.name} is thinking…</p> : null}

      <form className={styles.composer} onSubmit={send}>
        <label htmlFor={`${id}-msg`} className="np-sr-only">
          Message to {pal.name}
        </label>
        <input
          ref={inputRef}
          id={`${id}-msg`}
          className="np-input"
          type="text"
          autoComplete="off"
          maxLength={MESSAGE_MAX_CHARS}
          placeholder={`Message ${pal.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_CHARS))}
        />
        <button type="submit" className={`np-btn ${styles.sendButton}`} aria-disabled={!draft.trim() || sending}>
          <SendIcon />
          <span className="np-sr-only">Send</span>
        </button>
      </form>

      <p className={styles.small}>
        Talk sends your message and today’s plan to your NeuroPal server’s AI. If a message sounds like a crisis, {pal.name} answers
        here and doesn’t send it. This check can miss things.
      </p>
      <div className={styles.statusRow} role="status">
        {cleared ?? ""}
      </div>
      {chat.length ? (
        confirmClear ? (
          <div className={styles.confirm}>
            <p>Clear the whole chat?</p>
            <button type="button" className="np-btn np-btn--small" onClick={clearAll}>
              Yes, clear it
            </button>
            <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => setConfirmClear(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" className={styles.textButton} onClick={() => setConfirmClear(true)}>
            Clear chat
            <span className="np-sr-only"> with {pal.name}</span>
          </button>
        )
      ) : null}
    </div>
  );
}

function Message({ m, pal }: { m: PalChatItem; pal: PalLook }) {
  const mine = m.role === "user";
  return (
    <li className={`${styles.message} ${mine ? styles.mine : styles.theirs}`}>
      <div className={styles.bubble}>
        <p className={styles.msgWho}>{mine ? "You" : pal.name}</p>
        {/* Server text is shown as text, never as HTML. */}
        <p className={styles.messageText}>{m.text}</p>
      </div>
      {m.crisis ? (
        <div className={styles.crisis}>
          <Link href={ROUTES.calm} className="np-btn">
            <LeafIcon />
            Open the calming steps
          </Link>
          <HelpLines level={3} />
        </div>
      ) : null}
    </li>
  );
}
