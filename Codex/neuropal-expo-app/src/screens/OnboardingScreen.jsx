import PagerView from "react-native-pager-view";
import { MaterialIcons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NpGhostButton, NpPrimaryButton, withAlpha } from "../components/primitives";
import { selectOnboardingState } from "../store/selectors";
import {
  completeOnboarding,
  setEnergyPattern,
  setPrimaryUse,
  toggleCondition,
} from "../store/slices/onboardingSlice";
import { usePalette } from "../theme/ThemeProvider";

export function OnboardingScreen() {
  const palette = usePalette();
  const [page, setPage] = useState(0);
  const dispatch = useDispatch();
  const { conditions, energyPattern, primaryUse } =
    useSelector(selectOnboardingState);
  const { width } = useWindowDimensions();
  const pagerRef = useRef(null);

  function setPageIndex(nextPage) {
    setPage(nextPage);
    pagerRef.current?.setPage?.(nextPage);
    pagerRef.current?.scrollTo?.({
      x: nextPage * width,
      animated: true,
    });
  }

  function next() {
    if (page === 3) {
      dispatch(completeOnboarding());
      return;
    }
    setPageIndex(page + 1);
  }

  function skip() {
    dispatch(completeOnboarding());
  }

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
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: withAlpha(palette.primary, 0.14),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MaterialIcons name="psychiatry" size={20} color={palette.primary} />
        </View>
        <View style={{ width: 12 }} />
        <Text
          style={{
            color: palette.onSurface,
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: 24,
          }}
        >
          NeuroPal
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={skip}>
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_500Medium",
            }}
          >
            Exit
          </Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 24, marginTop: 18 }}>
        <DotRow total={4} current={page} />
      </View>

      <PagerLike
        pageRef={pagerRef}
        onChange={setPage}
        width={width}
        pages={[
          <ConditionsPage
            key="conditions"
            selected={conditions}
            onToggle={(value) => dispatch(toggleCondition(value))}
          />,
          <EnergyPage
            key="energy"
            value={energyPattern}
            onPick={(value) => dispatch(setEnergyPattern(value))}
          />,
          <UsePage
            key="use"
            value={primaryUse}
            onPick={(value) => dispatch(setPrimaryUse(value))}
          />,
          <SummaryPage
            key="summary"
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
        }}
      >
        {page === 0 ? (
          <Pressable
            onPress={skip}
            style={{
              paddingVertical: 16,
              borderRadius: 18,
              backgroundColor: palette.surfaceLow,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 15,
              }}
            >
              Skip for now
            </Text>
          </Pressable>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <NpGhostButton label="Back" icon="arrow-back" onPress={() => setPageIndex(Math.max(0, page - 1))} />
          </View>
        )}
        <NpPrimaryButton
          expanded
          label={page === 3 ? "Enter NeuroPal" : "Continue"}
          onPress={next}
        />
        <View style={{ height: 12 }} />
        <Text
          style={{
            textAlign: "center",
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
          }}
        >
          Your data stays private and local.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function PagerLike({ pages, onChange, pageRef, width }) {
  try {
    return (
      <PagerView
        ref={pageRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={(event) => onChange(event.nativeEvent.position)}
      >
        {pages.map((page, index) => (
          <View key={index} style={{ flex: 1 }}>
            {page}
          </View>
        ))}
      </PagerView>
    );
  } catch {
    return (
      <ScrollView
        ref={pageRef}
        horizontal
        pagingEnabled
        contentInsetAdjustmentBehavior="automatic"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          onChange(Math.round(event.nativeEvent.contentOffset.x / width))
        }
      >
        {pages.map((page, index) => (
          <View key={index} style={{ width, flex: 1 }}>
            {page}
          </View>
        ))}
      </ScrollView>
    );
  }
}

function DotRow({ total, current }) {
  const palette = usePalette();

  return (
    <View style={{ flexDirection: "row" }}>
      {Array.from({ length: total }).map((_, index) => {
        const active = index === current;
        return (
          <View
            key={index}
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

function PageWrap({ title, subtitle, children }) {
  const palette = usePalette();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingTop: 36,
        paddingBottom: 20,
      }}
      showsVerticalScrollIndicator={false}
    >
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
      <View style={{ height: 14 }} />
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_400Regular",
          fontSize: 18,
          lineHeight: 28,
        }}
      >
        {subtitle}
      </Text>
      <View style={{ height: 28 }} />
      {children}
    </ScrollView>
  );
}

function ConditionsPage({ selected, onToggle }) {
  const palette = usePalette();
  const entries = [
    ["adhd", "ADHD"],
    ["asd", "Autism"],
    ["audhd", "AuDHD"],
    ["bpd", "BPD"],
    ["other", "Other"],
  ];

  return (
    <PageWrap
      title="Tailoring your sanctuary."
      subtitle="Which profiles best describe your neurotype? This helps us calibrate the sensory environment."
    >
      {entries.map(([id, label]) => {
        const checked = selected.includes(id);
        return (
          <Pressable
            key={id}
            onPress={() => onToggle(id)}
            style={{
              padding: 18,
              borderRadius: 18,
              marginBottom: 12,
              backgroundColor: palette.surfaceContainer,
              borderWidth: 1,
              borderColor: checked
                ? withAlpha(palette.accent, 0.4)
                : withAlpha(palette.outlineVariant, 0.15),
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: checked ? palette.accent : palette.outlineVariant,
                backgroundColor: checked ? palette.accent : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {checked ? (
                <MaterialIcons name="check" size={14} color={palette.onPrimary} />
              ) : null}
            </View>
            <View style={{ width: 12 }} />
            <Text
              style={{
                color: palette.onSurface,
                fontFamily: "Inter_500Medium",
                fontSize: 18,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </PageWrap>
  );
}

function EnergyPage({ value, onPick }) {
  const options = [
    ["morning", "Morning", "Peak focus before noon"],
    ["night", "Night", "Thinking lights up after sundown"],
    ["variable", "Variable", "No stable pattern yet"],
  ];

  return (
    <PageWrap
      title="When is your brain online?"
      subtitle="Anchors schedule around your actual energy, not the calendar's."
    >
      {options.map(([key, title, subtitle]) => (
        <OptionCard
          key={key}
          selected={value === key}
          title={title}
          subtitle={subtitle}
          onPress={() => onPick(key)}
        />
      ))}
    </PageWrap>
  );
}

function UsePage({ value, onPick }) {
  const options = [
    [
      "reading",
      "Study and research",
      "I want TTS, document Q&A, and a calm place to read papers.",
    ],
    [
      "regulation",
      "Daily regulation",
      "I want anchors, state check-ins, and emergency support.",
    ],
    [
      "both",
      "Both",
      "I want the full reader plus regulation system.",
    ],
  ];

  return (
    <PageWrap
      title="Why are you here today?"
      subtitle="We'll foreground what matters most first. The rest stays one tap away."
    >
      {options.map(([key, title, subtitle]) => (
        <OptionCard
          key={key}
          selected={value === key}
          title={title}
          subtitle={subtitle}
          onPress={() => onPick(key)}
        />
      ))}
    </PageWrap>
  );
}

function OptionCard({ selected, title, subtitle, onPress }) {
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

function SummaryPage({ conditions, energyPattern, primaryUse }) {
  const palette = usePalette();
  const lines = [];

  if (conditions.includes("adhd")) {
    lines.push("Time-blind friendly anchors with wide windows");
  }
  if (conditions.includes("asd")) {
    lines.push("Predictable transitions and lower sensory intensity");
  }
  if (conditions.includes("bpd")) {
    lines.push("Emergency regulation support pinned close");
  }
  if (energyPattern === "morning") {
    lines.push("Morning-loaded MVD with a lighter evening taper");
  }
  if (energyPattern === "night") {
    lines.push("Deep-focus blocks weighted later in the day");
  }
  if (primaryUse === "reading") {
    lines.push("Library and Reader stay foregrounded");
  }
  if (primaryUse === "regulation") {
    lines.push("Home and Anchors stay foregrounded");
  }
  if (lines.length === 0) {
    lines.push("We'll start from sensible defaults and keep everything tweakable.");
  }

  return (
    <PageWrap
      title="Here's what we'll do for you"
      subtitle="Nothing here is fixed. Theme, font, voice, and layout all stay adjustable from the tweaks sheet."
    >
      {lines.map((line) => (
        <View key={line} style={{ flexDirection: "row", marginBottom: 10 }}>
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
            {line}
          </Text>
        </View>
      ))}
    </PageWrap>
  );
}
