import { MaterialIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";

import { useDispatch, useSelector } from "react-redux";

import { Pal } from "../components/pal/Pal";
import { Chip, GlassPanel, NpGhostButton, NpPrimaryButton, SignalLabel, withAlpha } from "../components/primitives";
import { SignalBackdropView } from "../components/signal/Backdrop";
import { applyAppearance, selectAppearance } from "../store/appearance";
import { setSuggestLooks } from "../store/slices/lookSlice";
import { ThemeOverride, usePalette, useTheme } from "../theme/ThemeProvider";
import {
  CLASSIC_ACCENT_NAMES,
  CLASSIC_THEME_NAMES,
  LOOKS,
  SIGNAL_ACCENTS,
  SIGNAL_OPTIONS,
  SIGNAL_PRESETS,
  accentName,
  applyLook,
  diffAppearance,
  hslToHex,
  hueOf,
  interpretAppearance,
  matchLook,
  matchPreset,
  resolveClassicPalette,
  resolveSignalPalette,
} from "../theme/tokens";
import { KeyboardSafeScrollView } from "../components/KeyboardSafeScrollView";

// "Make it yours" — the appearance studio (docs/PLATFORM-PLAN.md §5).
// Direct edits apply at once; anything Pal proposes (Ask Pal, saved looks)
// shows in the preview first and only applies on "Apply". Every change can
// be undone (last 20, this visit).

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const clone = (o) => JSON.parse(JSON.stringify(o));
// Undo here covers only what this screen edits. Pal and Home have their own
// screens (and undo), and a look adopted from another device meanwhile must
// not be rolled back by an old snapshot.
const studioPart = (a) => clone({ skin: a.skin, classic: a.classic, signal: a.signal });

const SKINS = [
  { id: "classic", name: "Classic", desc: "Calm glass · the original presets" },
  { id: "signal", name: "Signal", desc: "Brutal glass · make it yours" },
];

const FINE_ROWS = [
  { label: "Base", key: "base" },
  { label: "Motion", key: "motion" },
  { label: "Background", key: "field" },
  { label: "Brutality", key: "brutality" },
  { label: "Corners", key: "corners" },
  { label: "Texture", key: "texture" },
  { label: "Type", key: "type" },
];

export function StudioScreen() {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const focused = useIsFocused();
  const current = useSelector(selectAppearance);
  const name = useSelector((s) => s.auth.userName) || "Ryx";

  const [history, setHistory] = useState([]);
  const [proposal, setProposal] = useState(null); // {title, message, next, rows}
  const [draft, setDraft] = useState(null); // live hue drag, preview only
  const [ask, setAsk] = useState("");
  const [status, setStatus] = useState("");
  const [fineOpen, setFineOpen] = useState(false);
  const scrollRef = useRef(null);
  const previewY = useRef(0);
  const hueTimer = useRef(null);
  // Delayed commits (the hue slider) must build on the latest look, not on
  // the render they were scheduled from.
  const currentRef = useRef(current);
  currentRef.current = current;

  // A committed accent (slider, swatch, undo, sync) ends any hue preview.
  useEffect(() => {
    setDraft(null);
  }, [current.signal.acc]);
  useEffect(() => () => hueTimer.current && clearTimeout(hueTimer.current), []);

  const commit = (next) => {
    const before = studioPart(currentRef.current);
    setHistory((h) => [...h, before].slice(-20));
    dispatch(applyAppearance(next));
  };
  const edit = (fn) => {
    const next = clone(currentRef.current);
    fn(next);
    setProposal(null);
    commit(next);
  };
  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setProposal(null);
    dispatch(applyAppearance({ ...current, ...prev }));
    setStatus("Undone.");
  };
  const propose = (next, title, message) => {
    const rows = diffAppearance(current, next);
    if (!rows.length) {
      setProposal(null);
      setStatus("That's already your look.");
      return;
    }
    setProposal({ next, title, message, rows });
    // Bring the preview into view: the proposal is judged by looking at it.
    scrollRef.current?.scrollTo({ y: Math.max(0, previewY.current - 12), animated: true });
    setStatus(`Pal suggested ${rows.length} ${rows.length === 1 ? "change" : "changes"}. Check the preview.`);
  };
  const submitAsk = (text) => {
    const t = String(text ?? ask).trim();
    if (!t) return;
    const r = interpretAppearance(t, current);
    if (r.error) {
      setProposal(null);
      setStatus(`Pal: ${r.error}`);
      return;
    }
    propose(r.next, "Pal suggests", `Here's how I read "${t}". Nothing changes until you apply it.`);
  };
  const applyProposal = () => {
    if (!proposal) return;
    commit(proposal.next);
    setProposal(null);
    setAsk("");
    setStatus("Applied. Undo is at the top if you change your mind.");
  };

  const preview = draft || (proposal ? proposal.next : current);
  const sig = current.signal;
  const signalPalette = useMemo(() => resolveSignalPalette(sig), [sig]);
  const preset = matchPreset(sig);
  const look = matchLook(current);
  const autoTint = signalPalette.accent.toUpperCase() !== signalPalette.primary.toUpperCase();
  const examples = isSignal ? ["Calm it down", "More contrast", "Try orange"] : ["Warmer", "More contrast", "Make it funky"];
  return (
    <View style={{ flex: 1 }}>
      <KeyboardSafeScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: proposal ? 300 : 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* title row */}
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <SignalLabel>Appearance</SignalLabel>
            <Text
              accessibilityRole="header"
              style={{ color: palette.onSurface, fontFamily: palette.fonts.display, fontSize: isSignal ? 34 : 32, letterSpacing: isSignal ? -0.4 : -0.8, marginTop: 2 }}
            >
              Make it yours
            </Text>
          </View>
          <NpGhostButton
            label="Undo"
            icon="undo"
            onPress={undo}
            disabled={!history.length}
            accessibilityLabel={history.length ? `Undo, ${history.length} ${history.length === 1 ? "step" : "steps"} available` : "Undo, nothing to undo"}
          />
        </View>

        {/* skin */}
        <View accessibilityRole="radiogroup" accessibilityLabel="Skin" style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          {SKINS.map((s) => {
            const on = current.skin === s.id;
            const solid = on && isSignal;
            const sh = solid ? palette.shape.shadow : 0;
            const fg = solid ? palette.accentInk : palette.onSurface;
            return (
              <Pressable
                key={s.id}
                onPress={() => !on && edit((n) => (n.skin = s.id))}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${s.name} skin. ${s.desc}`}
                style={{ flex: 1 }}
              >
                {sh ? (
                  <View
                    pointerEvents="none"
                    style={{ position: "absolute", top: sh, left: sh, right: -sh, bottom: -sh, borderRadius: palette.shape.radiusMedium, backgroundColor: palette.shadowColor }}
                  />
                ) : null}
                <View
                  style={{
                    flexGrow: 1,
                    minHeight: 64,
                    padding: 12,
                    borderRadius: isSignal ? palette.shape.radiusMedium : 18,
                    borderWidth: on ? 2 : 1.5,
                    borderColor: solid ? palette.shadowColor : on ? palette.accent : isSignal ? palette.control : withAlpha(palette.outline, 0.4),
                    backgroundColor: solid ? palette.accentFill : on ? withAlpha(palette.accent, 0.12) : "transparent",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ flex: 1, color: fg, fontFamily: isSignal ? palette.fonts.display : palette.fonts.displaySemi, fontSize: isSignal ? 19 : 17 }}>{s.name}</Text>
                    {on ? <MaterialIcons name="check-circle" size={18} color={solid ? palette.accentInk : palette.accent} /> : null}
                  </View>
                  <Text style={{ marginTop: 4, color: solid ? palette.accentInk : palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5, lineHeight: 17 }}>
                    {s.desc}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* live preview — renders the PROPOSED look when there is one */}
        <View onLayout={(e) => (previewY.current = e.nativeEvent.layout.y)}>
          <ThemeOverride appearance={preview}>
            <PreviewCard name={name} proposed={Boolean(proposal || draft)} focused={focused} />
          </ThemeOverride>
        </View>

        {isSignal ? (
          <>
            <GlassPanel style={{ marginTop: 16, padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <SignalLabel accessibilityRole="header" style={{ flex: 1 }}>Start from a vibe</SignalLabel>
                <Mono>{preset ? `ON: ${preset.toUpperCase()}` : "CUSTOM"}</Mono>
              </View>
              <View accessibilityRole="radiogroup" accessibilityLabel="Vibe presets" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {Object.keys(SIGNAL_PRESETS).map((p) => (
                  <PresetTile key={p} name={p} settings={SIGNAL_PRESETS[p]} on={preset === p} onPress={() => edit((n) => (n.signal = { ...SIGNAL_PRESETS[p] }))} />
                ))}
              </View>
              <Why>Presets first, details later (Chernev et al., 2015).</Why>
            </GlassPanel>

            <Pressable
              onPress={() => setFineOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: fineOpen }}
              style={{
                marginTop: 14,
                minHeight: 48,
                paddingHorizontal: 14,
                borderRadius: palette.shape.radiusControl,
                borderWidth: 1.5,
                borderColor: palette.control,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text style={{ flex: 1, color: palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 14 }}>Fine-tune · 8 settings</Text>
              <MaterialIcons name={fineOpen ? "expand-less" : "expand-more"} size={22} color={palette.onSurface} />
            </Pressable>

            {fineOpen ? (
              <GlassPanel style={{ marginTop: 14, padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <SignalLabel accessibilityRole="header" style={{ flex: 1 }}>Accent</SignalLabel>
                  <Mono>{`${accentName(sig.acc).toUpperCase()} · ${badgeFor(signalPalette.ratio)}`}</Mono>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {SIGNAL_ACCENTS.map((a) => (
                    <Swatch key={a.hex} color={a.hex} on={sig.acc.toUpperCase() === a.hex} label={`Accent: ${a.name}`} onPress={() => edit((n) => (n.signal.acc = a.hex))} />
                  ))}
                </View>
                <Text style={{ marginTop: 12, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5 }}>
                  {`Any hue · ${(draft ? draft.signal.acc : sig.acc).toUpperCase()}`}
                </Text>
                <Slider
                  accessibilityLabel="Accent hue"
                  style={{ height: 44, marginHorizontal: -6 }}
                  minimumValue={0}
                  maximumValue={359}
                  step={1}
                  value={hueOf(sig.acc)}
                  minimumTrackTintColor={signalPalette.accentFill}
                  maximumTrackTintColor={palette.outlineVariant}
                  thumbTintColor={signalPalette.accentFill}
                  onValueChange={(h) => {
                    const hex = hslToHex(h, 1, 0.56);
                    const d = clone(current);
                    d.signal.acc = hex;
                    setDraft(d);
                    // Screen readers adjust a slider without ever "releasing"
                    // it, so the accent also commits after a short pause.
                    if (hueTimer.current) clearTimeout(hueTimer.current);
                    hueTimer.current = setTimeout(() => edit((n) => (n.signal.acc = hex)), 700);
                  }}
                  onSlidingComplete={(h) => {
                    if (hueTimer.current) clearTimeout(hueTimer.current);
                    edit((n) => (n.signal.acc = hslToHex(h, 1, 0.56)));
                  }}
                />
                <Why>
                  {autoTint
                    ? "Auto-contrast: text in this colour is tinted lighter or darker so it stays at 4.6:1 or more."
                    : "Auto-contrast: this colour already reads at 4.6:1 or more as text."}
                </Why>
                {FINE_ROWS.map((row) => (
                  <View key={row.key} accessibilityRole="radiogroup" accessibilityLabel={row.label} style={{ marginTop: 14 }}>
                    <SignalLabel>{row.label}</SignalLabel>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {SIGNAL_OPTIONS[row.key].map((o) => (
                        <Chip
                          key={String(o)}
                          compact
                          label={String(o)}
                          selected={String(sig[row.key]) === String(o)}
                          accessibilityLabel={`${row.label}: ${o}`}
                          onPress={() => edit((n) => (n.signal[row.key] = o))}
                        />
                      ))}
                    </View>
                  </View>
                ))}
                <Why>Motion stays in the frame. Reading text, equations and lessons never animate.</Why>
              </GlassPanel>
            ) : null}
          </>
        ) : (
          <ClassicPicker current={current} edit={edit} />
        )}

        {/* Ask Pal */}
        <GlassPanel style={{ marginTop: 16, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Pal pal={current.pal} size={34} decorative />
            <Text accessibilityRole="header" style={{ flex: 1, marginLeft: 8, color: palette.onSurface, fontFamily: palette.fonts.display, fontSize: 19 }}>
              Ask Pal
            </Text>
            <Mono>PREVIEW · APPLY · UNDO</Mono>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <TextInput
              value={ask}
              onChangeText={setAsk}
              onSubmitEditing={() => submitAsk()}
              returnKeyType="send"
              placeholder="less busy, warmer, round corners"
              placeholderTextColor={palette.onSurfaceVariant}
              accessibilityLabel="Describe a change in your own words"
              style={{
                flex: 1,
                minHeight: 48,
                paddingHorizontal: 14,
                borderRadius: isSignal ? palette.shape.radiusControl : 14,
                borderWidth: isSignal ? 1.5 : 0,
                borderColor: palette.control,
                backgroundColor: isSignal ? withAlpha(palette.surfaceLowest, 0.6) : palette.surfaceHigh,
                color: palette.onSurface,
                fontFamily: palette.fonts.body,
                fontSize: 15,
              }}
            />
            <Pressable
              onPress={() => submitAsk()}
              accessibilityRole="button"
              accessibilityLabel="Ask Pal"
              style={{
                width: 48,
                minHeight: 48,
                borderRadius: isSignal ? palette.shape.radiusControl : 14,
                backgroundColor: isSignal ? palette.accentFill : withAlpha(palette.accent, 0.18),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="arrow-upward" size={20} color={isSignal ? palette.accentInk : palette.accent} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {examples.map((e) => (
              <Chip
                key={e}
                label={e}
                onPress={() => {
                  setAsk(e);
                  submitAsk(e);
                }}
              />
            ))}
          </View>
          <Text
            accessibilityLiveRegion="polite"
            style={{ marginTop: status ? 10 : 0, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13.5, lineHeight: 19 }}
          >
            {status}
          </Text>
        </GlassPanel>

        {/* Saved looks */}
        <GlassPanel style={{ marginTop: 16, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <SignalLabel accessibilityRole="header" style={{ flex: 1 }}>Saved looks</SignalLabel>
            <Mono>{look ? `ON: ${look.toUpperCase()}` : "CUSTOM"}</Mono>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {Object.keys(LOOKS[current.skin]).map((l) => (
              <Chip
                key={l}
                label={l}
                selected={look === l}
                onPress={() => propose(applyLook(current, l), `Switch to ${l}?`, `${l}: ${LOOKS[current.skin][l].desc} Check the preview, then apply.`)}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
            <Text nativeID="suggest-label" style={{ flex: 1, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13, lineHeight: 18 }}>
              Pal may suggest a look when your state changes. It always asks first.
            </Text>
            <Switch
              value={current.suggestLooks}
              onValueChange={(v) => dispatch(setSuggestLooks(v))}
              accessibilityLabel="Pal may suggest a look when your state changes"
              trackColor={{ true: isSignal ? palette.accentFill : palette.accent, false: palette.surfaceHighest }}
              thumbColor={current.suggestLooks ? (isSignal ? palette.accentInk : palette.onPrimary) : palette.onSurfaceVariant}
              style={{ marginLeft: 12 }}
            />
          </View>
        </GlassPanel>

        {/* the rest of "make it yours" */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <LinkCard icon="face" title="Build your Pal" sub={current.pal.name} onPress={() => navigation.getParent()?.navigate("PalBuilder")} />
          <LinkCard icon="dashboard-customize" title="Arrange home" sub="Order, size, day rules" onPress={() => navigation.getParent()?.navigate("HomeArrange")} />
        </View>
      </KeyboardSafeScrollView>

      {proposal ? (
        <ProposalSheet
          proposal={proposal}
          onApply={applyProposal}
          onDismiss={() => {
            setProposal(null);
            setStatus("Kept your current look.");
          }}
          pal={current.pal}
        />
      ) : null}
    </View>
  );
}

function badgeFor(ratio) {
  const r = Number(ratio) || 0;
  return `${r >= 7 ? "AAA" : "AA"} ${r.toFixed(1)}:1`;
}

function Mono({ children }) {
  const palette = usePalette();
  return (
    <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 11, letterSpacing: 0.6 }}>{children}</Text>
  );
}

function Why({ children }) {
  const palette = usePalette();
  return <Text style={{ marginTop: 10, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5, lineHeight: 18 }}>{children}</Text>;
}

function previewSummary(palette) {
  if (palette.skin === "signal") {
    const s = palette.settings || {};
    return `Preview: Signal skin, ${s.base} base, ${accentName(s.acc)} accent, ${String(s.motion).toLowerCase()} motion, ${String(s.field).toLowerCase()} background.`;
  }
  return `Preview: Classic skin, ${palette.theme} theme${palette.theme === "contrast" ? ", fixed high-contrast colours" : `, ${palette.accentName} accent`}.`;
}

function PreviewCard({ name, proposed, focused }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const r = isSignal ? palette.shape.radius : 24;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${previewSummary(palette)}${proposed ? " Not applied yet." : ""} Contrast ${badgeFor(palette.ratio)}.`}
      style={{
        marginTop: 16,
        minHeight: 214,
        borderRadius: r,
        overflow: "hidden",
        backgroundColor: palette.surface,
        borderWidth: isSignal ? Math.max(1, palette.shape.border) : 1,
        borderColor: isSignal ? palette.line : withAlpha(palette.outlineVariant, 0.3),
      }}
    >
      <SignalBackdropView field focused={focused} />
      <View style={{ padding: 14 }} importantForAccessibility="no-hide-descendants">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Tag>PREVIEW</Tag>
          {proposed ? <Tag strong>PROPOSED</Tag> : null}
          <View style={{ flex: 1 }} />
          <Tag>{badgeFor(palette.ratio)}</Tag>
        </View>
        <Text
          style={{
            marginTop: 16,
            color: palette.onSurface,
            fontFamily: palette.fonts.display,
            fontSize: isSignal ? 30 : 28,
            letterSpacing: isSignal ? -0.4 : -0.6,
          }}
        >
          {`Hello, ${name}.`}
        </Text>
        <GlassPanel style={{ marginTop: 14, padding: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, color: palette.onSurface, fontFamily: palette.fonts.body, fontSize: 14.5, lineHeight: 21 }}>
              The correlation term{" "}
              <Text style={{ color: isSignal ? palette.accentInk : palette.onPrimary, backgroundColor: isSignal ? palette.accentFill : palette.accent, fontFamily: palette.fonts.bodyBold }}>
                {" survives "}
              </Text>{" "}
              even when each arm is incoherent.
            </Text>
            <View
              style={{
                marginLeft: 10,
                width: 40,
                height: 40,
                borderRadius: isSignal ? palette.shape.radiusControl : 20,
                backgroundColor: isSignal ? palette.accentFill : palette.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="play-arrow" size={22} color={isSignal ? palette.accentInk : palette.onPrimary} />
            </View>
          </View>
        </GlassPanel>
      </View>
    </View>
  );
}

function Tag({ children, strong }) {
  const palette = usePalette();
  const isSignal = palette.skin === "signal";
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: isSignal ? Math.min(6, palette.shape.radiusControl) : 8,
        backgroundColor: strong ? (isSignal ? palette.accentFill : palette.accent) : withAlpha(palette.surfaceContainer, 0.9),
        borderWidth: strong ? 0 : 1,
        borderColor: isSignal ? palette.line : withAlpha(palette.outlineVariant, 0.4),
      }}
    >
      <Text
        style={{
          color: strong ? (isSignal ? palette.accentInk : palette.onPrimary) : palette.onSurface,
          fontFamily: palette.fonts.mono,
          fontSize: 10.5,
          letterSpacing: 0.8,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

function PresetTile({ name, settings, on, onPress }) {
  const palette = usePalette();
  const p = useMemo(() => resolveSignalPalette(settings), [settings]);
  const sh = Math.max(2, Math.min(4, p.shape.shadow));
  const r = Math.round(p.shape.radius * 0.4);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${name} preset: ${settings.base} base, ${accentName(settings.acc)} accent, ${settings.motion.toLowerCase()} motion`}
      style={{
        flexGrow: 1,
        flexBasis: 56,
        maxWidth: 76,
        padding: 4,
        borderRadius: Math.round(palette.shape.radius * 0.5),
        borderWidth: 2,
        borderColor: on ? palette.accent : "transparent",
        alignItems: "center",
      }}
    >
      <View style={{ alignSelf: "stretch", height: 50, borderRadius: r, backgroundColor: p.surface, borderWidth: 1.5, borderColor: p.line, padding: 7, justifyContent: "space-between" }}>
        <View style={{ width: "62%", height: 16 }}>
          <View style={{ position: "absolute", top: sh, left: sh, right: -sh, bottom: -sh, borderRadius: Math.round(r * 0.6), backgroundColor: p.shadowColor }} />
          <View style={{ flex: 1, borderRadius: Math.round(r * 0.6), backgroundColor: p.surfaceContainer, borderWidth: 1, borderColor: p.line }} />
        </View>
        <View style={{ height: 5, borderRadius: 1, backgroundColor: p.accentFill }} />
      </View>
      <Text numberOfLines={2} style={{ marginTop: 5, textAlign: "center", color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 11.5, lineHeight: 14 }}>
        {name}
      </Text>
    </Pressable>
  );
}

function Swatch({ color, on, label, onPress, disabled }) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: on ? 3 : 1.5,
        borderColor: on ? palette.onSurface : palette.outlineVariant,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
        {on ? <MaterialIcons name="check" size={16} color={inkOn(color)} /> : null}
      </View>
    </Pressable>
  );
}

// Black or white check mark, whichever reads on the swatch.
function inkOn(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? "#141416" : "#FFFFFF";
}

function ClassicPicker({ current, edit }) {
  const palette = usePalette();
  const hc = current.classic.theme === "contrast";
  return (
    <GlassPanel style={{ marginTop: 16, padding: 14 }}>
      <SignalLabel accessibilityRole="header">Theme</SignalLabel>
      <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {CLASSIC_THEME_NAMES.map((t) => {
          const q = resolveClassicPalette({ theme: t, accent: current.classic.accent });
          const on = current.classic.theme === t;
          return (
            <Pressable
              key={t}
              onPress={() => edit((n) => (n.classic.theme = t))}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${cap(t)} theme`}
              style={{ width: "22.5%", minWidth: 70 }}
            >
              <View
                style={{
                  height: 58,
                  borderRadius: 14,
                  backgroundColor: q.surface,
                  borderWidth: on ? 2.5 : 1,
                  borderColor: on ? palette.accent : q.outlineVariant,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                }}
              >
                <Text style={{ color: q.onSurface, fontFamily: palette.fonts.displaySemi, fontSize: 18 }}>Aa</Text>
                <View style={{ width: 8, height: 8, borderRadius: 4, marginLeft: 6, backgroundColor: q.accent }} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 5 }}>
                {on ? <MaterialIcons name="check" size={13} color={palette.accent} style={{ marginRight: 3 }} /> : null}
                <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 12.5 }}>{cap(t)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <SignalLabel accessibilityRole="header" style={{ marginTop: 16 }}>Accent</SignalLabel>
      <View accessibilityRole="radiogroup" accessibilityLabel="Accent" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {CLASSIC_ACCENT_NAMES.map((a) => {
          const q = resolveClassicPalette({ theme: current.classic.theme, accent: a });
          const on = !hc && current.classic.accent === a;
          return (
            <Pressable
              key={a}
              disabled={hc}
              onPress={() => edit((n) => (n.classic.accent = a))}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: hc }}
              accessibilityLabel={hc ? `${cap(a)} accent, not available in Contrast` : `${cap(a)} accent, ${q.accent}`}
              style={{
                flexGrow: 1,
                flexBasis: "45%",
                flexDirection: "row",
                alignItems: "center",
                minHeight: 44,
                paddingHorizontal: 10,
                borderRadius: 999,
                borderWidth: on ? 2 : 1,
                borderColor: on ? palette.accent : withAlpha(palette.outline, 0.4),
                opacity: hc ? 0.42 : 1,
              }}
            >
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: q.accent, borderWidth: 1, borderColor: withAlpha(palette.onSurface, 0.2) }} />
              <Text style={{ marginLeft: 7, color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 13 }}>{cap(a)}</Text>
              {on ? <MaterialIcons name="check" size={14} color={palette.accent} style={{ marginLeft: 4 }} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Why>{hc ? "Contrast uses fixed black, white and yellow, so accents are off." : "Classic keeps the original 4 themes × 4 accents, unchanged."}</Why>
    </GlassPanel>
  );
}

function LinkCard({ icon, title, sub, onPress }) {
  const palette = usePalette();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} style={{ flex: 1 }}>
      <GlassPanel style={{ padding: 14, minHeight: 92 }}>
        <MaterialIcons name={icon} size={22} color={palette.accent} />
        <Text style={{ marginTop: 8, color: palette.onSurface, fontFamily: palette.fonts.displaySemi, fontSize: 15 }}>{title}</Text>
        <Text numberOfLines={1} style={{ marginTop: 2, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5 }}>
          {sub}
        </Text>
      </GlassPanel>
    </Pressable>
  );
}

function ProposalSheet({ proposal, onApply, onDismiss, pal }) {
  const palette = usePalette();
  return (
    <View style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
      <GlassPanel style={{ padding: 14 }} intensity={60}>
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <Pal pal={pal} size={40} decorative />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text accessibilityRole="header" style={{ color: palette.onSurface, fontFamily: palette.fonts.displaySemi, fontSize: 17 }}>
              {proposal.title}
            </Text>
            <Text style={{ marginTop: 3, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13, lineHeight: 18 }}>{proposal.message}</Text>
          </View>
        </View>
        <View style={{ marginTop: 10 }}>
          {proposal.rows.map((d) => (
            <View
              key={d.k}
              accessible
              accessibilityLabel={`${d.k}: from ${d.from} to ${d.to}`}
              style={{ flexDirection: "row", alignItems: "center", minHeight: 30, borderTopWidth: 1, borderTopColor: withAlpha(palette.outlineVariant, 0.5) }}
            >
              <Text style={{ width: 96, color: palette.onSurfaceVariant, fontFamily: palette.fonts.label, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>{d.k}</Text>
              <Text style={{ flex: 1, color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 12.5 }}>
                {`${d.from} → `}
                <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodyBold }}>{d.to}</Text>
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12, alignItems: "center" }}>
          <NpPrimaryButton label="Apply" icon="check" onPress={onApply} />
          <NpGhostButton label="Not now" onPress={onDismiss} />
        </View>
        <Text style={{ marginTop: 10, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12, lineHeight: 17 }}>
          The preview above shows this first, and Undo can reverse it (Sreedhar et al., 2026).
        </Text>
      </GlassPanel>
    </View>
  );
}
