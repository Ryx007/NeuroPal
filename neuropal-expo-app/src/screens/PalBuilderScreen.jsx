import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";

import { Pal } from "../components/pal/Pal";
import { Chip, GlassPanel, NpGhostButton, NpPrimaryButton, SignalLabel, withAlpha } from "../components/primitives";
import { SignalBackdrop } from "../components/signal/Backdrop";
import { patchPal } from "../store/slices/lookSlice";
import { usePalette, useTheme } from "../theme/ThemeProvider";
import { PAL_OPTIONS, normalizePal, palLine } from "../theme/tokens";
import { KeyboardSafeScrollView } from "../components/KeyboardSafeScrollView";

// Build your Pal (docs/PLATFORM-PLAN.md §5). Every pick saves at once and
// syncs with the rest of the appearance; Pal looks the same in both skins.
// Why: people bond more with a character they made (Birk & Mandryk, 2019).

const TABS = ["Shape", "Colour", "Face", "Extras", "Voice"];
const MOODS = [
  { mood: "okay", label: "Okay", note: "Chatty" },
  { mood: "off", label: "A bit off", note: "Offers 2 minutes" },
  { mood: "over", label: "Overwhelmed", note: "Goes quiet" },
];

const pickOther = (list, cur) => {
  const opts = list.filter((x) => x !== cur);
  return opts[Math.floor(Math.random() * opts.length)];
};

export function PalBuilderScreen() {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const pal = normalizePal(useSelector((s) => s.look.pal));
  const readerPlaying = useSelector((s) => s.reader.playing);
  const [tab, setTab] = useState("Shape");
  const [say, setSay] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [nameDraft, setNameDraft] = useState(pal.name);
  const talkTimer = useRef(null);

  useEffect(
    () => () => {
      if (talkTimer.current) clearTimeout(talkTimer.current);
    },
    []
  );
  // A synced rename from another device shows up in the field too.
  useEffect(() => {
    setNameDraft(pal.name);
  }, [pal.name]);

  const set = (patch) => {
    setSay("");
    dispatch(patchPal(patch));
  };

  const surprise = () => {
    dispatch(
      patchPal({
        shape: pickOther(Object.keys(PAL_OPTIONS.shape), pal.shape),
        colour: pickOther(Object.keys(PAL_OPTIONS.colour), pal.colour),
        eyes: pickOther(PAL_OPTIONS.eyes, pal.eyes),
        mouth: pickOther(PAL_OPTIONS.mouth.filter((m) => m !== "None"), pal.mouth),
        extra: pickOther(PAL_OPTIONS.extra, pal.extra),
      })
    );
    setSay("New look. Tap the dice again for another, or keep this one.");
  };

  const hear = () => {
    // Never talk over the Reader: it owns the speech engine while playing.
    if (readerPlaying) {
      setSay("Pause the Reader first and I'll say it.");
      return;
    }
    const [rate, pitch] = PAL_OPTIONS.voice[pal.voice];
    const text = palLine(pal, "your notes");
    setSay("");
    setSpeaking(true);
    Speech.speak(text, {
      rate,
      pitch,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
    // Safety net: some engines never call back.
    if (talkTimer.current) clearTimeout(talkTimer.current);
    talkTimer.current = setTimeout(() => setSpeaking(false), 6000);
  };

  // The name saves however the screen is left: Done, Back, the hardware
  // back key or a swipe (beforeRemove), or leaving the field (onBlur — web
  // has no onEndEditing).
  const nameRef = useRef(nameDraft);
  nameRef.current = nameDraft;
  const palNameRef = useRef(pal.name);
  palNameRef.current = pal.name;
  const saveName = useCallback(
    (draft) => {
      const n = String(draft).trim().slice(0, 14) || "Pal";
      if (n !== palNameRef.current) dispatch(patchPal({ name: n }));
      return n;
    },
    [dispatch]
  );
  const commitName = () => setNameDraft(saveName(nameRef.current));
  useEffect(() => navigation.addListener("beforeRemove", () => saveName(nameRef.current)), [navigation, saveName]);

  const line = say || palLine(pal, "your notes");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.surface }} edges={["top", "left", "right"]}>
      <SignalBackdrop />
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6 }}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
        >
          <MaterialIcons name="arrow-back" size={24} color={palette.onSurface} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 4 }}>
          <SignalLabel>Make it yours</SignalLabel>
          <Text accessibilityRole="header" style={{ color: palette.onSurface, fontFamily: palette.fonts.display, fontSize: isSignal ? 24 : 22, letterSpacing: -0.3 }}>
            Build your Pal
          </Text>
        </View>
        <NpGhostButton
          label="Done"
          onPress={() => {
            commitName();
            navigation.goBack();
          }}
        />
        <View style={{ width: 8 }} />
      </View>

      <KeyboardSafeScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {/* stage */}
        <GlassPanel style={{ marginTop: 8, padding: 14, minHeight: 300 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View
              accessibilityLiveRegion="polite"
              style={{
                flex: 1,
                padding: 10,
                borderRadius: isSignal ? palette.shape.radiusMedium : 16,
                backgroundColor: withAlpha(palette.surfaceContainer, 0.92),
                borderWidth: 1,
                borderColor: isSignal ? palette.line : withAlpha(palette.outlineVariant, 0.4),
              }}
            >
              <SignalLabel>{`${pal.name} says`}</SignalLabel>
              <Text style={{ marginTop: 4, color: palette.onSurface, fontFamily: palette.fonts.body, fontSize: 14.5, lineHeight: 20 }}>{line}</Text>
            </View>
            <Pressable
              onPress={surprise}
              accessibilityRole="button"
              accessibilityLabel="Surprise me: random look"
              style={{
                marginLeft: 10,
                width: 48,
                height: 48,
                borderRadius: isSignal ? palette.shape.radiusControl : 24,
                borderWidth: 1.5,
                borderColor: isSignal ? palette.control : withAlpha(palette.outline, 0.5),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="casino" size={22} color={palette.onSurface} />
            </Pressable>
          </View>
          <View style={{ alignItems: "center", marginTop: 8 }}>
            <Pal pal={pal} size={210} speaking={speaking} />
          </View>
          <View
            importantForAccessibility="no-hide-descendants"
            style={{
              alignSelf: "center",
              marginTop: 4,
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: isSignal ? palette.shape.radiusControl : 999,
              backgroundColor: withAlpha(palette.surfaceContainer, 0.92),
              borderWidth: 1,
              borderColor: isSignal ? palette.line : withAlpha(palette.outlineVariant, 0.4),
            }}
          >
            <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.display, fontSize: 15, letterSpacing: 1.2 }}>{pal.name.toUpperCase()}</Text>
          </View>
        </GlassPanel>

        {/* name */}
        <SignalLabel style={{ marginTop: 18 }}>Name</SignalLabel>
        <TextInput
          value={nameDraft}
          onChangeText={(t) => setNameDraft(t.slice(0, 14))}
          onBlur={commitName}
          onSubmitEditing={commitName}
          maxLength={14}
          returnKeyType="done"
          accessibilityLabel="Your Pal's name, up to 14 characters"
          style={{
            marginTop: 6,
            minHeight: 48,
            paddingHorizontal: 14,
            borderRadius: isSignal ? palette.shape.radiusControl : 14,
            borderWidth: isSignal ? 1.5 : 0,
            borderColor: palette.control,
            backgroundColor: isSignal ? withAlpha(palette.surfaceLowest, 0.6) : palette.surfaceHigh,
            color: palette.onSurface,
            fontFamily: palette.fonts.bodySemi,
            fontSize: 16,
          }}
        />

        {/* tabs */}
        <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
          {TABS.map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              style={{
                minHeight: 44,
                paddingHorizontal: 14,
                justifyContent: "center",
                borderRadius: isSignal ? palette.shape.radiusControl : 999,
                borderBottomWidth: 3,
                borderBottomColor: tab === t ? (isSignal ? palette.accentFill : palette.accent) : "transparent",
                backgroundColor: tab === t ? withAlpha(palette.accent, 0.1) : "transparent",
              }}
            >
              <Text style={{ color: tab === t ? palette.onSurface : palette.onSurfaceVariant, fontFamily: tab === t ? palette.fonts.bodyBold : palette.fonts.bodySemi, fontSize: 14 }}>{t}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 14 }}>
          {tab === "Shape" ? (
            <View accessibilityRole="radiogroup" accessibilityLabel="Shape" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {Object.keys(PAL_OPTIONS.shape).map((s) => (
                <OptionTile key={s} label={s} on={pal.shape === s} onPress={() => set({ shape: s })}>
                  <Pal pal={{ ...pal, shape: s, extra: "None" }} size={56} decorative />
                </OptionTile>
              ))}
            </View>
          ) : null}
          {tab === "Colour" ? (
            <View accessibilityRole="radiogroup" accessibilityLabel="Colour" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {Object.keys(PAL_OPTIONS.colour).map((c) => (
                <OptionTile key={c} label={c} on={pal.colour === c} onPress={() => set({ colour: c })}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: PAL_OPTIONS.colour[c], borderWidth: 1.5, borderColor: palette.outlineVariant }} />
                </OptionTile>
              ))}
            </View>
          ) : null}
          {tab === "Face" ? (
            <>
              <ChipGroup label="Eyes" options={PAL_OPTIONS.eyes} value={pal.eyes} onPick={(v) => set({ eyes: v })} />
              <ChipGroup label="Mouth" options={PAL_OPTIONS.mouth} value={pal.mouth} onPick={(v) => set({ mouth: v })} />
            </>
          ) : null}
          {tab === "Extras" ? <ChipGroup label="Extras" options={PAL_OPTIONS.extra} value={pal.extra} onPick={(v) => set({ extra: v })} /> : null}
          {tab === "Voice" ? (
            <>
              <ChipGroup label="Talk style" options={Object.keys(PAL_OPTIONS.talk)} value={pal.talk} onPick={(v) => set({ talk: v })} />
              <SignalLabel style={{ marginTop: 14 }}>Voice</SignalLabel>
              <View accessibilityRole="radiogroup" accessibilityLabel="Voice" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" }}>
                {Object.keys(PAL_OPTIONS.voice).map((v) => (
                  <Chip key={v} label={v} selected={pal.voice === v} onPress={() => set({ voice: v })} />
                ))}
                <View style={{ marginLeft: 4 }}>
                  <NpPrimaryButton label="Hear it" icon="volume-up" onPress={hear} />
                </View>
              </View>
              <GlassPanel style={{ marginTop: 16, padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 15 }}>Points you to people</Text>
                    <Text style={{ marginTop: 3, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13, lineHeight: 18 }}>
                      {pal.people
                        ? "When you seem stuck, Pal suggests a person or a quiet co-working room before more chat."
                        : "Off. Pal only mentions people when you ask."}
                    </Text>
                  </View>
                  <Switch
                    value={pal.people}
                    onValueChange={(v) => set({ people: v })}
                    accessibilityLabel="Points you to people"
                    trackColor={{ true: isSignal ? palette.accentFill : palette.accent, false: palette.surfaceHighest }}
                    thumbColor={pal.people ? (isSignal ? palette.accentInk : palette.onPrimary) : palette.onSurfaceVariant}
                    style={{ marginLeft: 12 }}
                  />
                </View>
              </GlassPanel>
              <Why>In a 4-week trial, heavier daily chatbot use went with more loneliness and dependence (Fang et al., 2025). Pal keeps its chats short.</Why>
            </>
          ) : (
            <>
              <GlassPanel style={{ marginTop: 16, padding: 14 }}>
                <SignalLabel accessibilityRole="header">Your Pal in each state</SignalLabel>
                <View style={{ flexDirection: "row", marginTop: 10 }}>
                  {MOODS.map((m) => (
                    <View key={m.mood} accessible accessibilityLabel={`${m.label}: ${m.note}`} style={{ flex: 1, alignItems: "center" }}>
                      <Pal pal={pal} size={70} mood={m.mood} decorative />
                      <Text style={{ marginTop: 4, color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 13 }}>{m.label}</Text>
                      <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 11.5, textAlign: "center" }}>{m.note}</Text>
                    </View>
                  ))}
                </View>
              </GlassPanel>
              <Why>Why build one: people bond more with a character they made (Birk & Mandryk, 2019).</Why>
            </>
          )}
        </View>
      </KeyboardSafeScrollView>
    </SafeAreaView>
  );
}

function Why({ children }) {
  const palette = usePalette();
  return <Text style={{ marginTop: 12, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5, lineHeight: 18 }}>{children}</Text>;
}

function ChipGroup({ label, options, value, onPick }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ marginTop: 4, marginBottom: 10 }}>
      <SignalLabel>{label}</SignalLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {options.map((o) => (
          <Chip key={o} label={o} selected={value === o} accessibilityLabel={`${label}: ${o}`} onPress={() => onPick(o)} />
        ))}
      </View>
    </View>
  );
}

function OptionTile({ label, on, onPress, children }) {
  const palette = usePalette();
  const isSignal = palette.skin === "signal";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{
        width: "30.5%",
        minWidth: 92,
        minHeight: 96,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: isSignal ? palette.shape.radiusMedium : 18,
        borderWidth: on ? 2.5 : 1.5,
        borderColor: on ? palette.accent : isSignal ? palette.control : withAlpha(palette.outline, 0.4),
        backgroundColor: on ? withAlpha(palette.accent, 0.1) : "transparent",
      }}
    >
      {children}
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
        {on ? <MaterialIcons name="check" size={13} color={palette.accent} style={{ marginRight: 3 }} /> : null}
        <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 13 }}>{label}</Text>
      </View>
    </Pressable>
  );
}
