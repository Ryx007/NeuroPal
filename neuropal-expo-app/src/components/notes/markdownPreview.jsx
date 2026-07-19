import { Platform, ScrollView, Text, View } from "react-native";

import { MathView } from "../MathView";
import { blockMathOf, latexToUnicode, tokenizeMathParagraph } from "../../utils/math";
import { withAlpha } from "../primitives";

// P6/Issue 2 — the notes Markdown renderer: a small, honest Markdown subset
// plus the reader's math pipeline ($$…$$ → KaTeX, $…$ → prettified unicode).
// Shared between the unified canvas editor's text blocks and any full-page
// preview. Extracted from TypedNoteEditor when the editors merged.

export function MarkdownPreview({ markdown, palette }) {
  const blocks = String(markdown || "").split(/\n{2,}/);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      {blocks.map((block, i) => (
        <PreviewBlock key={i} block={block.trim()} palette={palette} />
      ))}
    </ScrollView>
  );
}

// One Markdown paragraph/block (no scroll container) — what canvas text
// blocks render when not being edited.
export function MarkdownBlocks({ markdown, palette, fontSize = 15 }) {
  const blocks = String(markdown || "").split(/\n{2,}/);
  return (
    <View>
      {blocks.map((block, i) => (
        <PreviewBlock key={i} block={block.trim()} palette={palette} fontSize={fontSize} />
      ))}
    </View>
  );
}

export function PreviewBlock({ block, palette, fontSize = 15 }) {
  if (!block) return null;

  // display math → KaTeX (same component the reader uses)
  const latex = blockMathOf(block.replace(/\n/g, " ")) || blockMathOf(block);
  if (latex) {
    return (
      <View style={{ marginVertical: 8 }}>
        <MathView latex={latex} color={palette.onSurface} fontSize={fontSize + 2} />
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
        <Text style={{ color: palette.onSurface, fontFamily: "JetBrainsMono_400Regular", fontSize: fontSize - 2 }}>
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
          fontSize: level === 1 ? fontSize + 11 : level === 2 ? fontSize + 6 : fontSize + 2,
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
            <InlineText text={line.replace(/^[-*]\s+/, "")} palette={palette} fontSize={fontSize} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ marginVertical: 4 }}>
      <InlineText text={block.replace(/\n/g, " ")} palette={palette} fontSize={fontSize} />
    </View>
  );
}

// Inline rendering: $…$ via the reader's tokenizer (gold prettified unicode),
// then **bold** / *italic* / `code` as styled spans.
export function InlineText({ text, palette, fontSize = 15 }) {
  const tokens = tokenizeMathParagraph(text);
  return (
    <Text
      style={{
        color: palette.onSurface,
        fontFamily: "Inter_400Regular",
        fontSize,
        lineHeight: Math.round(fontSize * 1.6),
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
