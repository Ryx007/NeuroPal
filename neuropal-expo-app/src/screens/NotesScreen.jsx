import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useEffect, useLayoutEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Pressable, ScrollView, Text, View } from "react-native";
import Toast from "../components/toast";

import { CanvasNoteEditor } from "../components/notes/CanvasNoteEditor";
import { usePalBubbleClearance } from "../components/pal/openPalSheet";
import {
  clearPendingOpenNote,
  createNoteRemote,
  migrateLocalNotes,
  removeNoteRemote,
} from "../store/slices/notesSlice";
import { usePalette } from "../theme/ThemeProvider";

// Notes — Issue 2: ONE canvas (Samsung Notes style). Every note opens in the
// unified editor: positioned text blocks (Markdown + inline $math$) and ink
// strokes on the same page. Legacy typed/ink notes open losslessly (typed →
// one full-width text block; ink → strokes) and upgrade to kind 'canvas' on
// first save. Everything syncs through the Mini.

export function NotesScreen() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const route = useRoute();
  const [openId, setOpenId] = useState(null);
  const notes = useSelector((s) => s.notes.items);

  // The Reader's "note here" hands the target over via redux (route params
  // don't reliably reach never-unmounting drawer screens) — consume + clear.
  const pendingOpenId = useSelector((s) => s.notes.pendingOpenId);
  useEffect(() => {
    if (pendingOpenId) {
      setOpenId(pendingOpenId);
      dispatch(clearPendingOpenNote());
    }
  }, [pendingOpenId, dispatch]);

  const openNote = notes.find((n) => n.id === openId);
  const editing = Boolean(openId && openNote);
  // While a note is open, Pal's bubble stays off the canvas and its toolbar
  // (PalBuddyHost reads route.params.editing, as it skips the Reader).
  // Checked against the live param, not just on change: a drawer tap on
  // "Notes" replaces the params while the editor stays open. A layout
  // effect, so the bubble never flashes over the editor first.
  const editingParam = Boolean(route.params?.editing);
  useLayoutEffect(() => {
    if (editingParam !== editing) navigation.setParams({ editing });
  }, [editing, editingParam, navigation]);

  if (editing) {
    return (
      <CanvasNoteEditor
        key={openNote.id}
        note={openNote}
        onBack={() => setOpenId(null)}
      />
    );
  }
  return <NotesList onOpen={setOpenId} />;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const KIND_ICONS = { typed: "notes", ink: "gesture", canvas: "draw" };

function noteSubtitle(note) {
  const when = new Date(note.updatedAt).toLocaleString();
  if (note.kind === "typed") {
    const head = (note.contentMarkdown || "").replace(/\s+/g, " ").trim().slice(0, 44);
    return `${head || "empty"} · ${when}`;
  }
  if (note.kind === "ink") return `${(note.strokes || []).length} strokes · ${when}`;
  const blocks = (note.blocks || []).length;
  const strokes = (note.strokes || []).length;
  return `${blocks} text ${blocks === 1 ? "box" : "boxes"} · ${strokes} strokes · ${when}`;
}

function NotesList({ onOpen }) {
  const palette = usePalette();
  const palClear = usePalBubbleClearance();
  const dispatch = useDispatch();
  const notes = useSelector((s) => s.notes.items);
  const notesError = useSelector((s) => s.notes.error);

  // fetch from the backend + migrate any pre-P6 local ink notes, once per open
  useEffect(() => {
    dispatch(migrateLocalNotes());
  }, [dispatch]);

  async function newNote() {
    try {
      const note = await dispatch(
        createNoteRemote({
          kind: "canvas",
          title: `Note ${notes.length + 1}`,
          blocks: [],
          strokes: [],
        })
      ).unwrap();
      onOpen(note.id);
    } catch (error) {
      Toast.show({ type: "error", text1: "Could not create note", text2: error?.message });
    }
  }

  async function remove(note) {
    try {
      await dispatch(removeNoteRemote({ id: note.id })).unwrap();
    } catch (error) {
      Toast.show({ type: "error", text1: "Delete failed", text2: error?.message });
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: Math.max(110, palClear) }}
      >
        <Text
          style={{
            color: palette.onSurface,
            fontFamily: palette.fonts.display,
            fontSize: 34,
            letterSpacing: -0.8,
          }}
        >
          Notes
        </Text>
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: palette.fonts.body,
            fontSize: 16,
            marginTop: 4,
          }}
        >
          Type it, ink it — same page.
        </Text>

        {notesError ? (
          <Text
            style={{
              marginTop: 12,
              color: palette.error,
              fontFamily: palette.fonts.bodyMedium,
              fontSize: 13,
            }}
          >
            {notesError}
          </Text>
        ) : null}

        <View style={{ marginTop: 20, gap: 12 }}>
          {notes.length === 0 ? (
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: palette.fonts.body,
                fontSize: 14,
              }}
            >
              No notes yet — start one below: type anywhere, draw anywhere,
              same canvas.
            </Text>
          ) : (
            notes.map((note) => (
              <Pressable
                key={note.id}
                onPress={() => onOpen(note.id)}
                style={{
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: palette.surfaceContainer,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <MaterialIcons
                  name={KIND_ICONS[note.kind] || "draw"}
                  size={22}
                  color={palette.accent}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={{
                      color: palette.onSurface,
                      fontFamily: palette.fonts.displaySemi,
                      fontSize: 16,
                    }}
                  >
                    {note.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: palette.onSurfaceVariant,
                      fontFamily: palette.fonts.mono,
                      fontSize: 11,
                      marginTop: 3,
                    }}
                  >
                    {noteSubtitle(note)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => remove(note)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${note.title}`}
                  style={{ padding: 8 }}
                >
                  <MaterialIcons name="delete-outline" size={20} color={palette.onSurfaceVariant} />
                </Pressable>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      {/* ONE entry point — the unified canvas */}
      <Pressable
        onPress={newNote}
        accessibilityRole="button"
        accessibilityLabel="New note"
        style={{
          position: "absolute",
          right: 20,
          bottom: 28,
          flexDirection: "row",
          alignItems: "center",
          minHeight: 50,
          paddingHorizontal: 18,
          borderRadius: 16,
          backgroundColor: palette.primary,
          elevation: 8,
        }}
      >
        <MaterialIcons name="add" size={20} color={palette.onPrimary} />
        <Text
          style={{
            marginLeft: 8,
            color: palette.onPrimary,
            fontFamily: palette.fonts.bodySemi,
            fontSize: 14,
          }}
        >
          New note
        </Text>
      </Pressable>
    </View>
  );
}
