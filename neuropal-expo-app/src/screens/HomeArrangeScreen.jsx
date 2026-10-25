import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";

import { Pal } from "../components/pal/Pal";
import { Chip, GlassPanel, NpGhostButton, NpPrimaryButton, SignalLabel, withAlpha } from "../components/primitives";
import { SignalBackdrop } from "../components/signal/Backdrop";
import { setHome } from "../store/slices/lookSlice";
import { usePalette, useTheme } from "../theme/ThemeProvider";
import { HOME_SIZES, HOME_TILES, effectiveTiles, homeForSkin, interpretHome, moveTile, ordinal, patchTile } from "../theme/tokens";
import { KeyboardSafeScrollView } from "../components/KeyboardSafeScrollView";

// Arrange home (docs/PLATFORM-PLAN.md §5): order, size and visibility of the
// Home tiles, plus day rules ("reading first on weekdays") through Ask Pal.
// The mini phone always shows TODAY's effective layout.

const SIZE_WORD = { S: "small", M: "medium", L: "large" };
const BLOCK_H = { S: 22, M: 34, L: 50 };
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const EXAMPLES = ["Reading first on weekdays", "Hide Pal's note", "Bigger focus"];

export function HomeArrangeScreen() {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  // What Home shows right now in this skin (Classic keeps its original layout
  // until it's arranged); the first change saves it as the user's layout.
  const skin = useSelector((s) => s.look.skin);
  const home = homeForSkin(useSelector((s) => s.look.home), skin);
  const pal = useSelector((s) => s.look.pal);
  const [sel, setSel] = useState(home.tiles[0].id);
  const [history, setHistory] = useState([]);
  const [proposal, setProposal] = useState(null);
  const [ask, setAsk] = useState("");
  const [status, setStatus] = useState("");
  const today = new Date();

  const commit = (next, msg) => {
    setHistory((h) => [...h, home].slice(-20));
    setProposal(null);
    dispatch(setHome(next));
    setStatus(msg || "");
  };
  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setProposal(null);
    dispatch(setHome(prev));
    setStatus("Undone.");
  };
  const submitAsk = (text) => {
    const t = String(text ?? ask).trim();
    if (!t) return;
    const r = interpretHome(t, home);
    if (r.error) {
      setProposal(null);
      setStatus(`Pal: ${r.error}`);
      return;
    }
    setProposal(r);
    setStatus("Pal suggested a change. The phone shows it first.");
  };

  const i = Math.max(0, home.tiles.findIndex((t) => t.id === sel));
  const tile = home.tiles[i];
  const selName = HOME_TILES[tile.id].name;
  const shown = effectiveTiles(proposal ? proposal.next : home, today);
  const ruleFor = (id) => home.rules.find((r) => r.tile === id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.surface }} edges={["top", "left", "right"]}>
      <SignalBackdrop />
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
            Arrange home
          </Text>
        </View>
        <Pressable
          onPress={undo}
          disabled={!history.length}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          accessibilityState={{ disabled: !history.length }}
          style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", opacity: history.length ? 1 : 0.4 }}
        >
          <MaterialIcons name="undo" size={22} color={palette.onSurface} />
        </Pressable>
        <NpPrimaryButton label="Done" onPress={() => navigation.goBack()} />
        <View style={{ width: 8 }} />
      </View>

      <KeyboardSafeScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: proposal ? 260 : 48 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          {/* tile list */}
          <View accessibilityLabel="Home tiles, in order. Select one to edit it." style={{ flex: 1, gap: 6 }}>
            {home.tiles.map((t, k) => {
              const on = t.id === sel;
              const r = ruleFor(t.id);
              const name = HOME_TILES[t.id].name;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setSel(t.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${name}, position ${k + 1}, size ${SIZE_WORD[t.size]}${t.hidden ? ", hidden" : ""}${r ? `, has a ${r.scope.toLowerCase()} rule` : ""}`}
                  style={{
                    minHeight: 48,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 10,
                    borderRadius: isSignal ? palette.shape.radiusControl : 14,
                    borderWidth: on ? 2 : 1,
                    borderColor: on ? palette.accent : isSignal ? palette.line : withAlpha(palette.outlineVariant, 0.4),
                    backgroundColor: on ? withAlpha(palette.accent, 0.12) : withAlpha(palette.surfaceContainer, 0.85),
                    opacity: t.hidden ? 0.6 : 1,
                  }}
                >
                  <Text style={{ width: 18, color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 12 }}>{k + 1}</Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      color: palette.onSurface,
                      fontFamily: palette.fonts.bodySemi,
                      fontSize: 14,
                      textDecorationLine: t.hidden ? "line-through" : "none",
                    }}
                  >
                    {name}
                  </Text>
                  {r ? (
                    <Text style={{ marginRight: 6, color: palette.accent, fontFamily: palette.fonts.label, fontSize: 9.5, letterSpacing: 0.6 }}>
                      {r.scope === "Weekdays" ? "WKDY" : "WKND"}
                    </Text>
                  ) : null}
                  <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 12 }}>{t.size}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* mini phone: today's effective layout */}
          <View style={{ width: 112 }}>
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Home preview for today${proposal ? ", with Pal's proposal" : ""}: ${shown.map((x) => `${HOME_TILES[x.id].name} (${SIZE_WORD[x.size]})`).join(", ")}`}
              style={{
                padding: 8,
                minHeight: 250,
                borderRadius: isSignal ? palette.shape.radiusMedium : 20,
                borderWidth: isSignal ? 2 : 1,
                borderColor: isSignal ? palette.line : withAlpha(palette.outlineVariant, 0.5),
                backgroundColor: withAlpha(palette.surfaceLowest, 0.85),
              }}
            >
              <View importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <Text style={{ flex: 1, color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 9.5 }}>{`TODAY · ${DAYS[today.getDay()]}`}</Text>
                {proposal ? (
                  <Text style={{ color: isSignal ? palette.accentInk : palette.onPrimary, backgroundColor: isSignal ? palette.accentFill : palette.accent, fontFamily: palette.fonts.label, fontSize: 8.5, paddingHorizontal: 3 }}>
                    NEW
                  </Text>
                ) : null}
              </View>
              <View importantForAccessibility="no-hide-descendants" style={{ gap: 5 }}>
                {shown.map((x) => {
                  const on = x.id === sel;
                  return (
                    <View
                      key={x.id}
                      style={{
                        height: BLOCK_H[x.size],
                        borderRadius: isSignal ? Math.min(6, palette.shape.radiusControl) : 8,
                        borderWidth: 1,
                        borderColor: on ? (isSignal ? palette.shadowColor : palette.accent) : isSignal ? palette.line : withAlpha(palette.outlineVariant, 0.4),
                        backgroundColor: on ? (isSignal ? palette.accentFill : withAlpha(palette.accent, 0.3)) : palette.surfaceContainer,
                        justifyContent: "center",
                        paddingHorizontal: 5,
                      }}
                    >
                      <Text numberOfLines={1} style={{ color: on ? (isSignal ? palette.accentInk : palette.onSurface) : palette.onSurfaceVariant, fontFamily: palette.fonts.label, fontSize: 8.5, letterSpacing: 0.4 }}>
                        {HOME_TILES[x.id].short}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <Text style={{ marginTop: 6, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 11.5, lineHeight: 15 }}>
              The phone shows today, with day rules applied.
            </Text>
          </View>
        </View>

        {/* selected tile */}
        <GlassPanel style={{ marginTop: 14, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <SignalLabel accessibilityRole="header">Selected</SignalLabel>
            <Text style={{ flex: 1, marginLeft: 8, color: palette.onSurface, fontFamily: palette.fonts.displaySemi, fontSize: 16 }}>{selName}</Text>
            <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 11 }}>
              {`${ordinal(i + 1).toUpperCase()} OF ${home.tiles.length}${tile.hidden ? " · HIDDEN" : ""}`}
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 10 }}>
            <IconBtn
              icon="arrow-upward"
              label={`Move ${selName} up`}
              disabled={i === 0}
              onPress={() => commit(moveTile(home, tile.id, -1), `${selName} moved to position ${i} of ${home.tiles.length}.`)}
            />
            <IconBtn
              icon="arrow-downward"
              label={`Move ${selName} down`}
              disabled={i === home.tiles.length - 1}
              onPress={() => commit(moveTile(home, tile.id, 1), `${selName} moved to position ${i + 2} of ${home.tiles.length}.`)}
            />
            <View accessibilityRole="radiogroup" accessibilityLabel="Tile size" style={{ flexDirection: "row", gap: 6 }}>
              {HOME_SIZES.map((s) => (
                <Chip
                  key={s}
                  compact
                  label={s}
                  selected={tile.size === s}
                  accessibilityLabel={`Size ${SIZE_WORD[s]}`}
                  onPress={() => tile.size !== s && commit(patchTile(home, tile.id, { size: s }), `${selName} is now ${SIZE_WORD[s]}.`)}
                />
              ))}
            </View>
            <NpGhostButton
              label={tile.hidden ? "Show" : "Hide"}
              icon={tile.hidden ? "visibility" : "visibility-off"}
              onPress={() =>
                commit(
                  patchTile(home, tile.id, { hidden: !tile.hidden }),
                  tile.hidden ? `${selName} is back on Home.` : `${selName} is hidden. It stays in this list.`
                )
              }
            />
          </View>
        </GlassPanel>

        {/* Ask Pal */}
        <GlassPanel style={{ marginTop: 14, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Pal pal={pal} size={34} decorative />
            <Text accessibilityRole="header" style={{ flex: 1, marginLeft: 8, color: palette.onSurface, fontFamily: palette.fonts.displaySemi, fontSize: 18 }}>
              Ask Pal
            </Text>
            <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 10.5 }}>RULES CAN FOLLOW THE DAY</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <TextInput
              value={ask}
              onChangeText={setAsk}
              onSubmitEditing={() => submitAsk()}
              returnKeyType="send"
              placeholder="reading first on weekdays"
              placeholderTextColor={palette.onSurfaceVariant}
              accessibilityLabel="Describe a layout change"
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginHorizontal: -14 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 14 }}>
            {EXAMPLES.map((e) => (
              <Chip
                key={e}
                compact
                label={e}
                onPress={() => {
                  setAsk(e);
                  submitAsk(e);
                }}
              />
            ))}
          </ScrollView>
          {home.rules.length ? (
            <View accessibilityLabel="Day rules" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {home.rules.map((r) => {
                const verb = r.act === "hide" ? "hidden" : r.act;
                const label = `${r.scope}: ${HOME_TILES[r.tile].name} ${verb}`;
                return (
                  <Chip
                    key={`${r.scope}:${r.tile}`}
                    compact
                    icon="close"
                    label={label}
                    accessibilityLabel={`Remove rule: ${label}`}
                    onPress={() => commit({ tiles: home.tiles, rules: home.rules.filter((x) => x !== r) }, "Rule removed.")}
                  />
                );
              })}
            </View>
          ) : null}
          <Text
            accessibilityLiveRegion="polite"
            style={{ marginTop: status ? 10 : 0, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13.5, lineHeight: 19 }}
          >
            {status}
          </Text>
        </GlassPanel>

        <Text style={{ marginTop: 14, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5, lineHeight: 18 }}>
          No streaks, ever. When a streak breaks, people tend to do the thing less afterwards (Silverman & Barasch, 2023). Home shows what is next, not a count of days.
        </Text>
      </KeyboardSafeScrollView>

      {proposal ? (
        <View style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
          <GlassPanel style={{ padding: 14 }} intensity={60}>
            <Text accessibilityRole="header" style={{ color: palette.onSurface, fontFamily: palette.fonts.displaySemi, fontSize: 17 }}>
              {proposal.title}
            </Text>
            <Text style={{ marginTop: 3, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13, lineHeight: 18 }}>{proposal.message}</Text>
            {proposal.rows.map((d) => (
              <View
                key={d.k}
                accessible
                accessibilityLabel={`${d.k}: from ${d.from} to ${d.to}`}
                style={{ flexDirection: "row", alignItems: "center", minHeight: 30, marginTop: 8, borderTopWidth: 1, borderTopColor: withAlpha(palette.outlineVariant, 0.5) }}
              >
                <Text style={{ width: 96, color: palette.onSurfaceVariant, fontFamily: palette.fonts.label, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>{d.k}</Text>
                <Text style={{ flex: 1, color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 12.5 }}>
                  {`${d.from} → `}
                  <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodyBold }}>{d.to}</Text>
                </Text>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <NpPrimaryButton
                label="Apply"
                icon="check"
                onPress={() => {
                  commit(proposal.next, "Applied. Undo is at the top.");
                  setAsk("");
                }}
              />
              <NpGhostButton
                label="Not now"
                onPress={() => {
                  setProposal(null);
                  setStatus("Kept your layout.");
                }}
              />
            </View>
          </GlassPanel>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function IconBtn({ icon, label, onPress, disabled }) {
  const palette = usePalette();
  const isSignal = palette.skin === "signal";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{
        width: 44,
        height: 44,
        borderRadius: isSignal ? palette.shape.radiusControl : 22,
        borderWidth: 1.5,
        borderColor: isSignal ? palette.control : withAlpha(palette.outline, 0.5),
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <MaterialIcons name={icon} size={20} color={palette.onSurface} />
    </Pressable>
  );
}
