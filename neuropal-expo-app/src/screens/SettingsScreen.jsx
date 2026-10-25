import { MaterialIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useNavigation } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import { useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

import { selectUiState } from "../store/selectors";
import {
  setAccent,
  setDensity,
  setFontSize,
  setLineSpacing,
  setReaderFont,
  setReaderLayout,
  setReduceMotion,
  setSpeakEquations,
  setTheme,
  setVoice,
  setWpm,
} from "../store/slices/uiSlice";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { VoicePicker } from "../components/VoicePicker";
import Toast from "../components/toast";
import { clearSession, saveSessionToken } from "../store/ApiLink";
import { useApiRequest } from "../store/ApiRequest";
import { announce } from "../services/announce";
import { apiClient, clearDocTickets, describeNetworkError } from "../services/network";
import { resetAuth } from "../store/slices/authSlice";
import { setBubbleHidden } from "../store/slices/palSlice";
import { usePalette, useTheme } from "../theme/ThemeProvider";
import { fitContrast, hexToRgb, mix, rgbToHex } from "../theme/tokens";
import { NpGhostButton, withAlpha } from "../components/primitives";
import { KeyboardSafeScrollView } from "../components/KeyboardSafeScrollView";
import { usePalBubbleClearance } from "../components/pal/openPalSheet";

// D2 — the old Tweaks sheet as a full Settings screen, reached from the
// drawer. Grouped Appearance / Reading / Audio, with a live typography
// preview. Every control keeps its original uiSlice dispatch — these are
// accessibility-critical (dyslexia font, contrast theme, size/spacing/WPM).

const PREVIEW_TEXT =
  "In squeezed states of light, the noise of the electric field at certain phases falls below that of the vacuum state.";

export function SettingsScreen() {
  const palClear = usePalBubbleClearance();
  const palette = usePalette();
  const dispatch = useDispatch();
  const tweaks = useSelector(selectUiState);
  const { readerFontFamily, isSignal } = useTheme();
  const navigation = useNavigation();
  const bubbleHidden = useSelector((s) => s.pal.bubbleHidden);
  const palName = useSelector((s) => s.look.pal?.name) || "Pal";

  return (
    <KeyboardSafeScrollView
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: Math.max(48, palClear),
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          color: palette.onSurface,
          fontFamily: palette.fonts.display,
          fontSize: 34,
          letterSpacing: -0.8,
        }}
      >
        Settings
      </Text>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: palette.fonts.body,
          fontSize: 16,
          marginTop: 4,
        }}
      >
        Shape the app around your brain, not the other way round.
      </Text>

      <Group title="Appearance">
        <Pressable
          onPress={() => navigation.navigate("Studio")}
          accessibilityRole="button"
          accessibilityLabel="Make it yours: skin, colours, motion, your Pal and Home layout"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            minHeight: 56,
            paddingHorizontal: 14,
            marginBottom: 16,
            borderRadius: 14,
            backgroundColor: pressed ? withAlpha(palette.accent, 0.2) : withAlpha(palette.accent, 0.12),
            borderWidth: 1,
            borderColor: withAlpha(palette.accent, 0.4),
          })}
        >
          <MaterialIcons name="palette" size={22} color={palette.accent} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 15 }}>Make it yours</Text>
            <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5, marginTop: 2 }}>
              Skin, colours, motion, your Pal, Home layout
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={palette.onSurfaceVariant} />
        </Pressable>
        {isSignal ? (
          <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13.5, lineHeight: 19, marginBottom: 16 }}>
            Signal is on. Its accent, base, motion and background live in Make it yours. Classic's themes come back when you switch skins.
          </Text>
        ) : null}
        {!isSignal ? (
          <>
        <SegmentRow
          label="Theme"
          value={tweaks.theme}
          entries={[
            ["dark", "Dark"],
            ["sepia", "Sepia"],
            ["light", "Light"],
            ["contrast", "Contrast"],
          ]}
          onChange={(value) => dispatch(setTheme(value))}
        />
        <SegmentRow
          label="Accent hue"
          value={tweaks.accent}
          entries={[
            ["ruby", "Ruby"],
            ["cyan", "Cyan"],
            ["purple", "Purple"],
            ["green", "Green"],
          ]}
          onChange={(value) => dispatch(setAccent(value))}
        />
          </>
        ) : null}
        <SegmentRow
          label="Density"
          value={tweaks.density}
          entries={[
            ["calm", "Calm"],
            ["dense", "Dense"],
          ]}
          onChange={(value) => dispatch(setDensity(value))}
        />
        {/* Stops Pal's breathing and blinking, the slider glide, sliding
            sheets and moving backgrounds in both skins, like the phone's
            own reduce-motion setting (which still wins when it is on). */}
        <SegmentRow
          label="Reduce motion"
          value={tweaks.reduceMotion ? "on" : "off"}
          entries={[
            ["off", "Off"],
            ["on", "On"],
          ]}
          onChange={(value) => dispatch(setReduceMotion(value === "on"))}
        />
        {/* Pal's floating bubble (the assistant). Hidden, Pal still opens
            from the Home tile, the Signal header and the widget. */}
        <SegmentRow
          label={`${palName}’s bubble`}
          value={bubbleHidden ? "hide" : "show"}
          entries={[
            ["show", "Show"],
            ["hide", "Hide"],
          ]}
          onChange={(value) => dispatch(setBubbleHidden(value === "hide"))}
        />
      </Group>

      <Group title="Reading · typography">
        {/* live preview reacts to font / size / spacing */}
        <View
          style={{
            padding: 16,
            borderRadius: 14,
            backgroundColor: palette.surfaceLowest,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              color: palette.onSurface,
              fontFamily: readerFontFamily,
              fontSize: tweaks.fontSize,
              lineHeight: tweaks.fontSize * tweaks.lineSpacing,
            }}
          >
            {PREVIEW_TEXT}
          </Text>
        </View>
        <SegmentRow
          label="Reader font"
          value={tweaks.readerFont}
          entries={[
            ["inter", "Inter"],
            ["atkinson", "Atkinson"],
            ["dyslexic", "Dyslexic"],
            ["lora", "Lora"],
            ["fraunces", "Fraunces"],
          ]}
          onChange={(value) => dispatch(setReaderFont(value))}
        />
        <SliderRow
          label="Font size"
          value={tweaks.fontSize}
          min={14}
          max={28}
          step={1}
          formatter={(value) => `${Math.round(value)}pt`}
          onChange={(value) => dispatch(setFontSize(value))}
        />
        <SliderRow
          label="Line spacing"
          value={tweaks.lineSpacing}
          min={1.3}
          max={2.2}
          step={0.1}
          formatter={(value) => value.toFixed(2)}
          onChange={(value) => dispatch(setLineSpacing(value))}
        />
      </Group>

      <Group title="Reading · layout">
        <SegmentRow
          label="Reader layout"
          value={tweaks.readerLayout}
          entries={[
            ["split", "Split"],
            ["focus", "Focus"],
            ["paginated", "Paginated"],
          ]}
          onChange={(value) => dispatch(setReaderLayout(value))}
        />
      </Group>

      <Group title="Audio">
        <SliderRow
          label="Words per minute"
          value={tweaks.wpm}
          min={120}
          max={950}
          step={10}
          formatter={(value) => `${Math.round(value)} wpm`}
          onChange={(value) => dispatch(setWpm(Math.round(value)))}
        />
        <SegmentRow
          label="Tone"
          value={tweaks.voice}
          entries={[
            ["soft", "Soft"],
            ["natural", "Natural"],
            ["deep", "Deep"],
          ]}
          onChange={(value) => dispatch(setVoice(value))}
        />
        <SegmentRow
          label="Speak equations"
          value={tweaks.speakEquations}
          entries={[
            ["off", "Skip"],
            ["placeholder", "\u201cEquation\u201d"],
            ["aloud", "Read aloud"],
          ]}
          onChange={(value) => dispatch(setSpeakEquations(value))}
        />
        <View style={{ height: 6 }} />
        <VoicePicker />
      </Group>

      {/* P3 — which backend the app is talking to, and whether it's alive */}
      <Group title="Backend connection">
        <ConnectionStatus />
      </Group>

      <AccountGroup />
    </KeyboardSafeScrollView>
  );
}

// Who is signed in, and a way out. Hidden on a single-user (LOCAL_MODE)
// server, whose fixed user has nothing to sign out of.
const LOCAL_MODE_EMAIL = "local@neuropal.app";

// The password change reports its own errors, in a line that stays on screen
// (the API layer's toast leaves after 5 s): the server's words when it sent
// some ("the current password is not right"), else what went wrong on the way.
async function postPasswordChange(body) {
  try {
    const { data } = await apiClient.post("auth/password", body);
    return { data };
  } catch (e) {
    const serverMsg = e?.response?.data?.error;
    if (serverMsg) return { error: serverMsg.charAt(0).toUpperCase() + serverMsg.slice(1) };
    return { error: describeNetworkError(e) };
  }
}

function AccountGroup() {
  const palette = usePalette();
  const dispatch = useDispatch();
  const { postData } = useApiRequest();
  const email = useSelector((s) => s.auth.email);
  const name = useSelector((s) => s.auth.userName);
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  // The password form's error, on screen until the next try: { text, field }.
  const [error, setError] = useState(null);
  const errorShown = useRef("");
  if (!email || email === LOCAL_MODE_EMAIL) return null;

  // The error line is a live region (TalkBack, web). iOS has none, and the
  // same words twice leave the line unchanged, so say those out loud.
  function showError(text, field = null) {
    if (Platform.OS === "ios" || errorShown.current === text) announce(text, { assertive: true });
    errorShown.current = text;
    setError({ text, field });
  }

  function clearError() {
    errorShown.current = "";
    setError(null);
  }

  async function signOut(message = "Signed out") {
    await clearSession().catch(() => {});
    clearDocTickets();
    dispatch(resetAuth());
    Toast.show({ type: "info", text1: message });
  }

  async function signOutEverywhere() {
    setBusy(true);
    const ok = await postData("auth/logout-all", {});
    setBusy(false);
    if (ok) await signOut("Signed out on every device");
  }

  async function changePassword() {
    if (busy) return;
    if (!current) {
      showError("Type your current password first", "current");
      return;
    }
    if (next.length < 8) {
      showError("Use at least 8 characters for the new password", "next");
      return;
    }
    clearError();
    setBusy(true);
    const { data, error: failure } = await postPasswordChange({ currentPassword: current, newPassword: next });
    setBusy(false);
    if (failure || !data?.token) {
      showError(failure || "The server sent no new session. Try again.");
      return;
    }
    await saveSessionToken(data.token);
    clearDocTickets();
    setChanging(false);
    setCurrent("");
    setNext("");
    Toast.show({ type: "success", text1: "Password changed", text2: "Other devices were signed out." });
  }

  return (
    <Group title="Account">
      <Text
        style={{
          color: palette.onSurface,
          fontFamily: palette.fonts.bodySemi,
          fontSize: 15,
        }}
      >
        {name || "Signed in"}
      </Text>
      <Text
        style={{
          marginTop: 2,
          marginBottom: 12,
          color: palette.onSurfaceVariant,
          fontFamily: palette.fonts.body,
          fontSize: 13,
        }}
      >
        {email}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <NpGhostButton label="Sign out" icon="logout" onPress={() => signOut()} disabled={busy} />
        <NpGhostButton
          label="Sign out everywhere"
          icon="devices"
          onPress={signOutEverywhere}
          disabled={busy}
          accessibilityLabel="Sign out on every device, including this one"
        />
        <NpGhostButton
          label={changing ? "Cancel" : "Change password"}
          icon={changing ? "close" : "key"}
          onPress={() => {
            clearError();
            setChanging((v) => !v);
          }}
          disabled={busy}
        />
      </View>
      {changing ? (
        <View style={{ marginTop: 6 }}>
          <PasswordField
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            autoComplete="current-password"
            textContentType="password"
            invalid={error?.field === "current"}
            errorId="password-change-error"
          />
          <PasswordField
            label="New password"
            value={next}
            onChangeText={setNext}
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={changePassword}
            helper="At least 8 characters"
            helperId="new-password-help"
            invalid={error?.field === "next"}
            errorId="password-change-error"
          />
          {/* What went wrong, until the next try. Always mounted: a live
              region is only read when its text changes. */}
          <Text
            id="password-change-error"
            accessibilityLiveRegion="assertive"
            aria-live="assertive"
            style={[
              { color: palette.error, fontFamily: palette.fonts.bodyMedium, fontSize: 13.5, lineHeight: 19 },
              // empty: no room taken (Android measures an empty Text as a line)
              error ? { marginTop: 10 } : { height: 0 },
            ]}
          >
            {error?.text || ""}
          </Text>
          <View style={{ marginTop: 10, alignSelf: "flex-start" }}>
            <NpGhostButton label={busy ? "Saving…" : "Save new password"} icon="check" onPress={changePassword} disabled={busy} />
          </View>
        </View>
      ) : null}
    </Group>
  );
}

// ids for aria-describedby, or nothing (kept out of the component: React
// Compiler can't lower `[a && b].join() || c` and would skip the component).
function describedByIds(...ids) {
  const list = ids.filter(Boolean);
  return list.length > 0 ? list.join(" ") : undefined;
}

// A password box like the sign-in screen's: a visible label, an edge that
// reads at 3:1 on the group (outline on Classic, the control colour on
// Signal), the rule under the field rather than only in a placeholder, and
// a labelled show/hide switch.
function PasswordField({ label, helper, helperId, invalid = false, errorId, ...props }) {
  const palette = usePalette();
  const [shown, setShown] = useState(false);
  const edge = invalid ? palette.error : palette.skin === "signal" ? palette.control : palette.outline;
  const describedBy = describedByIds(invalid ? errorId : null, helper ? helperId : null);
  const name = label.toLowerCase();

  return (
    <View style={{ marginTop: 10 }}>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: palette.fonts.bodyMedium,
          fontSize: 11,
          letterSpacing: 2,
          marginBottom: 6,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 48,
          paddingRight: 4,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: edge,
          backgroundColor: palette.surfaceLowest,
        }}
      >
        <TextInput
          {...props}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          placeholderTextColor={palette.onSurfaceVariant}
          style={{
            flex: 1,
            minHeight: 46,
            paddingHorizontal: 12,
            color: palette.onSurface,
            fontFamily: palette.fonts.body,
            fontSize: 14,
          }}
        />
        <Pressable
          onPress={() => setShown((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={shown ? `Hide ${name}` : `Show ${name}`}
          hitSlop={10}
          style={{ padding: 8 }}
        >
          <MaterialIcons name={shown ? "visibility-off" : "visibility"} size={20} color={palette.onSurfaceVariant} />
        </Pressable>
      </View>
      {helper ? (
        <Text
          id={helperId}
          style={{
            marginTop: 6,
            color: palette.onSurfaceVariant,
            fontFamily: palette.fonts.body,
            fontSize: 12.5,
            lineHeight: 17,
          }}
        >
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

function Group({ title, children }) {
  const palette = usePalette();
  return (
    <View
      style={{
        marginTop: 22,
        borderRadius: 20,
        backgroundColor: palette.surfaceContainer,
        padding: 18,
      }}
    >
      <Text
        style={{
          color: palette.accent,
          fontFamily: palette.fonts.bodySemi,
          fontSize: 12,
          letterSpacing: 1.8,
          marginBottom: 14,
        }}
      >
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

// The picked segment's accent label, nudged until it reads at AA on its own
// tint (the tokens' auto-contrast). Most accent/base pairs come back
// unchanged; a few (Signal red on Graphite, Classic light cyan…) only reach
// 3.9–4.4:1 on the tint as they are.
function pickedInk(palette) {
  const accent = hexToRgb(palette.accent);
  const group = hexToRgb(palette.surfaceContainer);
  if (!accent || !group) return palette.accent;
  return rgbToHex(fitContrast(accent, mix(group, accent, 0.14)));
}

// One choice out of a few: a radio group to screen readers, and the picked
// option also carries a check, so it never rests on colour alone (like Chip).
function SegmentRow({ label, value, entries, onChange }) {
  const palette = usePalette();
  const ink = pickedInk(palette);

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: palette.fonts.bodyMedium,
          fontSize: 11,
          letterSpacing: 2,
          marginBottom: 8,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <View
        accessibilityRole="radiogroup"
        aria-label={label}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
      >
        {entries.map(([key, display]) => {
          const selected = key === value;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              // react-native-web presses only role="button" with Space;
              // radios answer Space too (Enter already works).
              onKeyDown={
                Platform.OS === "web"
                  ? (e) => {
                      if (e.key !== " ") return;
                      e.preventDefault();
                      onChange(key);
                    }
                  : undefined
              }
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityLabel={`${label}: ${display}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: selected
                  ? withAlpha(palette.accent, 0.14)
                  : palette.surfaceHigh,
                borderWidth: 1,
                borderColor: selected
                  ? withAlpha(palette.accent, 0.4)
                  : "transparent",
              }}
            >
              {selected ? <MaterialIcons name="check" size={14} color={ink} style={{ marginRight: 5 }} /> : null}
              <Text
                style={{
                  color: selected ? ink : palette.onSurface,
                  fontFamily: selected ? palette.fonts.bodySemi : palette.fonts.bodyMedium,
                  fontSize: 13,
                }}
              >
                {display}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SliderRow({ label, value, min, max, step, formatter, onChange }) {
  const palette = usePalette();

  return (
    <View style={{ marginBottom: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <Text
          style={{
            flex: 1,
            color: palette.onSurfaceVariant,
            fontFamily: palette.fonts.bodyMedium,
            fontSize: 11,
            letterSpacing: 2,
          }}
        >
          {label.toUpperCase()}
        </Text>
        <Text
          style={{
            fontFamily: palette.fonts.mono,
            fontSize: 12,
            color: palette.accent,
          }}
        >
          {formatter(value)}
        </Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={onChange}
        minimumTrackTintColor={palette.accent}
        maximumTrackTintColor={withAlpha(palette.outlineVariant, 0.4)}
        thumbTintColor={palette.accent}
        accessibilityLabel={label}
      />
    </View>
  );
}
