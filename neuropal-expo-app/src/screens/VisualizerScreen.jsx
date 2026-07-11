import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Toast from "../components/toast";

import { VizView } from "../components/VizView";
import { buildVizPage, VIZ_TEMPLATES } from "../data/vizTemplates";
import {
  deleteSimulationApi,
  generateVizApi,
  listSimulationsApi,
  saveSimulationApi,
  USE_MOCK,
} from "../services/network";
import { apiConfigured } from "../store/ApiLink";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "../components/primitives";

// Physics visualizer: curated VERIFIED simulations (offline, hand-written
// physics) plus an AI prompt box. The backend first tries to match a prompt
// to a verified template; only genuinely novel asks are free-generated, and
// those are always labelled unverified (P5 §6.1). Saved sims persist their
// SPEC on the backend and re-render live on any device (§6.3).

export function VisualizerScreen() {
  const palette = usePalette();
  const [activeId, setActiveId] = useState(null);
  const [custom, setCustom] = useState(null); // AI-generated {title, html, spec}
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState("library"); // 'library' | 'saved'
  const [saved, setSaved] = useState([]);
  const [savedError, setSavedError] = useState(null);

  const active = custom || VIZ_TEMPLATES.find((t) => t.id === activeId);

  const refreshSaved = useCallback(async () => {
    if (USE_MOCK || !apiConfigured) return;
    try {
      setSaved(await listSimulationsApi());
      setSavedError(null);
    } catch (error) {
      setSavedError(error?.message || "Could not load saved simulations.");
    }
  }, []);
  useEffect(() => {
    if (tab === "saved") refreshSaved();
  }, [tab, refreshSaved]);

  async function generate() {
    const q = prompt.trim();
    if (!q || generating) return;
    setGenerating(true);
    try {
      const spec = await generateVizApi(q);
      if (spec.template) {
        // the backend matched a verified template — open it instead of
        // trusting an LLM to re-derive known physics
        const tpl = VIZ_TEMPLATES.find((t) => t.id === spec.template);
        if (tpl) {
          setActiveId(tpl.id);
          Toast.show({
            type: "success",
            text1: "Verified template",
            text2: `"${tpl.title}" covers this — opening the hand-checked sim.`,
          });
          return;
        }
      }
      setCustom({
        title: spec.title,
        html: buildVizPage(spec.title, spec.blurb, spec.sliders, spec.drawJs),
        spec: {
          title: spec.title,
          blurb: spec.blurb,
          sliders: spec.sliders,
          drawJs: spec.drawJs,
        },
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

  async function saveActive() {
    try {
      if (custom) {
        await saveSimulationApi({ title: custom.title, kind: "ai", spec: custom.spec });
      } else if (active) {
        await saveSimulationApi({
          title: active.title,
          kind: "template",
          templateId: active.id,
        });
      }
      Toast.show({ type: "success", text1: "Saved", text2: "Available on every device." });
      refreshSaved();
    } catch (error) {
      Toast.show({ type: "error", text1: "Save failed", text2: error?.message });
    }
  }

  function openSaved(sim) {
    if (sim.kind === "template") {
      const tpl = VIZ_TEMPLATES.find((t) => t.id === sim.templateId);
      if (!tpl) {
        Toast.show({
          type: "error",
          text1: "Template missing",
          text2: "This build no longer ships that template.",
        });
        return;
      }
      setActiveId(tpl.id);
      setCustom(null);
      return;
    }
    const s = sim.spec || {};
    setCustom({
      title: s.title || sim.title,
      html: buildVizPage(s.title || sim.title, s.blurb || "", s.sliders || [], s.drawJs || ""),
      spec: s,
      savedId: sim._id,
    });
  }

  async function removeSaved(sim) {
    try {
      await deleteSimulationApi(sim._id);
      refreshSaved();
    } catch (error) {
      Toast.show({ type: "error", text1: "Delete failed", text2: error?.message });
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
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
                backgroundColor: withAlpha(palette.error, 0.16),
                borderWidth: 1,
                borderColor: withAlpha(palette.error, 0.45),
                marginRight: 8,
              }}
              accessibilityRole="text"
              accessibilityLabel="AI generated, unverified physics"
            >
              <Text
                style={{
                  color: palette.error,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 10,
                  letterSpacing: 0.6,
                }}
              >
                AI-GENERATED — UNVERIFIED PHYSICS
              </Text>
            </View>
          ) : null}
          {!USE_MOCK && apiConfigured ? (
            <Pressable
              onPress={saveActive}
              accessibilityRole="button"
              accessibilityLabel="Save this simulation"
              hitSlop={6}
              style={{ padding: 8 }}
            >
              <MaterialIcons name="bookmark-add" size={20} color={palette.accent} />
            </Pressable>
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

      {/* Library | Saved tabs (P5 §6.3) */}
      {!USE_MOCK && apiConfigured ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
          {[
            ["library", "Library"],
            ["saved", "Saved"],
          ].map(([key, label]) => {
            const selected = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                accessibilityRole="button"
                accessibilityLabel={`${label} tab`}
                accessibilityState={{ selected }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 99,
                  backgroundColor: selected
                    ? withAlpha(palette.accent, 0.14)
                    : palette.surfaceContainer,
                  borderWidth: 1,
                  borderColor: selected ? withAlpha(palette.accent, 0.45) : "transparent",
                }}
              >
                <Text
                  style={{
                    color: selected ? palette.accent : palette.onSurfaceVariant,
                    fontFamily: "Inter_500Medium",
                    fontSize: 13,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {tab === "saved" ? (
        <View style={{ marginTop: 16, gap: 10 }}>
          {savedError ? (
            <Text
              style={{
                color: palette.error,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
              }}
            >
              {savedError}
            </Text>
          ) : null}
          {saved.length === 0 && !savedError ? (
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              Nothing saved yet — open any simulation and tap the bookmark to
              keep it here (and on every other device).
            </Text>
          ) : null}
          {saved.map((sim) => (
            <View
              key={sim._id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                borderRadius: 16,
                backgroundColor: palette.surfaceContainer,
              }}
            >
              <Pressable
                onPress={() => openSaved(sim)}
                accessibilityRole="button"
                accessibilityLabel={`Open saved simulation ${sim.title}`}
                style={{ flex: 1 }}
              >
                <Text
                  style={{
                    color: palette.onSurface,
                    fontFamily: "SpaceGrotesk_600SemiBold",
                    fontSize: 15,
                  }}
                >
                  {sim.title}
                </Text>
                <Text
                  style={{
                    color: sim.kind === "ai" ? palette.error : palette.onSurfaceVariant,
                    fontFamily: "Inter_500Medium",
                    fontSize: 10,
                    letterSpacing: 0.8,
                    marginTop: 3,
                  }}
                >
                  {sim.kind === "ai" ? "AI — UNVERIFIED PHYSICS" : "VERIFIED TEMPLATE"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => removeSaved(sim)}
                accessibilityRole="button"
                accessibilityLabel={`Delete saved simulation ${sim.title}`}
                hitSlop={8}
                style={{ padding: 8 }}
              >
                <MaterialIcons name="delete-outline" size={20} color={palette.onSurfaceVariant} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ marginTop: 20, gap: 12, display: tab === "library" ? "flex" : "none" }}>
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
