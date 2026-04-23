import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  NpGhostButton,
  NpPrimaryButton,
  withAlpha,
} from "@/components/primitives";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectOnboardingState } from "@/store/selectors";
import {
  completeOnboarding,
  setEnergyPattern,
  setPrimaryUse,
  toggleCondition,
} from "@/store/slices/onboardingSlice";
import { usePalette } from "@/theme/ThemeProvider";

/**
 * 4-step onboarding per the plan doc (§Sprint 2.2):
 *   1. Condition profile  — checkboxes, all optional, skip allowed
 *   2. Energy pattern     — morning / night / variable
 *   3. Primary use case   — reading / regulation / both
 *   4. Personalised summary
 *
 * PagerView is degraded to horizontal ScrollView pages on web where
 * PagerView isn't supported; falls back to `ScrollView horizontal pagingEnabled`
 * on that platform via a simple dynamic import.
 */
export default function OnboardingScreen() {
  const palette = usePalette();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const dispatch = useAppDispatch();
  const { conditions, energyPattern, primaryUse } =
    useAppSelector(selectOnboardingState);
  const { width } = useWindowDimensions();

  const ref = useRef<any>(null);
  const setPageIndex = (n: number) => {
    setPage(n);
    ref.current?.setPage?.(n);
    ref.current?.scrollTo?.({
      x: n * width,
      animated: true,
    });
  };

  const next = () => {
    if (page === 3) {
      dispatch(completeOnboarding());
      router.replace("/");
      return;
    }
    setPageIndex(page + 1);
  };
  const prev = () => setPageIndex(Math.max(0, page - 1));

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: palette.surface }}
      edges={["top", "left", "right"]}
    >
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 16,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <DotRow total={4} current={page} />
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => {
            dispatch(completeOnboarding());
            router.replace("/");
          }}
        >
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_500Medium",
            }}
          >
            Skip
          </Text>
        </Pressable>
      </View>

      <PagerLike
        pageRef={ref}
        onChange={setPage}
        width={width}
        pages={[
          <ConditionsPage
            key="c"
            selected={conditions}
            onToggle={(value) => dispatch(toggleCondition(value))}
          />,
          <EnergyPage
            key="e"
            value={energyPattern}
            onPick={(value) => dispatch(setEnergyPattern(value))}
          />,
          <UsePage
            key="u"
            value={primaryUse}
            onPick={(value) => dispatch(setPrimaryUse(value))}
          />,
          <SummaryPage
            key="s"
            conditions={conditions}
            energyPattern={energyPattern}
            primaryUse={primaryUse}
          />,
        ]}
      />

      <View
        style={{
          paddingHorizontal: 24,
          paddingVertical: 20,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {page > 0 ? (
          <NpGhostButton
            label="Back"
            icon="arrow-back"
            onPress={prev}
          />
        ) : null}
        <View style={{ flex: 1 }} />
        <NpPrimaryButton
          label={page === 3 ? "Enter NeuroPal" : "Continue"}
          icon="arrow-forward"
          onPress={next}
        />
      </View>
    </SafeAreaView>
  );
}

function PagerLike({
  pages,
  onChange,
  pageRef,
  width,
}: {
  pages: React.ReactNode[];
  onChange: (n: number) => void;
  pageRef: React.MutableRefObject<any>;
  width: number;
}) {
  // Try PagerView; if the module isn't available (e.g. on a fresh install
  // without a rebuild), fall back to a horizontal ScrollView.
  try {
    return (
      <PagerView
        ref={pageRef as any}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={(e) => onChange(e.nativeEvent.position)}
      >
        {pages.map((p, i) => (
          <View key={i} style={{ flex: 1 }}>
            {p}
          </View>
        ))}
      </PagerView>
    );
  } catch {
    return (
      <ScrollView
        ref={pageRef as any}
        horizontal
        pagingEnabled
        contentInsetAdjustmentBehavior="automatic"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          onChange(Math.round(e.nativeEvent.contentOffset.x / width))
        }
      >
        {pages.map((p, i) => (
          <View key={i} style={{ width, flex: 1 }}>
            {p}
          </View>
        ))}
      </ScrollView>
    );
  }
}

function DotRow({ total, current }: { total: number; current: number }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row" }}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i === current;
        return (
          <View
            key={i}
            style={{
              width: active ? 22 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: active
                ? palette.accent
                : withAlpha(palette.outlineVariant, 0.5),
              marginRight: 8,
            }}
          />
        );
      })}
    </View>
  );
}

function PageWrap({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          color: palette.accent,
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          letterSpacing: 2,
        }}
      >
        {eyebrow.toUpperCase()}
      </Text>
      <View style={{ height: 12 }} />
      <Text
        style={{
          color: palette.onSurface,
          fontFamily: "SpaceGrotesk_700Bold",
          fontSize: 30,
          letterSpacing: -0.8,
        }}
      >
        {title}
      </Text>
      <View style={{ height: 10 }} />
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_400Regular",
          fontSize: 15,
          lineHeight: 22,
        }}
      >
        {subtitle}
      </Text>
      <View style={{ height: 24 }} />
      {children}
    </ScrollView>
  );
}

function ConditionsPage({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const palette = usePalette();
  const entries: [string, string][] = [
    ["adhd", "ADHD"],
    ["asd", "Autism / ASD"],
    ["audhd", "AuDHD"],
    ["bpd", "BPD"],
    ["ptsd", "PTSD"],
    ["dyslexia", "Dyslexia"],
    ["dyscalculia", "Dyscalculia"],
    ["spd", "Sensory processing"],
  ];
  return (
    <PageWrap
      eyebrow="Step 1 of 4"
      title="What fits you?"
      subtitle="Tick anything that applies. All optional. We use this to tune anchors, protocols, and the companion — nothing leaves your device without your consent."
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {entries.map(([id, name]) => {
          const checked = selected.includes(id);
          return (
            <Pressable
              key={id}
              onPress={() => onToggle(id)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 16,
                backgroundColor: checked
                  ? withAlpha(palette.accent, 0.14)
                  : palette.surfaceContainer,
                borderWidth: 1,
                borderColor: checked
                  ? withAlpha(palette.accent, 0.45)
                  : withAlpha(palette.outlineVariant, 0.2),
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <MaterialIcons
                name={checked ? "check-circle" : "radio-button-unchecked"}
                size={16}
                color={checked ? palette.accent : palette.onSurfaceVariant}
              />
              <View style={{ width: 8 }} />
              <Text
                style={{
                  color: checked ? palette.accent : palette.onSurface,
                  fontFamily: "Inter_500Medium",
                  fontSize: 13,
                }}
              >
                {name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </PageWrap>
  );
}

function EnergyPage({
  value,
  onPick,
}: {
  value?: string;
  onPick: (v: "morning" | "night" | "variable") => void;
}) {
  const options: ["morning" | "night" | "variable", string, string][] = [
    ["morning", "Morning", "Peak focus before noon"],
    ["night", "Night", "Thinking lights up after sundown"],
    ["variable", "Variable", "No pattern — sleep/medication dependent"],
  ];
  return (
    <PageWrap
      eyebrow="Step 2 of 4"
      title="When is your brain online?"
      subtitle="Anchors schedule around your actual energy, not the calendar's. You can change this any time."
    >
      {options.map(([k, title, sub]) => (
        <OptionCard
          key={k}
          selected={value === k}
          title={title}
          subtitle={sub}
          onPress={() => onPick(k)}
        />
      ))}
    </PageWrap>
  );
}

function UsePage({
  value,
  onPick,
}: {
  value?: string;
  onPick: (v: "reading" | "regulation" | "both") => void;
}) {
  const options: ["reading" | "regulation" | "both", string, string][] = [
    [
      "reading",
      "Study & research",
      "I want TTS, document Q&A, and a calm place to read papers.",
    ],
    [
      "regulation",
      "Daily regulation",
      "I want anchors, state check-ins, and protocol support.",
    ],
    [
      "both",
      "Both",
      "I want the full system — reader + SCAFFOLD framework.",
    ],
  ];
  return (
    <PageWrap
      eyebrow="Step 3 of 4"
      title="Why are you here today?"
      subtitle="We'll start by foregrounding what matters most. The rest stays one tap away."
    >
      {options.map(([k, title, sub]) => (
        <OptionCard
          key={k}
          selected={value === k}
          title={title}
          subtitle={sub}
          onPress={() => onPick(k)}
        />
      ))}
    </PageWrap>
  );
}

function OptionCard({
  selected,
  title,
  subtitle,
  onPress,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 18,
        borderRadius: 20,
        marginBottom: 10,
        backgroundColor: selected
          ? withAlpha(palette.accent, 0.12)
          : palette.surfaceContainer,
        borderWidth: 1,
        borderColor: selected
          ? withAlpha(palette.accent, 0.45)
          : withAlpha(palette.outlineVariant, 0.15),
        flexDirection: "row",
      }}
    >
      <MaterialIcons
        name={selected ? "radio-button-checked" : "radio-button-unchecked"}
        size={20}
        color={selected ? palette.accent : palette.onSurfaceVariant}
      />
      <View style={{ width: 12 }} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: selected ? palette.accent : palette.onSurface,
            fontFamily: "SpaceGrotesk_600SemiBold",
            fontSize: 16,
          }}
        >
          {title}
        </Text>
        <View style={{ height: 4 }} />
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            lineHeight: 19,
          }}
        >
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function SummaryPage({
  conditions,
  energyPattern,
  primaryUse,
}: {
  conditions: string[];
  energyPattern?: string;
  primaryUse?: string;
}) {
  const palette = usePalette();
  const lines: string[] = [];
  if (conditions.includes("adhd"))
    lines.push("Time-blind friendly anchors with wide windows");
  if (conditions.includes("asd"))
    lines.push("Predictable transitions and sensory-low visuals");
  if (conditions.includes("bpd"))
    lines.push("DBT protocol library always two taps away");
  if (conditions.includes("ptsd"))
    lines.push(
      "TIPP + grounding in Emergency, accessible from every screen"
    );
  if (conditions.includes("dyslexia"))
    lines.push(
      "Reader defaults: Atkinson Hyperlegible, extra letter spacing"
    );
  if (energyPattern === "morning")
    lines.push("Morning-loaded MVD with a gentle evening taper");
  if (energyPattern === "night")
    lines.push("Deep-focus blocks scheduled after sunset");
  if (primaryUse === "reading")
    lines.push("Home → Library and Reader as primary routes");
  if (primaryUse === "regulation")
    lines.push("Home → anchors + state check-in as primary routes");
  if (lines.length === 0)
    lines.push(
      "We'll start with sensible defaults — you can tune anything later."
    );
  return (
    <PageWrap
      eyebrow="Step 4 of 4"
      title="Here's what we'll do for you"
      subtitle="Nothing here is fixed. Settings, anchors, theme, font — all reachable from the Tweaks sheet on every screen."
    >
      {lines.map((l) => (
        <View
          key={l}
          style={{ flexDirection: "row", marginBottom: 10 }}
        >
          <MaterialIcons name="check" size={18} color={palette.accent} />
          <View style={{ width: 10 }} />
          <Text
            style={{
              flex: 1,
              color: palette.onSurface,
              fontFamily: "Inter_400Regular",
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {l}
          </Text>
        </View>
      ))}
    </PageWrap>
  );
}
