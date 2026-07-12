import { MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Toast from "../components/toast";

import {
  deleteDocument,
  describeNetworkError,
  reingestDocumentApi,
  renameDocument,
  uploadDocument,
  USE_MOCK,
} from "../services/network";
import { apiConfigured } from "../store/ApiLink";
import { MarkdownEditorModal } from "../components/library/MarkdownEditorModal";
import { PaperSearch } from "../components/library/PaperSearch";
import { useApiRequest } from "../store/ApiRequest";
import { selectDocuments } from "../store/selectors";
import {
  addDocument,
  hydrateLibrary,
} from "../store/slices/librarySlice";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "../components/primitives";

// Backend → UI normalisation. Mongo gives us `_id` + ingest status; the
// card renderer below reads `id`, `progress`, `subtitle`. One shared mapper
// keeps the rest of the file unaware of the wire shape.
const PROCESSING_STATUSES = ["pending", "parsing", "chunking", "embedding"];

function normaliseDoc(d) {
  if (!d) return d;
  const status = d.status;
  const processing = PROCESSING_STATUSES.includes(status);
  const rawProgress = typeof d.progress === "number" ? d.progress : 0;
  // P4: GET /documents now joins ReadingSession — readingProgress (0..1) and
  // lastReadAt are REAL reading state, distinct from d.progress (ingest %).
  const readingProgress =
    typeof d.readingProgress === "number" ? d.readingProgress : 0;
  return {
    ...d,
    id: d.id || d._id,
    type: d.type || "pdf",
    readingProgress: status ? readingProgress : rawProgress,
    lastReadAt: d.lastReadAt || null,
    // Bar shows ingest % while processing, then real reading progress.
    // Mock docs (no status field) keep their sample reading progress.
    progress: status ? (processing ? rawProgress : readingProgress) : rawProgress,
    progressLabel: status
      ? processing
        ? `Ingesting ${Math.round(rawProgress * 100)}%`
        : status === "failed"
          ? "Ingest failed"
          : readingProgress > 0
            ? `${Math.round(readingProgress * 100)}% read`
            : "Ready"
      : null,
    subtitle:
      d.subtitle ||
      (processing
        ? "Processing…"
        : status === "failed"
          ? `Ingest failed${d.ingestError ? `: ${d.ingestError}` : ""}`
          : ""),
  };
}

// Semantic filter chips (P4). `match` runs per doc; mock docs have no status
// field, so predicates lean on the normalised readingProgress fallback.
const FILTERS = [
  { key: "all", label: "All", match: () => true },
  {
    key: "inprogress",
    label: "In progress",
    match: (d) => d.readingProgress > 0 && d.readingProgress < 1,
  },
  { key: "unread", label: "Unread", match: (d) => !d.readingProgress },
  { key: "pdf", label: "PDF", match: (d) => d.type === "pdf" },
  { key: "epub", label: "EPUB", match: (d) => d.type === "epub" },
  { key: "arxiv", label: "arXiv", match: (d) => d.type === "arxiv" },
  {
    key: "other",
    label: "Other",
    match: (d) => !["pdf", "epub", "arxiv"].includes(d.type),
  },
];

export function LibraryScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { fetchData } = useApiRequest();
  const documents = useSelector(selectDocuments);
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Filtering is render-derived on purpose: hydrateLibrary wholesale-replaces
  // the slice every 2.5s while anything is ingesting, so any filtered list
  // written into redux would be clobbered on the next poll tick.
  const visibleDocs = useMemo(() => {
    const f = FILTERS.find((x) => x.key === activeFilter) || FILTERS[0];
    const needle = search.trim().toLowerCase();
    let list = documents.filter(
      (d) =>
        f.match(d) &&
        (!needle ||
          `${d.title || ""} ${d.subtitle || ""}`.toLowerCase().includes(needle))
    );
    if (activeFilter === "inprogress") {
      // recently-read first — the whole point of the chip
      list = [...list].sort(
        (a, b) => new Date(b.lastReadAt || 0) - new Date(a.lastReadAt || 0)
      );
    }
    return list;
  }, [documents, activeFilter, search]);
  const [actionDoc, setActionDoc] = useState(null); // long-pressed card → rename/delete sheet
  const [editingDoc, setEditingDoc] = useState(null); // md/txt source editor
  const [connectionError, setConnectionError] = useState(
    !apiConfigured && !USE_MOCK
      ? "No backend configured — set EXPO_PUBLIC_API_BASE_URL in .env and restart expo start."
      : null
  );
  const { width } = useWindowDimensions();
  const cols = width > 900 ? 3 : width > 600 ? 2 : 1;

  // Initial fetch + a refresh hook for after upload. Silent (no toast) but
  // NOT invisible — failures land in the banner below instead. The in-flight
  // guard keeps the 2.5s ingest poll from stacking requests on a slow or
  // unreachable backend.
  const refreshInFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (USE_MOCK || !apiConfigured || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const data = await fetchData("documents", { silent: true, rethrow: true });
      if (Array.isArray(data)) {
        dispatch(hydrateLibrary({ docs: data.map(normaliseDoc) }));
        setConnectionError(null);
      }
    } catch (error) {
      setConnectionError(describeNetworkError(error));
    } finally {
      refreshInFlight.current = false;
    }
  }, [fetchData, dispatch]);

  // Refresh every time the tab gains focus (fires on first mount too).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // While any document is still ingesting, poll so status/progress walk to
  // `ready` on their own — no manual refresh.
  const hasProcessing = documents.some((d) =>
    PROCESSING_STATUSES.includes(d.status)
  );
  useEffect(() => {
    if (!hasProcessing) return undefined;
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [hasProcessing, refresh]);

  async function pickDocument() {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/epub+zip",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "text/plain",
          "text/markdown",
          "image/vnd.djvu",
          "image/x-djvu",
          // .md and .djvu often report as octet-stream on Android providers;
          // without this they'd be greyed out in the picker. The backend
          // routes by file extension, so this is safe.
          "application/octet-stream",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch (error) {
      // Some Android storage providers throw instead of returning a
      // cancel — surface it instead of dying with an unhandled rejection.
      Toast.show({
        type: "error",
        text1: "File picker failed",
        text2: error?.message || "Unknown picker error",
      });
      return;
    }

    if (result.canceled) {
      return;
    }

    let created;
    try {
      created = await uploadDocument(result.assets[0]);
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Upload failed",
        text2: error?.message || "Unknown error",
      });
      return;
    }

    dispatch(addDocument(normaliseDoc(created)));
    // an active filter/search could hide the doc that was just added —
    // reset so the upload is always visibly IN the grid
    setActiveFilter("all");
    setSearch("");
    Toast.show({
      type: "success",
      text1: "Upload received",
      text2: "Indexing in the background — status updates automatically.",
    });
  }

  return (
    <View className="flex-1" style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 40,
        }}
      >
        <Text
          style={{
            color: palette.onSurface,
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: 34,
            letterSpacing: -0.8,
          }}
        >
          Document Library
        </Text>
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 16,
            marginTop: 4,
          }}
        >
          Continue your cognitive journey where you left off.
        </Text>

        {USE_MOCK ? (
          <Text
            accessibilityRole="alert"
            style={{
              color: palette.warn,
              fontFamily: "Inter_500Medium",
              fontSize: 12,
              marginTop: 10,
            }}
          >
            Mock mode — showing bundled sample data, not your backend.
          </Text>
        ) : null}

        {connectionError ? (
          <View
            accessibilityRole="alert"
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 14,
              backgroundColor: withAlpha(palette.error, 0.12),
              borderWidth: 1,
              borderColor: withAlpha(palette.error, 0.4),
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <MaterialIcons name="cloud-off" size={20} color={palette.error} />
            <Text
              style={{
                flex: 1,
                color: palette.error,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              {connectionError}
            </Text>
            {apiConfigured ? (
              <Pressable
                onPress={refresh}
                accessibilityRole="button"
                accessibilityLabel="Retry connecting to the backend"
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: withAlpha(palette.error, 0.16),
                }}
              >
                <Text
                  style={{
                    color: palette.error,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 13,
                  }}
                >
                  Retry
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!USE_MOCK && apiConfigured ? (
          <PaperSearch onImported={refresh} />
        ) : null}

        <ScrollView
          horizontal
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ gap: 8 }}
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 20 }}
        >
          {FILTERS.map((filter) => {
            const selected = filter.key === activeFilter;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setActiveFilter(filter.key)}
                accessibilityRole="button"
                accessibilityLabel={`Filter: ${filter.label}`}
                accessibilityState={{ selected }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 99,
                  backgroundColor: selected
                    ? withAlpha(palette.accent, 0.14)
                    : palette.surfaceContainer,
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
                    fontSize: 13,
                  }}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* local title search — narrows the grid; PaperSearch above is the
            REMOTE arXiv/Scholar import and stays untouched */}
        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 14,
            backgroundColor: palette.surfaceContainer,
            paddingHorizontal: 12,
          }}
        >
          <MaterialIcons
            name="search"
            size={18}
            color={palette.onSurfaceVariant}
          />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search your library"
            placeholderTextColor={palette.onSurfaceVariant}
            accessibilityLabel="Search your library by title"
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 8,
              color: palette.onSurface,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
            }}
          />
          {search ? (
            <Pressable
              onPress={() => setSearch("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={10}
            >
              <MaterialIcons
                name="close"
                size={18}
                color={palette.onSurfaceVariant}
              />
            </Pressable>
          ) : null}
        </View>

        <View
          style={{
            marginTop: 22,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          {visibleDocs.map((document) => (
            <View
              key={document.id}
              style={{
                width:
                  cols === 1 ? "100%" : (width - 40 - 16 * (cols - 1)) / cols,
              }}
            >
              <DocCard
                document={document}
                onPress={() => navigation.navigate("Reader", { id: document.id })}
                onLongPress={() => setActionDoc(document)}
                onRetry={async () => {
                  try {
                    await reingestDocumentApi(document.id);
                    Toast.show({ type: "info", text1: "Reingest started", text2: document.title });
                    refresh();
                  } catch (error) {
                    Toast.show({ type: "error", text1: "Reingest failed", text2: error?.message });
                  }
                }}
              />
            </View>
          ))}
          {documents.length > 0 && visibleDocs.length === 0 ? (
            <View
              style={{
                width: "100%",
                alignItems: "center",
                paddingVertical: 36,
                gap: 12,
              }}
            >
              <MaterialIcons
                name="filter-list-off"
                size={28}
                color={palette.onSurfaceVariant}
              />
              <Text
                style={{
                  color: palette.onSurfaceVariant,
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                  textAlign: "center",
                }}
              >
                Nothing matches{search.trim() ? ` “${search.trim()}”` : ""} in{" "}
                {FILTERS.find((f) => f.key === activeFilter)?.label ?? "this filter"}.
              </Text>
              <Pressable
                onPress={() => {
                  setActiveFilter("all");
                  setSearch("");
                }}
                accessibilityRole="button"
                accessibilityLabel="Clear filters"
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  borderRadius: 14,
                  backgroundColor: withAlpha(palette.accent, 0.14),
                  borderWidth: 1,
                  borderColor: withAlpha(palette.accent, 0.4),
                }}
              >
                <Text
                  style={{
                    color: palette.accent,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 13,
                  }}
                >
                  Clear filters
                </Text>
              </Pressable>
            </View>
          ) : null}
          <View
            style={{
              width:
                cols === 1 ? "100%" : (width - 40 - 16 * (cols - 1)) / cols,
            }}
          >
            <UploadCard onPress={pickDocument} />
          </View>
        </View>
      </ScrollView>

      <DocActionsSheet
        document={actionDoc}
        onClose={() => setActionDoc(null)}
        onChanged={() => {
          setActionDoc(null);
          refresh();
        }}
        onEdit={(doc) => {
          setActionDoc(null);
          setEditingDoc(doc);
        }}
      />

      {editingDoc ? (
        <MarkdownEditorModal
          document={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSaved={() => {
            setEditingDoc(null);
            refresh();
          }}
        />
      ) : null}

      <Pressable
        onPress={pickDocument}
        accessibilityLabel="Upload a document"
        style={{
          position: "absolute",
          right: 20,
          bottom: 28,
          width: 60,
          height: 60,
          borderRadius: 18,
          backgroundColor: palette.primary,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: palette.accent,
          shadowOpacity: 0.4,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        <MaterialIcons name="add" size={30} color={palette.onPrimary} />
      </Pressable>
    </View>
  );
}

// Long-press sheet: rename, delete, or (md/txt) edit a library document.
function DocActionsSheet({ document, onClose, onChanged, onEdit }) {
  const palette = usePalette();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setTitle(document?.title || "");
    setConfirmingDelete(false);
    setBusy(false);
  }, [document]);

  if (!document) return null;

  async function saveRename() {
    const next = title.trim();
    if (!next || next === document.title || busy) return;
    setBusy(true);
    try {
      await renameDocument(document.id, next);
      Toast.show({ type: "success", text1: "Renamed", text2: next });
      onChanged();
    } catch (error) {
      Toast.show({ type: "error", text1: "Rename failed", text2: error?.message });
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (busy) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setBusy(true);
    try {
      await deleteDocument(document.id);
      Toast.show({ type: "success", text1: "Deleted", text2: document.title });
      onChanged();
    } catch (error) {
      Toast.show({ type: "error", text1: "Delete failed", text2: error?.message });
      setBusy(false);
    }
  }

  // Issue 3a — rerun this doc through the CURRENT extractor stack; forceMath
  // additionally bypasses the math-density probe (for textbooks whose text
  // layer drops the equations — slow: Nougat runs ~1–3s per page).
  async function runReingest(forceMath) {
    if (busy) return;
    setBusy(true);
    try {
      await reingestDocumentApi(document.id, forceMath);
      Toast.show({
        type: "info",
        text1: forceMath ? "Nougat reingest started" : "Reingest started",
        text2: forceMath
          ? "Math-aware but slow (~1–3s/page) — the card shows live progress."
          : "The card shows live progress.",
      });
      onChanged();
    } catch (error) {
      Toast.show({ type: "error", text1: "Reingest failed", text2: error?.message });
      setBusy(false);
    }
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: withAlpha("#000000", 0.6),
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 420,
            borderRadius: 20,
            backgroundColor: palette.surfaceContainer,
            padding: 20,
          }}
        >
          <Text
            numberOfLines={2}
            style={{
              color: palette.onSurface,
              fontFamily: "SpaceGrotesk_600SemiBold",
              fontSize: 17,
            }}
          >
            {document.title}
          </Text>

          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              letterSpacing: 1.2,
              marginTop: 16,
            }}
          >
            RENAME
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            editable={!busy}
            placeholder="Document title"
            placeholderTextColor={palette.onSurfaceVariant}
            style={{
              marginTop: 8,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: palette.surfaceHigh,
              color: palette.onSurface,
              fontFamily: "Inter_400Regular",
              fontSize: 15,
            }}
          />

          {/* Issue 3a — maintenance reingest, per doc. The chip on the card
              shows which extractor produced the current text. */}
          {!USE_MOCK ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => runReingest(false)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Reingest with the current extractor"
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: withAlpha(palette.accent, 0.12),
                  borderWidth: 1,
                  borderColor: withAlpha(palette.accent, 0.4),
                  opacity: busy ? 0.4 : 1,
                }}
              >
                <MaterialIcons name="refresh" size={16} color={palette.accent} />
                <Text style={{ color: palette.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                  Reingest
                </Text>
              </Pressable>
              {document.type === "pdf" ? (
                <Pressable
                  onPress={() => runReingest(true)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Reingest with the Nougat math extractor"
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                    backgroundColor: withAlpha(palette.tertiary, 0.12),
                    borderWidth: 1,
                    borderColor: withAlpha(palette.tertiary, 0.4),
                    opacity: busy ? 0.4 : 1,
                  }}
                >
                  <MaterialIcons name="functions" size={16} color={palette.tertiary} />
                  <Text style={{ color: palette.tertiary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                    Reingest (math)
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {(document.type === "md" || document.type === "txt") && !USE_MOCK ? (
            <Pressable
              onPress={() => onEdit?.(document)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Edit document content"
              style={{
                marginTop: 14,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                backgroundColor: withAlpha(palette.tertiary, 0.14),
                borderWidth: 1,
                borderColor: withAlpha(palette.tertiary, 0.4),
                opacity: busy ? 0.4 : 1,
              }}
            >
              <MaterialIcons name="edit-note" size={18} color={palette.tertiary} />
              <Text style={{ color: palette.tertiary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                Edit content
              </Text>
            </Pressable>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Pressable
              onPress={saveRename}
              disabled={busy || !title.trim() || title.trim() === document.title}
              accessibilityRole="button"
              accessibilityLabel="Save new title"
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                backgroundColor: withAlpha(palette.accent, 0.16),
                borderWidth: 1,
                borderColor: withAlpha(palette.accent, 0.45),
                opacity: busy || !title.trim() || title.trim() === document.title ? 0.4 : 1,
              }}
            >
              <Text style={{ color: palette.accent, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                Save name
              </Text>
            </Pressable>
            <Pressable
              onPress={confirmDelete}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={confirmingDelete ? "Confirm delete" : "Delete document"}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                backgroundColor: withAlpha(palette.error, confirmingDelete ? 0.3 : 0.12),
                borderWidth: 1,
                borderColor: withAlpha(palette.error, 0.45),
                opacity: busy ? 0.4 : 1,
              }}
            >
              <Text style={{ color: palette.error, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                {confirmingDelete ? "Tap again to delete" : "Delete"}
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={{ marginTop: 14, alignItems: "center", paddingVertical: 8 }}
          >
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DocCard({ document, onPress, onLongPress, onRetry }) {
  const palette = usePalette();
  const failed = document.status === "failed";
  const typeTint =
    {
      pdf: palette.primary,
      djvu: palette.primary,
      epub: palette.secondary,
      arxiv: palette.secondary,
      docx: palette.tertiary,
      pptx: palette.tertiary,
      md: palette.tertiary,
    }[document.type] || palette.onSurfaceVariant;

  const icon =
    {
      pdf: "picture-as-pdf",
      epub: "menu-book",
      docx: "description",
      pptx: "co-present",
      md: "edit-note",
      txt: "text-snippet",
      djvu: "auto-stories",
      arxiv: "science",
    }[document.type] || "description";

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityHint="Long-press to rename or delete"
      style={{
        padding: 16,
        borderRadius: 22,
        backgroundColor: palette.surfaceContainer,
        minHeight: 200,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View
          style={{
            padding: 10,
            borderRadius: 12,
            backgroundColor: withAlpha(typeTint, 0.12),
          }}
        >
          <MaterialIcons name={icon} size={22} color={typeTint} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row", gap: 6 }}>
          {/* Issue 3a: which extraction pipeline produced this text —
              'legacy' = pre-Nougat ingest, judge equations accordingly */}
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor:
                document.extractor === "nougat" || document.extractor === "arxiv-latex"
                  ? withAlpha(palette.accent, 0.14)
                  : palette.surfaceHighest,
            }}
          >
            <Text
              style={{
                color:
                  document.extractor === "nougat" || document.extractor === "arxiv-latex"
                    ? palette.accent
                    : palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 10,
                letterSpacing: 1.4,
              }}
            >
              {(document.extractor || "legacy").toUpperCase()}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: palette.surfaceHighest,
            }}
          >
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 10,
                letterSpacing: 1.4,
              }}
            >
              {document.type.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ height: 14 }} />
      <Text
        numberOfLines={2}
        style={{
          color: palette.onSurface,
          fontFamily: "SpaceGrotesk_600SemiBold",
          fontSize: 16,
        }}
      >
        {document.title}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_400Regular",
          fontSize: 12,
          marginTop: 4,
        }}
      >
        {document.subtitle}
      </Text>
      <View style={{ flex: 1, minHeight: 8 }} />
      <View style={{ flexDirection: "row", marginTop: 12 }}>
        <Text
          style={{
            flex: 1,
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_500Medium",
            fontSize: 11,
          }}
        >
          {document.progressLabel ||
            `${Math.round(document.progress * 100)}% completed`}
        </Text>
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "JetBrainsMono_400Regular",
            fontSize: 11,
          }}
        >
          {document.pageCount > 0 ? `${document.pageCount} pp` : "—"}
        </Text>
      </View>
      <View
        style={{
          height: 4,
          marginTop: 8,
          borderRadius: 2,
          backgroundColor: palette.surfaceHigh,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.round(document.progress * 100)}%`,
            height: "100%",
            backgroundColor: typeTint,
          }}
        />
      </View>
      {/* Issue 1: a failed doc is not readable — the ONLY honest action is
          retrying the ingest (the card subtitle carries the real error). */}
      <Pressable
        onPress={failed ? onRetry : onPress}
        accessibilityRole="button"
        accessibilityLabel={failed ? `Retry ingest of ${document.title}` : `Read ${document.title}`}
        style={{
          marginTop: 14,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: failed
            ? withAlpha(palette.error, 0.12)
            : palette.surfaceHighest,
          borderWidth: failed ? 1 : 0,
          borderColor: failed ? withAlpha(palette.error, 0.4) : "transparent",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
        }}
      >
        <Text
          style={{
            color: failed ? palette.error : typeTint,
            fontFamily: "Inter_600SemiBold",
            fontSize: 14,
          }}
        >
          {failed ? "Retry ingest" : "Continue Reading"}
        </Text>
        <View style={{ width: 6 }} />
        <MaterialIcons
          name={failed ? "refresh" : "arrow-forward"}
          size={16}
          color={failed ? palette.error : typeTint}
        />
      </Pressable>
    </Pressable>
  );
}

function UploadCard({ onPress }) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add new resource"
      style={{
        minHeight: 200,
        borderRadius: 22,
        borderWidth: 1.4,
        borderStyle: "dashed",
        borderColor: withAlpha(palette.outlineVariant, 0.35),
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: palette.surfaceHigh,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name="add" size={28} color={palette.onSurfaceVariant} />
      </View>
      <View style={{ height: 12 }} />
      <Text
        style={{
          color: palette.onSurface,
          fontFamily: "Inter_600SemiBold",
          fontSize: 14,
        }}
      >
        Add New Resource
      </Text>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_400Regular",
          fontSize: 12,
          textAlign: "center",
          marginTop: 6,
          maxWidth: 200,
        }}
      >
        Tap the button below or drag a file here to expand your library.
      </Text>
    </Pressable>
  );
}

function typeFromExt(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "epub") return "epub";
  if (ext === "docx") return "docx";
  if (ext === "txt") return "txt";
  return "pdf";
}
