import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";

import { requestFlashcards, requestStudyMaterial } from "../services/network";
import { setDeck } from "../store/slices/flashcardsSlice";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "./primitives";

// Exam-prep sheet for the Reader (Phase 4 UI): generate a summary, a
// practice quiz, or a cheatsheet for the open document. Results come back
// as Markdown text and are rendered as selectable plain text — readable,
// copyable, zero new dependencies.

// Active-recall deck: tap to flip, "Again" requeues the card at the end,
// "Got it" retires it. Session state is local; the deck itself persists.
function FlashcardsDeck({ cards }) {
  const palette = usePalette();
  const [queue, setQueue] = useState(() => cards.map((_, i) => i));
  const [flipped, setFlipped] = useState(false);
  const [learned, setLearned] = useState(0);

  useEffect(() => {
    setQueue(cards.map((_, i) => i));
    setFlipped(false);
    setLearned(0);
  }, [cards]);

  const shuffled = useMemo(() => cards, [cards]);
  const currentIdx = queue[0];
  const card = currentIdx !== undefined ? shuffled[currentIdx] : null;

  function answer(gotIt) {
    setFlipped(false);
    setQueue((q) => {
      const [head, ...rest] = q;
      return gotIt ? rest : [...rest, head];
    });
    if (gotIt) setLearned((n) => n + 1);
  }

  if (!card) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 24, gap: 12 }}>
        <MaterialIcons name="emoji-events" size={36} color={palette.accent} />
        <Text
          style={{
            color: palette.onSurface,
            fontFamily: "SpaceGrotesk_600SemiBold",
            fontSize: 16,
          }}
        >
          Deck complete — {learned}/{cards.length} recalled
        </Text>
        <Pressable
          onPress={() => {
            setQueue(cards.map((_, i) => i).sort(() => Math.random() - 0.5));
            setLearned(0);
            setFlipped(false);
          }}
          accessibilityRole="button"
          style={{
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: withAlpha(palette.accent, 0.14),
            borderWidth: 1,
            borderColor: withAlpha(palette.accent, 0.4),
          }}
        >
          <Text style={{ color: palette.accent, fontFamily: "Inter_600SemiBold" }}>
            Shuffle & restart
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "JetBrainsMono_400Regular",
          fontSize: 11,
          textAlign: "center",
        }}
      >
        {learned} recalled · {queue.length} to go
      </Text>

      <Pressable
        onPress={() => setFlipped((f) => !f)}
        accessibilityRole="button"
        accessibilityLabel={flipped ? "Show question" : "Reveal answer"}
        style={{
          marginTop: 10,
          minHeight: 180,
          borderRadius: 18,
          padding: 20,
          justifyContent: "center",
          backgroundColor: flipped
            ? withAlpha(palette.accent, 0.08)
            : palette.surfaceHigh,
          borderWidth: 1,
          borderColor: flipped ? withAlpha(palette.accent, 0.35) : "transparent",
        }}
      >
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_600SemiBold",
            fontSize: 10,
            letterSpacing: 1.6,
            marginBottom: 10,
          }}
        >
          {flipped ? "ANSWER" : "QUESTION — tap to reveal"}
        </Text>
        <Text
          selectable
          style={{
            color: palette.onSurface,
            fontFamily: "Inter_400Regular",
            fontSize: 16,
            lineHeight: 24,
          }}
        >
          {flipped ? card.back : card.front}
        </Text>
      </Pressable>

      {flipped ? (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          <Pressable
            onPress={() => answer(false)}
            accessibilityRole="button"
            accessibilityLabel="Again — show this card later"
            style={{
              flex: 1,
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: "center",
              backgroundColor: withAlpha(palette.warn, 0.14),
              borderWidth: 1,
              borderColor: withAlpha(palette.warn, 0.4),
            }}
          >
            <Text style={{ color: palette.warn, fontFamily: "Inter_600SemiBold" }}>
              Again
            </Text>
          </Pressable>
          <Pressable
            onPress={() => answer(true)}
            accessibilityRole="button"
            accessibilityLabel="Got it — retire this card"
            style={{
              flex: 1,
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: "center",
              backgroundColor: withAlpha(palette.accent, 0.16),
              borderWidth: 1,
              borderColor: withAlpha(palette.accent, 0.45),
            }}
          >
            <Text style={{ color: palette.accent, fontFamily: "Inter_600SemiBold" }}>
              Got it
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const ACTIONS = [
  { kind: "summarize", label: "Summary", icon: "subject", opts: { depth: "intuitive" } },
  { kind: "quiz", label: "Quiz", icon: "quiz", opts: { count: 10 } },
  { kind: "cheatsheet", label: "Cheatsheet", icon: "sticky-note-2", opts: {} },
  { kind: "flashcards", label: "Cards", icon: "style", opts: { count: 15 } },
];

export function StudySheet({ visible, onClose, documentId, documentTitle }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const savedDeck = useSelector((s) => s.flashcards.byDoc[documentId]);
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
    if (action.kind === "flashcards") {
      // Persisted deck (survives restarts) unless the user forces a redo.
      if (!force && (results.flashcards || savedDeck?.cards?.length)) return;
      setLoading(true);
      try {
        const res = await requestFlashcards(documentId, action.opts.count);
        setResults((prev) => ({ ...prev, flashcards: res }));
        dispatch(setDeck({ docId: documentId, cards: res.cards }));
      } catch (err) {
        setError(err?.message || "Generation failed.");
      } finally {
        setLoading(false);
      }
      return;
    }
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
  const deckCards =
    active === "flashcards"
      ? results.flashcards?.cards || savedDeck?.cards || null
      : null;

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
            ) : deckCards ? (
              <FlashcardsDeck cards={deckCards} />
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

            {(current || deckCards) && !loading && !error ? (
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
