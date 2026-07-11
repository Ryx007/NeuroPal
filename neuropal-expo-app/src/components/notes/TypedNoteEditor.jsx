import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Toast from "../toast";

import { MathView } from "../MathView";
import { blockMathOf, latexToUnicode, tokenizeMathParagraph } from "../../utils/math";
import { exportNoteMarkdown, exportNoteTxt } from "../../utils/noteExport";
import { updateNoteRemote } from "../../store/slices/notesSlice";
import { useDispatch } from "react-redux";
import { usePalette } from "../../theme/ThemeProvider";
import { withAlpha } from "../primitives";

// P6 — typed notes. Canonical content IS Markdown (the work order's storage
// contract), edited in a plain multiline input with a formatting toolbar,
// with a live preview that renders headings/lists/bold/italic/code AND math
// through the reader's own pipeline ($$…$$ → KaTeX, $…$ → prettified
// unicode). A WYSIWYG lib (tentap) was considered and skipped: no inline-$
// math support and weak web behavior — markdown-first hits the acceptance
// (formatted + math + clean .md/.txt export) with zero new dependencies.

const TOOLBAR = [
  { key: "bold", icon: "format-bold", before: "**", after: "**", label: "Bold" },
  { key: "italic", icon: "format-italic", before: "*", after: "*", label: "Italic" },
  { key: "heading", icon: "title", before: "\n## ", after: "", label: "Heading" },
  { key: "list", icon: "format-list-bulleted", before: "\n- ", after: "", label: "List item" },
  { key: "code", icon: "code", before: "`", after: "`", label: "Inline code" },
  { key: "math", icon: "functions", before: "$", after: "$", label: "Inline math" },
  { key: "dmath", icon: "exposure", before: "\n\n$$\n", after: "\n$$\n", label: "Display math" },
];

export function TypedNoteEditor({ note, onBack }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const [title, setTitle] = useState(note.title || "");
  const [content, setContent] = useState(note.contentMarkdown || "");
  const [preview, setPreview] = useState(false);
  const selRef = useRef({ start: 0, end: 0 });
  const inputRef = useRef(null);
  const saveTimer = useRef(null);
  const latest = useRef({ title, content });
  latest.current = { title, content };

  const save = useCallback(() => {
    dispatch(
      updateNoteRemote({
        id: note._id || note.id,
        title: latest.current.title,
        contentMarkdown: latest.current.content,
      })
    )
      .unwrap()
      .catch((error) =>
        Toast.show({ type: "error", text1: "Note sync failed", text2: error?.message })
      );
  }, [dispatch, note._id, note.id]);

  // debounce server writes while typing; flush on unmount/back
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 1500);
  }, [save]);
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        save();
      }
    },
    [save]
  );

  function applyFormat(tool) {
    const { start, end } = selRef.current;
    const selected = content.slice(start, end);
    const next =
      content.slice(0, start) + tool.before + selected + tool.after + content.slice(end);
    setContent(next);
    scheduleSave();
  }

  async function runExport(kind) {
    try {
      if (kind === "md") await exportNoteMarkdown({ title, markdown: content });
      else await exportNoteTxt({ title, markdown: content });
      Toast.show({ type: "success", text1: `Exported .${kind}` });
    } catch (error) {
      if (!/cancell?ed|dismissed/i.test(error?.message || "")) {
        Toast.show({ type: "error", text1: "Export failed", text2: error?.message });
      }
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.surface }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* header */}
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
            save();
            onBack();
          }}
          accessibilityRole="button"
          accessibilityLabel="Back to notes"
          style={{ padding: 8 }}
        >
          <MaterialIcons name="arrow-back" size={20} color={palette.accent} />
        </Pressable>
        <TextInput
          value={title}
          onChangeText={(t) => {
            setTitle(t);
            scheduleSave();
          }}
          placeholder="Note title"
          placeholderTextColor={palette.onSurfaceVariant}
          accessibilityLabel="Note title"
          style={{
            flex: 1,
            color: palette.onSurface,
            fontFamily: "SpaceGrotesk_600SemiBold",
            fontSize: 17,
            paddingVertical: 6,
          }}
        />
        <Pressable
          onPress={() => runExport("md")}
          accessibilityRole="button"
          accessibilityLabel="Export as Markdown"
          style={{ padding: 8 }}
        >
          <Text style={{ color: palette.accent, fontFamily: "JetBrainsMono_400Regular", fontSize: 12 }}>
            .md
          </Text>
        </Pressable>
        <Pressable
          onPress={() => runExport("txt")}
          accessibilityRole="button"
          accessibilityLabel="Export as plain text"
          style={{ padding: 8 }}
        >
          <Text style={{ color: palette.accent, fontFamily: "JetBrainsMono_400Regular", fontSize: 12 }}>
            .txt
          </Text>
        </Pressable>
      </View>

      {/* toolbar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 10,
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        {TOOLBAR.map((tool) => (
          <Pressable
            key={tool.key}
            onPress={() => applyFormat(tool)}
            disabled={preview}
            accessibilityRole="button"
            accessibilityLabel={tool.label}
            style={{
              width: 44,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              opacity: preview ? 0.35 : 1,
            }}
          >
            <MaterialIcons name={tool.icon} size={20} color={palette.onSurfaceVariant} />
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => setPreview((p) => !p)}
          accessibilityRole="button"
          accessibilityLabel={preview ? "Edit" : "Preview"}
          accessibilityState={{ selected: preview }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            height: 40,
            borderRadius: 10,
            backgroundColor: preview ? withAlpha(palette.accent, 0.14) : "transparent",
          }}
        >
          <MaterialIcons
            name={preview ? "edit" : "visibility"}
            size={18}
            color={palette.accent}
          />
          <Text
            style={{
              marginLeft: 6,
              color: palette.accent,
              fontFamily: "Inter_600SemiBold",
              fontSize: 13,
            }}
          >
            {preview ? "Edit" : "Preview"}
          </Text>
        </Pressable>
      </View>

      {preview ? (
        <MarkdownPreview markdown={content} />
      ) : (
        <TextInput
          ref={inputRef}
          value={content}
          onChangeText={(t) => {
            setContent(t);
            scheduleSave();
          }}
          onSelectionChange={(e) => {
            selRef.current = e.nativeEvent.selection;
          }}
          multiline
          textAlignVertical="top"
          placeholder={"Write in Markdown — **bold**, ## headings, - lists, `code`,\n$\\hbar\\omega$ inline math, $$…$$ display math."}
          placeholderTextColor={palette.onSurfaceVariant}
          accessibilityLabel="Note content in Markdown"
          style={{
            flex: 1,
            color: palette.onSurface,
            fontFamily: "JetBrainsMono_400Regular",
            fontSize: 14,
            lineHeight: 22,
            padding: 16,
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Preview — small, honest Markdown subset + the reader's math pipeline
// ---------------------------------------------------------------------------

function MarkdownPreview({ markdown }) {
  const palette = usePalette();
  const blocks = String(markdown || "").split(/\n{2,}/);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      {blocks.map((block, i) => (
        <PreviewBlock key={i} block={block.trim()} palette={palette} />
      ))}
    </ScrollView>
  );
}

function PreviewBlock({ block, palette }) {
  if (!block) return null;

  // display math → KaTeX (same component the reader uses)
  const latex = blockMathOf(block.replace(/\n/g, " ")) || blockMathOf(block);
  if (latex) {
    return (
      <View style={{ marginVertical: 8 }}>
        <MathView latex={latex} color={palette.onSurface} fontSize={17} />
      </View>
    );
  }

  // fenced code
  if (/^```/.test(block)) {
    const body = block.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
    return (
      <View
        style={{
          backgroundColor: palette.surfaceLowest,
          borderRadius: 10,
          padding: 12,
          marginVertical: 6,
        }}
      >
        <Text style={{ color: palette.onSurface, fontFamily: "JetBrainsMono_400Regular", fontSize: 13 }}>
          {body}
        </Text>
      </View>
    );
  }

  // heading
  const h = block.match(/^(#{1,3})\s+(.*)$/s);
  if (h) {
    const level = h[1].length;
    return (
      <Text
        style={{
          color: palette.onSurface,
          fontFamily: "SpaceGrotesk_700Bold",
          fontSize: level === 1 ? 26 : level === 2 ? 21 : 17,
          marginTop: 14,
          marginBottom: 4,
        }}
      >
        {h[2]}
      </Text>
    );
  }

  // bullet list block
  if (/^[-*]\s/.test(block)) {
    return (
      <View style={{ marginVertical: 4, gap: 4 }}>
        {block.split("\n").map((line, i) => (
          <View key={i} style={{ flexDirection: "row" }}>
            <Text style={{ color: palette.accent, marginRight: 8 }}>•</Text>
            <InlineText text={line.replace(/^[-*]\s+/, "")} palette={palette} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ marginVertical: 4 }}>
      <InlineText text={block.replace(/\n/g, " ")} palette={palette} />
    </View>
  );
}

// Inline rendering: $…$ via the reader's tokenizer (gold prettified unicode),
// then **bold** / *italic* / `code` as styled spans.
function InlineText({ text, palette }) {
  const tokens = tokenizeMathParagraph(text);
  return (
    <Text
      style={{
        color: palette.onSurface,
        fontFamily: "Inter_400Regular",
        fontSize: 15,
        lineHeight: 24,
        flex: 1,
      }}
    >
      {tokens.map((tok, i) => {
        if (tok.latex) {
          return (
            <Text
              key={i}
              style={{
                color: palette.tertiary,
                fontFamily: Platform.OS === "web" ? "Georgia, serif" : "serif",
              }}
            >
              {latexToUnicode(tok.latex)}{" "}
            </Text>
          );
        }
        return <StyledSpans key={i} text={`${tok.display} `} palette={palette} />;
      })}
    </Text>
  );
}

function StyledSpans({ text, palette }) {
  // split on **bold**, *italic*, `code` — order matters (** before *)
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <Text key={i} style={{ fontFamily: "Inter_600SemiBold" }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (/^\*[^*\n]+\*$/.test(part)) {
      return (
        <Text key={i} style={{ fontStyle: "italic" }}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <Text
          key={i}
          style={{
            fontFamily: "JetBrainsMono_400Regular",
            backgroundColor: withAlpha(palette.onSurfaceVariant, 0.15),
          }}
        >
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}
