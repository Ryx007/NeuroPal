import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";

import { announce } from "../../services/announce";
import { clearPalChat, sendPalChat } from "../../services/palApi";
import { chatContext } from "../../services/palAssistant";
import { clearChat, pushChat } from "../../store/slices/palSlice";
import { usePalette, useTheme } from "../../theme/ThemeProvider";
import { palSay } from "../../theme/tokens";
import { NpPrimaryButton, withAlpha } from "../primitives";
import { Intro, PalField, PanelTitle, TextAction } from "./bits";

// "Talk" — a short chat with Pal (POST /api/pal/chat). The last 10 messages
// show; the input is docked under them (the sheet's keyboard-controller
// KeyboardAvoidingView keeps it above the keyboard). In red, a line that
// can't scroll away points to the calming steps. Messages the on-phone check
// flags as a crisis get a fixed, careful answer there and are never sent;
// the check can miss phrasings, and the privacy note says so. Replies and
// status lines are spoken with announce().

const SHOWN = 10;

function fallbackLine(pal, r) {
  if (r.reason === "mock") return "[MOCK] Mock mode is on, so there’s no server to chat with. With a server, I answer here.";
  if (r.reason === "limited") return r.message || "That’s a lot of chat for now. The other tools here still work.";
  // reachable but failing ≠ offline: say which
  return palSay(pal, r.reason === "error" ? "talkError" : "talkOffline");
}

export function TalkPanel({ pal, onCalm }) {
  const palette = usePalette();
  const { isSignal, motionLevel } = useTheme();
  const dispatch = useDispatch();
  const chat = useSelector((s) => s.pal.chat);
  const nervous = useSelector((s) => s.home.nervousState);
  const anchors = useSelector((s) => s.home.anchors);
  const tasks = useSelector((s) => s.home.tasks);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(null);
  const scroll = useRef(null);
  const alive = useRef(true);
  const shown = chat.slice(-SHOWN);

  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );
  // Keep the newest message in view.
  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd?.({ animated: motionLevel !== "Still" }), 80);
    return () => clearTimeout(t);
  }, [chat.length, sending, motionLevel]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setCleared(null);
    dispatch(pushChat({ role: "user", text }));
    setSending(true);
    announce(`${pal.name} is thinking…`);
    const r = await sendPalChat(text, chatContext({ state: nervous, now: new Date(), anchors, tasks, pal }));
    // The reply lands in the store even if the sheet closed meanwhile.
    const reply = r.reply || fallbackLine(pal, r);
    dispatch(
      r.reply
        ? pushChat({ role: "pal", text: r.reply, crisis: r.crisis, local: r.source === "local" })
        : pushChat({ role: "pal", text: reply, local: true })
    );
    if (!alive.current) return; // closed meanwhile: don't speak over whatever came next
    setSending(false);
    announce(`${pal.name}: ${reply}`);
  };

  const clearAll = async () => {
    dispatch(clearChat());
    setConfirmClear(false);
    const gone = await clearPalChat();
    if (!alive.current) return;
    const line = gone ? "Cleared here and on your server." : "Cleared on this phone. The server copy stays until it can be reached.";
    setCleared(line);
    announce(line);
  };

  return (
    <View style={{ flexShrink: 1 }}>
      {nervous === "red" ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            marginHorizontal: 18,
            marginBottom: 6,
            padding: 12,
            borderRadius: isSignal ? palette.shape.radiusMedium : 16,
            borderWidth: 1.5,
            borderColor: isSignal ? palette.accent : withAlpha(palette.accent, 0.5),
            backgroundColor: withAlpha(palette.accent, 0.1),
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Text style={{ flex: 1, color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 14, lineHeight: 19 }}>
            If this feels like too much, the calming steps are here.
          </Text>
          <NpPrimaryButton label="Calming steps" icon="spa" accessibilityLabel="Open the calming steps" onPress={onCalm} />
        </View>
      ) : null}
      <ScrollView
        ref={scroll}
        style={{ flexShrink: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 2, paddingBottom: 10 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PanelTitle>Talk</PanelTitle>
        <Intro>{palSay(pal, "talk")}</Intro>
        <View style={{ marginTop: 10, gap: 8 }}>
          {shown.map((m) => (
            <Message key={m.id} m={m} pal={pal} onCalm={onCalm} />
          ))}
        </View>
        {/* Spoken with announce() in send(): a live region that appears
            already filled is never read on the web. */}
        {sending ? (
          <Text style={{ marginTop: 8, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13.5 }}>
            {`${pal.name} is thinking…`}
          </Text>
        ) : null}
        <Text style={{ marginTop: 14, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12, lineHeight: 17 }}>
          Talk sends your message and today’s plan to your NeuroPal server’s AI. If a message sounds like a crisis, Pal answers on the phone and doesn’t send it. This check can miss things.
        </Text>
        {chat.length ? (
          confirmClear ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8, alignItems: "center" }}>
              <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 13.5 }}>Clear the whole chat?</Text>
              <TextAction label="Yes, clear it" tone={palette.error} onPress={clearAll} />
              <TextAction label="Keep it" onPress={() => setConfirmClear(false)} />
            </View>
          ) : (
            <TextAction label="Clear chat" accessibilityLabel={`Clear your chat with ${pal.name}`} onPress={() => setConfirmClear(true)} />
          )
        ) : null}
        {cleared ? <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5 }}>{cleared}</Text> : null}
      </ScrollView>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 14,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: withAlpha(palette.outlineVariant, 0.5),
        }}
      >
        <PalField
          value={draft}
          onChangeText={(v) => setDraft(v.slice(0, 1000))}
          onSubmitEditing={send}
          maxLength={1000}
          returnKeyType="send"
          placeholder={`Message ${pal.name}`}
          accessibilityLabel={`Message to ${pal.name}`}
          style={{ flex: 1 }}
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !draft.trim() || sending }}
          style={{
            width: 48,
            height: 48,
            borderRadius: isSignal ? palette.shape.radiusControl : 24,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isSignal ? palette.accentFill : palette.accent,
            borderWidth: isSignal ? 1.5 : 0,
            borderColor: palette.shadowColor,
            opacity: !draft.trim() || sending ? 0.45 : 1,
          }}
        >
          <MaterialIcons name="send" size={20} color={isSignal ? palette.accentInk : palette.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

function Message({ m, pal, onCalm }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const mine = m.role === "user";
  const who = mine ? "You" : pal.name;
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
      <View
        accessible
        accessibilityLabel={`${who}: ${m.text}`}
        style={{
          maxWidth: "88%",
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderRadius: isSignal ? palette.shape.radiusMedium : 16,
          borderBottomRightRadius: mine && !isSignal ? 6 : undefined,
          borderBottomLeftRadius: !mine && !isSignal ? 6 : undefined,
          backgroundColor: mine ? (isSignal ? palette.accentFill : withAlpha(palette.accent, 0.16)) : palette.surfaceHigh,
          borderWidth: isSignal ? 1.5 : 0,
          borderColor: mine ? palette.shadowColor : palette.line,
        }}
      >
        {!mine ? (
          <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.label, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>
            {pal.name}
          </Text>
        ) : null}
        <Text selectable style={{ color: mine && isSignal ? palette.accentInk : palette.onSurface, fontFamily: palette.fonts.body, fontSize: 15, lineHeight: 21 }}>
          {m.text}
        </Text>
      </View>
      {m.crisis ? (
        <View style={{ marginTop: 8 }}>
          <NpPrimaryButton label="Open the calming steps" icon="spa" onPress={onCalm} />
        </View>
      ) : null}
    </View>
  );
}
