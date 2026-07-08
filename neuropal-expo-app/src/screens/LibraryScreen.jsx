import { MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

import { describeNetworkError, USE_MOCK } from "../services/network";
import { apiConfigured } from "../store/ApiLink";
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
  return {
    ...d,
    id: d.id || d._id,
    type: d.type || "pdf",
    // Backend docs carry INGEST progress in d.progress — showing it as
    // reading progress after `ready` would be a lie ("100% completed" on a
    // never-opened book). Bar shows ingest % while processing, then resets
    // until real ReadingSession reading-progress is wired in. Mock docs
    // (no status field) keep their sample reading progress.
    progress: status ? (processing ? rawProgress : 0) : rawProgress,
    progressLabel: status
      ? processing
        ? `Ingesting ${Math.round(rawProgress * 100)}%`
        : status === "failed"
          ? "Ingest failed"
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

export function LibraryScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { fetchData, uploadData } = useApiRequest();
  const documents = useSelector(selectDocuments);
  const [activeFilter, setActiveFilter] = useState(0);
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
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/epub+zip",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];

    const formData = new FormData();
    if (Platform.OS === "web") {
      // On web the picker returns a real File — the RN-style {uri,name,type}
      // object would serialize as "[object Object]" and 400 the upload.
      const file =
        asset.file || (await (await fetch(asset.uri)).blob());
      formData.append("file", file, asset.name || "upload");
    } else {
      // RN multipart file value — { uri, name, type }, not a real File.
      // axios will compute the multipart boundary itself; don't set
      // Content-Type manually.
      formData.append("file", {
        uri: asset.uri,
        name: asset.name || "upload",
        type: asset.mimeType || "application/octet-stream",
      });
    }
    if (asset.name) {
      formData.append("title", asset.name.replace(/\.[^.]+$/, ""));
    }

    const created = await uploadData("documents/upload", formData);
    if (!created) return; // ApiRequest already toasted

    dispatch(addDocument(normaliseDoc(created)));
    Toast.show({
      type: "success",
      text1: "Upload received",
      text2: "Indexing in the background — refresh for status.",
    });
  }

  return (
    <View className="flex-1" style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 160,
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

        <ScrollView
          horizontal
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ gap: 8 }}
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 20 }}
        >
          {["All", "In progress", "Unread", "PDF", "EPUB", "arXiv"].map(
            (filter, index) => {
              const selected = index === activeFilter;
              return (
                <Pressable
                  key={filter}
                  onPress={() => setActiveFilter(index)}
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
                    {filter}
                  </Text>
                </Pressable>
              );
            }
          )}
        </ScrollView>

        <View
          style={{
            marginTop: 22,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          {documents.map((document) => (
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
              />
            </View>
          ))}
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

      <Pressable
        onPress={pickDocument}
        accessibilityLabel="Upload a document"
        style={{
          position: "absolute",
          right: 20,
          bottom: 110,
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

function DocCard({ document, onPress }) {
  const palette = usePalette();
  const typeTint =
    document.type === "pdf"
      ? palette.primary
      : document.type === "epub"
        ? palette.secondary
        : document.type === "docx"
          ? palette.tertiary
          : palette.onSurfaceVariant;

  const icon =
    document.type === "pdf"
      ? "picture-as-pdf"
      : document.type === "epub"
        ? "menu-book"
        : document.type === "docx"
          ? "description"
          : document.type === "txt"
            ? "text-snippet"
            : "science";

  return (
    <Pressable
      onPress={onPress}
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
      <Pressable
        onPress={onPress}
        style={{
          marginTop: 14,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: palette.surfaceHighest,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
        }}
      >
        <Text
          style={{
            color: typeTint,
            fontFamily: "Inter_600SemiBold",
            fontSize: 14,
          }}
        >
          Continue Reading
        </Text>
        <View style={{ width: 6 }} />
        <MaterialIcons name="arrow-forward" size={16} color={typeTint} />
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
