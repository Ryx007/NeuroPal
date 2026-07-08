import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

import { importPaperApi, searchPapersApi } from "../../services/network";
import { usePalette } from "../../theme/ThemeProvider";
import { withAlpha } from "../primitives";

// D11 — collapsible academic search inside the Library. Collapsed it is a
// single glass row; expanded it holds the query field, source chips and the
// result list. Import = backend downloads the OA pdf and ingests it like any
// upload, so the paper lands in the grid below with live ingest progress.

const SOURCES = [
  ["all", "Both"],
  ["arxiv", "arXiv"],
  ["scholar", "Scholar"],
];

export function PaperSearch({ onImported }) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null); // null = not searched yet
  const [warnings, setWarnings] = useState([]);
  const [importingId, setImportingId] = useState(null);

  async function runSearch() {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const data = await searchPapersApi(q, source);
      setResults(data.results || []);
      setWarnings(data.warnings || []);
    } catch (error) {
      Toast.show({ type: "error", text1: "Search failed", text2: error?.message });
    } finally {
      setBusy(false);
    }
  }

  async function importPaper(paper) {
    if (importingId) return;
    setImportingId(paper.id);
    try {
      await importPaperApi(paper);
      Toast.show({
        type: "success",
        text1: "Added to library",
        text2: "Downloading and indexing in the background.",
      });
      onImported?.();
    } catch (error) {
      Toast.show({ type: "error", text1: "Import failed", text2: error?.message });
    } finally {
      setImportingId(null);
    }
  }

  return (
    <View
      style={{
        marginTop: 18,
        borderRadius: 18,
        backgroundColor: palette.surfaceContainer,
        borderWidth: 1,
        borderColor: withAlpha(palette.accent, open ? 0.35 : 0.12),
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={
          open ? "Collapse paper search" : "Search arXiv and Scholar"
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          gap: 10,
        }}
      >
        <MaterialIcons name="travel-explore" size={20} color={palette.accent} />
        <Text
          style={{
            flex: 1,
            color: palette.onSurface,
            fontFamily: "Inter_600SemiBold",
            fontSize: 14,
          }}
        >
          Search arXiv &amp; Scholar
        </Text>
        <MaterialIcons
          name={open ? "expand-less" : "expand-more"}
          size={22}
          color={palette.onSurfaceVariant}
        />
      </Pressable>

      {open ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={runSearch}
              returnKeyType="search"
              placeholder="e.g. squeezed light tomography"
              placeholderTextColor={palette.onSurfaceVariant}
              accessibilityLabel="Paper search query"
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
              onPress={runSearch}
              disabled={busy || !query.trim()}
              accessibilityRole="button"
              accessibilityLabel="Run paper search"
              style={{
                width: 46,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: withAlpha(palette.accent, 0.16),
                borderWidth: 1,
                borderColor: withAlpha(palette.accent, 0.4),
                opacity: busy || !query.trim() ? 0.4 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={palette.accent} />
              ) : (
                <MaterialIcons name="search" size={20} color={palette.accent} />
              )}
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            {SOURCES.map(([value, label]) => {
              const selected = source === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setSource(value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Search source ${label}`}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 99,
                    backgroundColor: selected
                      ? withAlpha(palette.accent, 0.14)
                      : palette.surfaceHigh,
                    borderWidth: 1,
                    borderColor: selected
                      ? withAlpha(palette.accent, 0.45)
                      : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: selected ? palette.accent : palette.onSurfaceVariant,
                      fontFamily: "Inter_500Medium",
                      fontSize: 12,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {warnings.map((w) => (
            <Text
              key={w}
              style={{
                color: palette.warn,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                marginTop: 10,
              }}
            >
              {w}
            </Text>
          ))}

          {results !== null && results.length === 0 ? (
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                marginTop: 14,
              }}
            >
              No papers found for that query.
            </Text>
          ) : null}

          {(results || []).map((paper) => (
            <PaperRow
              key={`${paper.source}-${paper.id}`}
              paper={paper}
              importing={importingId === paper.id}
              anyImporting={Boolean(importingId)}
              onImport={() => importPaper(paper)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PaperRow({ paper, importing, anyImporting, onImport }) {
  const palette = usePalette();
  const sourceTint = paper.source === "arxiv" ? palette.tertiary : palette.secondary;
  const meta = [
    paper.authors?.slice(0, 3).join(", ") +
      (paper.authors?.length > 3 ? " et al." : ""),
    paper.year,
    paper.venue,
    paper.citationCount != null ? `${paper.citationCount} citations` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 14,
        backgroundColor: palette.surfaceHigh,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          style={{
            color: sourceTint,
            fontFamily: "Inter_600SemiBold",
            fontSize: 10,
            letterSpacing: 1.2,
          }}
        >
          {paper.source.toUpperCase()}
        </Text>
      </View>
      <Text
        numberOfLines={2}
        style={{
          color: palette.onSurface,
          fontFamily: "SpaceGrotesk_600SemiBold",
          fontSize: 14,
          marginTop: 4,
        }}
      >
        {paper.title}
      </Text>
      {meta ? (
        <Text
          numberOfLines={2}
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            marginTop: 4,
          }}
        >
          {meta}
        </Text>
      ) : null}
      {paper.abstract ? (
        <Text
          numberOfLines={3}
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            lineHeight: 17,
            marginTop: 6,
          }}
        >
          {paper.abstract}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        {paper.pdfUrl ? (
          <Pressable
            onPress={onImport}
            disabled={anyImporting}
            accessibilityRole="button"
            accessibilityLabel={`Add ${paper.title} to library`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 10,
              backgroundColor: withAlpha(palette.accent, 0.16),
              borderWidth: 1,
              borderColor: withAlpha(palette.accent, 0.4),
              opacity: anyImporting && !importing ? 0.4 : 1,
            }}
          >
            {importing ? (
              <ActivityIndicator size="small" color={palette.accent} />
            ) : (
              <MaterialIcons name="library-add" size={16} color={palette.accent} />
            )}
            <Text
              style={{
                color: palette.accent,
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
              }}
            >
              {importing ? "Adding…" : "Add to library"}
            </Text>
          </Pressable>
        ) : (
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              alignSelf: "center",
            }}
          >
            No open-access PDF
          </Text>
        )}
        {paper.url ? (
          <Pressable
            onPress={() => Linking.openURL(paper.url)}
            accessibilityRole="button"
            accessibilityLabel="Open paper page"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 10,
              backgroundColor: palette.surfaceHighest,
            }}
          >
            <MaterialIcons
              name="open-in-new"
              size={15}
              color={palette.onSurfaceVariant}
            />
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
              }}
            >
              Open page
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
