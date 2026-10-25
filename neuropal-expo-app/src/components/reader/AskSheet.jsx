import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePalette, useTheme } from "../../theme/ThemeProvider";
import { withAlpha } from "../primitives";

// Reader Q&A panel. The old Ask button silently fired one canned question
// and the answer only ever rendered as a split-layout margin note — in the
// default layout it looked completely dead. This sheet is the visible home
// for the conversation in EVERY layout: type a question (or tap a starter),
// watch the thinking state, read the answer + page citations, ask again.

const STARTERS = [
  "Explain this in plain language",
  "Why does this matter?",
  "Give a concrete example",
  "What should I remember for an exam?",
];

export function AskSheet({
  visible,
  onClose,
  onAsk, // (questionText) => void — dispatches the thunk
  messages, // reader.messages for this document (chronological)
  asking,
  contextLabel, // short excerpt of the paragraph the cursor is on
}) {
  const palette = usePalette();
  const { motionLevel } = useTheme();
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState("");
  const scrollRef = useRef(null);
  const still = motionLevel === "Still";

  // New answer or thinking state → keep the newest content in view.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: !still }),
      120
    );
    return () => clearTimeout(t);
  }, [visible, messages.length, asking, still]);

  function submit(text) {
    const q = (text ?? question).trim();
    if (!q || asking) return;
    onAsk(q);
    setQuestion("");
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType={still ? "none" : "slide"}
      onRequestClose={onClose}
    >
      {/* keyboard-controller's version lifts the sheet on Android too — the
          app is edge-to-edge there, so the window never resizes for the
          keyboard and RN's own KeyboardAvoidingView did nothing. The sheet
          stops below the status bar and shrinks (its answers scroll) instead
          of pushing its header and close button off the top (PalSheet's
          pattern). */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: insets.top + 32 }}>
          <Pressable
            onPress={onClose}
            accessible={false}
            importantForAccessibility="no"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: withAlpha("#000000", 0.55),
            }}
          />
          <View
            style={{
              flexShrink: 1,
              maxHeight: 560,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              backgroundColor: palette.surfaceContainer,
              paddingBottom: Platform.OS === "web" ? 16 : 28,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 18,
                paddingTop: 16,
                paddingBottom: 10,
              }}
            >
              <MaterialIcons name="auto-awesome" size={18} color={palette.accent} />
              <Text
                style={{
                  flex: 1,
                  marginLeft: 10,
                  color: palette.onSurface,
                  fontFamily: palette.fonts.displaySemi,
                  fontSize: 16,
                }}
              >
                Ask about this document
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close ask panel"
                hitSlop={10}
                style={{ padding: 6 }}
              >
                <MaterialIcons name="close" size={20} color={palette.onSurfaceVariant} />
              </Pressable>
            </View>

            {contextLabel ? (
              <View
                style={{
                  marginHorizontal: 18,
                  marginBottom: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: withAlpha(palette.accent, 0.08),
                  borderLeftWidth: 2,
                  borderLeftColor: withAlpha(palette.accent, 0.5),
                }}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    color: palette.onSurfaceVariant,
                    fontFamily: palette.fonts.body,
                    fontSize: 12,
                    lineHeight: 17,
                  }}
                >
                  Reading position: “{contextLabel}”
                </Text>
              </View>
            ) : null}

            <ScrollView
              ref={scrollRef}
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}
            >
              {messages.length === 0 && !asking ? (
                <Text
                  style={{
                    color: palette.onSurfaceVariant,
                    fontFamily: palette.fonts.body,
                    fontSize: 13,
                    lineHeight: 19,
                    paddingVertical: 8,
                  }}
                >
                  Answers are grounded in this document and cite the pages
                  they come from.
                </Text>
              ) : null}

              {messages.map((m) => (
                <View key={m.id} style={{ marginBottom: 14 }}>
                  <View
                    style={{
                      alignSelf: "flex-end",
                      maxWidth: "88%",
                      paddingHorizontal: 13,
                      paddingVertical: 9,
                      borderRadius: 14,
                      borderBottomRightRadius: 4,
                      backgroundColor: withAlpha(palette.accent, 0.16),
                    }}
                  >
                    <Text
                      style={{
                        color: palette.onSurface,
                        fontFamily: palette.fonts.bodyMedium,
                        fontSize: 13,
                        lineHeight: 19,
                      }}
                    >
                      {m.question}
                    </Text>
                  </View>
                  <View
                    style={{
                      alignSelf: "flex-start",
                      maxWidth: "94%",
                      marginTop: 8,
                      paddingHorizontal: 13,
                      paddingVertical: 10,
                      borderRadius: 14,
                      borderBottomLeftRadius: 4,
                      backgroundColor: palette.surfaceHigh,
                    }}
                  >
                    <Text
                      selectable
                      style={{
                        color: palette.onSurface,
                        fontFamily: palette.fonts.body,
                        fontSize: 14,
                        lineHeight: 21,
                      }}
                    >
                      {m.answer}
                    </Text>
                    {Array.isArray(m.citations) && m.citations.length > 0 ? (
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 6,
                          marginTop: 8,
                        }}
                      >
                        {m.citations.map((c, i) => (
                          <View
                            key={`${m.id}-c${i}`}
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 6,
                              backgroundColor: withAlpha(palette.tertiary, 0.14),
                            }}
                          >
                            <Text
                              style={{
                                color: palette.tertiary,
                                fontFamily: palette.fonts.mono,
                                fontSize: 11,
                              }}
                            >
                              {String(c)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}

              {asking ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 6,
                  }}
                >
                  <ActivityIndicator size="small" color={palette.accent} />
                  <Text
                    style={{
                      color: palette.onSurfaceVariant,
                      fontFamily: palette.fonts.body,
                      fontSize: 13,
                    }}
                  >
                    Reading the document…
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            {messages.length === 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 18 }}
                // only the answers give way when the sheet shrinks
                style={{ flexGrow: 0, flexShrink: 0, marginBottom: 10 }}
              >
                {STARTERS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => submit(s)}
                    disabled={asking}
                    accessibilityRole="button"
                    accessibilityLabel={`Ask: ${s}`}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 99,
                      backgroundColor: palette.surfaceHigh,
                      borderWidth: 1,
                      borderColor: withAlpha(palette.accent, 0.25),
                    }}
                  >
                    <Text
                      style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: palette.fonts.bodyMedium,
                        fontSize: 12,
                      }}
                    >
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                paddingHorizontal: 18,
              }}
            >
              <TextInput
                value={question}
                onChangeText={setQuestion}
                onSubmitEditing={() => submit()}
                editable={!asking}
                returnKeyType="send"
                placeholder="Ask anything about this document…"
                placeholderTextColor={palette.onSurfaceVariant}
                accessibilityLabel="Question input"
                style={{
                  flex: 1,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: palette.surfaceHigh,
                  color: palette.onSurface,
                  fontFamily: palette.fonts.body,
                  fontSize: 14,
                }}
              />
              <Pressable
                onPress={() => submit()}
                disabled={asking || !question.trim()}
                accessibilityRole="button"
                accessibilityLabel="Send question"
                style={{
                  width: 48,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: withAlpha(palette.accent, 0.18),
                  borderWidth: 1,
                  borderColor: withAlpha(palette.accent, 0.45),
                  opacity: asking || !question.trim() ? 0.4 : 1,
                }}
              >
                {asking ? (
                  <ActivityIndicator size="small" color={palette.accent} />
                ) : (
                  <MaterialIcons name="send" size={18} color={palette.accent} />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
