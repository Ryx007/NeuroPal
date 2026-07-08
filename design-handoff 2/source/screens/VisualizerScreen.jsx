import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { VizView } from "../components/VizView";
import { VIZ_TEMPLATES } from "../data/vizTemplates";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "../components/primitives";

// Physics visualizer (Module 9 Tier 1): interactive canvas simulations with
// parameter sliders, fully offline. Gallery → fullscreen template.

export function VisualizerScreen() {
  const palette = usePalette();
  const [activeId, setActiveId] = useState(null);
  const active = VIZ_TEMPLATES.find((t) => t.id === activeId);

  if (active) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Pressable
            onPress={() => setActiveId(null)}
            accessibilityLabel="Back to visualizer gallery"
            style={{ padding: 8 }}
          >
            <MaterialIcons name="arrow-back" size={20} color={palette.accent} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              color: palette.onSurface,
              fontFamily: "SpaceGrotesk_600SemiBold",
              fontSize: 17,
              marginLeft: 6,
            }}
          >
            {active.title}
          </Text>
        </View>
        <View style={{ flex: 1, marginBottom: 88 }}>
          <VizView html={active.html} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 160 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          color: palette.onSurface,
          fontFamily: "SpaceGrotesk_700Bold",
          fontSize: 34,
          letterSpacing: -0.8,
        }}
      >
        Visualizer
      </Text>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_400Regular",
          fontSize: 16,
          marginTop: 4,
        }}
      >
        Turn the knobs. Build the intuition.
      </Text>

      <View style={{ marginTop: 20, gap: 12 }}>
        {VIZ_TEMPLATES.map((tpl) => (
          <Pressable
            key={tpl.id}
            onPress={() => setActiveId(tpl.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${tpl.title}`}
            style={{
              padding: 16,
              borderRadius: 18,
              backgroundColor: palette.surfaceContainer,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: withAlpha(palette.accent, 0.12),
              }}
            >
              <MaterialIcons name={tpl.icon} size={22} color={palette.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text
                style={{
                  color: palette.onSurface,
                  fontFamily: "SpaceGrotesk_600SemiBold",
                  fontSize: 16,
                }}
              >
                {tpl.title}
              </Text>
              <Text
                numberOfLines={2}
                style={{
                  color: palette.onSurfaceVariant,
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  marginTop: 3,
                  lineHeight: 17,
                }}
              >
                {tpl.blurb}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={palette.onSurfaceVariant} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
