import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { requestStudyMaterial } from "../services/network";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "./primitives";

// Exam-prep sheet for the Reader (Phase 4 UI): generate a summary, a
// practice quiz, or a cheatsheet for the open document. Results come back
// as Markdown text and are rendered as selectable plain text — readable,
// copyable, zero new dependencies.

const ACTIONS = [
  { kind: "summarize", label: "Summary", icon: "subject", opts: { depth: "intuitive" } },
  { kind: "quiz", label: "Quiz", icon: "quiz", opts: { count: 10 } },
  { kind: "cheatsheet", label: "Cheatsheet", icon: "sticky-note-2", opts: {} },
];

export function StudySheet({ visible, onClose, documentId, documentTitle }) {
  const palette = usePalette();
  const [active, setActive] = useState(null); // kind currently shown
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Cache per kind so switching tabs doesn't regenerate (and re-bill).
  const [results, setResults] = useState({});

  // The sheet lives inside the always-mounted Reader tab — when the open
  // document changes, doc A's cached summary must not masquerade as doc B's.
  useEffect(() => {
    setResults({});
    setActive(null);
    setError(null);
    setLoading(false);
  }, [documentId]);

  async function generate(action, force = false) {
    if (loading) return; // one multi-minute LLM job at a time
    setActive(action.kind);
    setError(null);
    if (!force && results[action.kind]) return;
    setLoading(true);
    try {
      const res = await requestStudyMaterial(documentId, action.kind, action.opts);
      setResults((prev) => ({ ...prev, [action.kind]: res }));
    } catch (err) {
      setError(err?.message || "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;
  const current = active ? results[active] : null;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: withAlpha("#000000", 0.6),
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            maxHeight: "85%",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: palette.surfaceContainer,
            padding: 20,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <MaterialIcons name="school" size={20} color={palette.accent} />
            <View style={{ width: 8 }} />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: palette.onSurface,
                fontFamily: "SpaceGrotesk_600SemiBold",
                fontSize: 18,
              }}
            >
              Study · {documentTitle}
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="Close study sheet" style={{ padding: 6 }}>
              <MaterialIcons name="close" size={20} color={palette.onSurfaceVariant} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            {ACTIONS.map((action) => {
              const selected = active === action.kind;
              return (
                <Pressable
                  key={action.kind}
                  onPress={() => generate(action)}
                  accessibilityRole="button"
                  accessibilityLabel={`Generate ${action.label}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: selected
                      ? withAlpha(palette.accent, 0.16)
                      : palette.surfaceHigh,
                    borderWidth: 1,
                    borderColor: selected ? withAlpha(palette.accent, 0.5) : "transparent",
                  }}
                >
                  <MaterialIcons
                    name={action.icon}
                    size={16}
                    color={selected ? palette.accent : palette.onSurfaceVariant}
                  />
                  <View style={{ width: 6 }} />
                  <Text
                    style={{
                      color: selected ? palette.accent : palette.onSurfaceVariant,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 13,
                    }}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            style={{ marginTop: 16 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {!active ? (
              <Text
                style={{
                  color: palette.onSurfaceVariant,
                  fontFamily: "Inter_400Regular",
                  fontSize: 14,
                  lineHeight: 21,
                }}
              >
                Pick what to generate. Summaries build intuition, the quiz is for
                active recall, and the cheatsheet is a one-page last-minute review.
              </Text>
            ) : loading ? (
              <View style={{ alignItems: "center", paddingVertical: 30, gap: 12 }}>
                <ActivityIndicator color={palette.accent} />
                <Text
                  style={{
                    color: palette.onSurfaceVariant,
                    fontFamily: "Inter_400Regular",
                    fontSize: 13,
                  }}
                >
                  Reading the document and writing your {active}…
                </Text>
              </View>
            ) : error ? (
              <View>
                <Text
                  accessibilityRole="alert"
                  style={{
                    color: palette.error,
                    fontFamily: "Inter_500Medium",
                    fontSize: 14,
                    lineHeight: 20,
                  }}
                >
                  ⚠ {error}
                </Text>
                <Pressable
                  onPress={() => generate(ACTIONS.find((a) => a.kind === active), true)}
                  accessibilityRole="button"
                  style={{
                    marginTop: 12,
                    alignSelf: "flex-start",
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: withAlpha(palette.error, 0.14),
                  }}
                >
                  <Text style={{ color: palette.error, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : current ? (
              <Text
                selectable
                style={{
                  color: palette.onSurface,
                  fontFamily: "Inter_400Regular",
                  fontSize: 14,
                  lineHeight: 22,
                }}
              >
                {current.answer}
              </Text>
            ) : null}

            {current && !loading && !error ? (
              <Pressable
                onPress={() => generate(ACTIONS.find((a) => a.kind === active), true)}
                accessibilityRole="button"
                accessibilityLabel="Regenerate"
                style={{
                  marginTop: 18,
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: palette.surfaceHigh,
                }}
              >
                <MaterialIcons name="refresh" size={14} color={palette.onSurfaceVariant} />
                <View style={{ width: 6 }} />
                <Text
                  style={{
                    color: palette.onSurfaceVariant,
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                  }}
                >
                  Regenerate
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
