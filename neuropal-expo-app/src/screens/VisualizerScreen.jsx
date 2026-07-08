import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

import { VizView } from "../components/VizView";
import { buildVizPage, VIZ_TEMPLATES } from "../data/vizTemplates";
import { generateVizApi, USE_MOCK } from "../services/network";
import { apiConfigured } from "../store/ApiLink";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "../components/primitives";

// Physics visualizer: curated interactive simulations (offline) plus an
// AI prompt box — the backend returns a slider+canvas spec in the same
// runtime contract as the built-ins, rendered through the same sandboxed
// WebView/iframe. Gallery → fullscreen.

export function VisualizerScreen() {
  const palette = usePalette();
  const [activeId, setActiveId] = useState(null);
  const [custom, setCustom] = useState(null); // AI-generated {title, html}
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  const active = custom || VIZ_TEMPLATES.find((t) => t.id === activeId);

  async function generate() {
    const q = prompt.trim();
    if (!q || generating) return;
    setGenerating(true);
    try {
      const spec = await generateVizApi(q);
      setCustom({
        title: spec.title,
        html: buildVizPage(spec.title, spec.blurb, spec.sliders, spec.drawJs),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Generation failed",
        text2: error?.message,
      });
    } finally {
      setGenerating(false);
    }
  }

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
            onPress={() => {
              setActiveId(null);
              setCustom(null);
            }}
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
          {custom ? (
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                letterSpacing: 1,
              }}
            >
              AI-GENERATED
            </Text>
          ) : null}
        </View>
        <View style={{ flex: 1, marginBottom: 0 }}>
          <VizView html={active.html} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}
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

      {!USE_MOCK && apiConfigured ? (
        <View
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 18,
            backgroundColor: palette.surfaceContainer,
            borderWidth: 1,
            borderColor: withAlpha(palette.accent, 0.25),
          }}
        >
          <Text
            style={{
              color: palette.onSurface,
              fontFamily: "Inter_600SemiBold",
              fontSize: 14,
            }}
          >
            Generate with AI
          </Text>
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              marginTop: 3,
            }}
          >
            Describe any physics or math concept — get an interactive
            simulation with sliders.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              onSubmitEditing={generate}
              editable={!generating}
              placeholder="e.g. RC circuit charging curve"
              placeholderTextColor={palette.onSurfaceVariant}
              accessibilityLabel="Visualization prompt"
              style={{
                flex: 1,
                paddingHorizontal: 14,
                paddingVertical: 11,
                borderRadius: 12,
                backgroundColor: palette.surfaceHigh,
                color: palette.onSurface,
                fontFamily: "Inter_400Regular",
                fontSize: 14,
              }}
            />
            <Pressable
              onPress={generate}
              disabled={generating || !prompt.trim()}
              accessibilityRole="button"
              accessibilityLabel="Generate visualization"
              style={{
                paddingHorizontal: 16,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: withAlpha(palette.accent, 0.16),
                borderWidth: 1,
                borderColor: withAlpha(palette.accent, 0.4),
                opacity: generating || !prompt.trim() ? 0.4 : 1,
              }}
            >
              {generating ? (
                <ActivityIndicator size="small" color={palette.accent} />
              ) : (
                <MaterialIcons name="auto-awesome" size={20} color={palette.accent} />
              )}
            </Pressable>
          </View>
          {generating ? (
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                marginTop: 8,
              }}
            >
              Writing the simulation… this can take up to a minute.
            </Text>
          ) : null}
        </View>
      ) : null}

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
