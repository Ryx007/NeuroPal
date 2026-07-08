import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Toast from "../toast";

import { fetchRawDocumentApi, saveRawDocumentApi } from "../../services/network";
import { usePalette } from "../../theme/ThemeProvider";
import { withAlpha } from "../primitives";

// Full-screen editor for markdown/txt library documents — edits the on-disk
// source verbatim. Saving reingests, so the reader and RAG pick up the new
// text on their own (library ingest polling shows the progress).

export function MarkdownEditorModal({ document, onClose, onSaved }) {
  const palette = usePalette();
  const [text, setText] = useState(null); // null = loading
  const [initialText, setInitialText] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!document) return;
    setText(null);
    setError(null);
    setSaving(false);
    let stale = false;
    fetchRawDocumentApi(document.id)
      .then((data) => {
        if (stale) return;
        setText(data.text);
        setInitialText(data.text);
      })
      .catch((err) => {
        if (!stale) setError(err?.message || "Could not load the file.");
      });
    return () => {
      stale = true;
    };
  }, [document]);

  if (!document) return null;
  const dirty = text !== null && text !== initialText;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await saveRawDocumentApi(document.id, text);
      Toast.show({
        type: "success",
        text1: "Saved",
        text2: "Reprocessing the document with your edits.",
      });
      onSaved?.();
    } catch (err) {
      Toast.show({ type: "error", text1: "Save failed", text2: err?.message });
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: palette.surface }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingTop: Platform.OS === "web" ? 14 : 50,
            paddingBottom: 12,
            gap: 10,
            borderBottomWidth: 1,
            borderBottomColor: withAlpha(palette.outlineVariant, 0.2),
          }}
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close editor"
            style={{ padding: 8 }}
          >
            <MaterialIcons name="close" size={22} color={palette.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                color: palette.onSurface,
                fontFamily: "SpaceGrotesk_600SemiBold",
                fontSize: 16,
              }}
            >
              {document.title}
            </Text>
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 11,
              }}
            >
              Editing {document.type === "md" ? "Markdown" : "plain text"} source
            </Text>
          </View>
          <Pressable
            onPress={save}
            disabled={!dirty || saving}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: withAlpha(palette.accent, dirty ? 0.18 : 0.08),
              borderWidth: 1,
              borderColor: withAlpha(palette.accent, dirty ? 0.5 : 0.15),
              opacity: !dirty || saving ? 0.5 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={palette.accent} />
            ) : (
              <MaterialIcons name="save" size={16} color={palette.accent} />
            )}
            <Text
              style={{
                color: palette.accent,
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>

        {error ? (
          <View style={{ padding: 20 }}>
            <Text
              accessibilityRole="alert"
              style={{
                color: palette.error,
                fontFamily: "Inter_500Medium",
                fontSize: 14,
              }}
            >
              {error}
            </Text>
          </View>
        ) : text === null ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color={palette.accent} />
          </View>
        ) : (
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            editable={!saving}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Document source text"
            placeholder="# Start writing…"
            placeholderTextColor={palette.onSurfaceVariant}
            textAlignVertical="top"
            style={{
              flex: 1,
              padding: 18,
              color: palette.onSurface,
              fontFamily: "JetBrainsMono_400Regular",
              fontSize: 14,
              lineHeight: 22,
            }}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
