import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import Toast from "../components/toast";

import { ColorPickerSheet } from "../components/notes/ColorPickerSheet";
import { TypedNoteEditor } from "../components/notes/TypedNoteEditor";
import {
  buildNoteSvg,
  exportNoteImage,
  exportNotePdf,
  exportNoteSvg,
  strokeToPath,
} from "../utils/noteExport";
import {
  clearPendingOpenNote,
  createNoteRemote,
  loadNotes,
  migrateLocalNotes,
  removeNoteRemote,
  saveNote,
  updateNoteRemote,
} from "../store/slices/notesSlice";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "../components/primitives";

// Notes — TWO kinds through one synced backend model (P6):
//   ink   — S-pen/stylus/finger strokes on an SVG canvas (PDF/PNG/SVG export)
//   typed — Markdown with inline $…$ / $$…$$ math, live preview,
//           .md/.txt export
// Both sync via the Mini; pre-P6 local ink notes are migrated up on first
// open.

export function NotesScreen() {
  const dispatch = useDispatch();
  const [openId, setOpenId] = useState(null);
  const notes = useSelector((s) => s.notes.items);

  // The Reader's "Typed note here" hands the target over via redux (route
  // params don't reliably reach never-unmounting drawer screens) — consume
  // and clear it.
  const pendingOpenId = useSelector((s) => s.notes.pendingOpenId);
  useEffect(() => {
    if (pendingOpenId) {
      setOpenId(pendingOpenId);
      dispatch(clearPendingOpenNote());
    }
  }, [pendingOpenId, dispatch]);

  const openNote = notes.find((n) => n.id === openId);
  if (openId && openNote) {
    return openNote.kind === "typed" ? (
      <TypedNoteEditor note={openNote} onBack={() => setOpenId(null)} />
    ) : (
      <NoteEditor noteId={openId} onBack={() => setOpenId(null)} />
    );
  }
  return <NotesList onOpen={setOpenId} />;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function NotesList({ onOpen }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const notes = useSelector((s) => s.notes.items);
  const notesError = useSelector((s) => s.notes.error);

  // fetch from the backend + migrate any pre-P6 local ink notes, once per open
  useEffect(() => {
    dispatch(migrateLocalNotes());
  }, [dispatch]);

  async function newNote(kind) {
    try {
      const note = await dispatch(
        createNoteRemote({
          kind,
          title: `Note ${notes.length + 1}`,
          ...(kind === "typed" ? { contentMarkdown: "" } : { strokes: [] }),
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 110 }}
      >
        <Text
          style={{
            color: palette.onSurface,
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: 34,
            letterSpacing: -0.8,
          }}
        >
          Notes
        </Text>
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 16,
            marginTop: 4,
          }}
        >
          Ink first, organize never.
        </Text>

        {notesError ? (
          <Text
            style={{
              marginTop: 12,
              color: palette.error,
              fontFamily: "Inter_500Medium",
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
                fontFamily: "Inter_400Regular",
                fontSize: 14,
              }}
            >
              No notes yet — start a typed note or an S-Pen sketch below.
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
                  name={note.kind === "typed" ? "notes" : "gesture"}
                  size={22}
                  color={palette.accent}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={{
                      color: palette.onSurface,
                      fontFamily: "SpaceGrotesk_600SemiBold",
                      fontSize: 16,
                    }}
                  >
                    {note.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: palette.onSurfaceVariant,
                      fontFamily: "JetBrainsMono_400Regular",
                      fontSize: 11,
                      marginTop: 3,
                    }}
                  >
                    {note.kind === "typed"
                      ? `${(note.contentMarkdown || "").replace(/\s+/g, " ").trim().slice(0, 44) || "empty"} · ${new Date(note.updatedAt).toLocaleString()}`
                      : `${(note.strokes || []).length} strokes · ${new Date(note.updatedAt).toLocaleString()}`}
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

      {/* two entry points, both labelled (P6): typed + ink */}
      <View style={{ position: "absolute", right: 20, bottom: 28, gap: 10, alignItems: "flex-end" }}>
        {[
          ["typed", "keyboard", "New typed note"],
          ["ink", "gesture", "New handwritten note"],
        ].map(([kind, icon, label]) => (
          <Pressable
            key={kind}
            onPress={() => newNote(kind)}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              minHeight: 48,
              paddingHorizontal: 16,
              borderRadius: 16,
              backgroundColor: kind === "typed" ? palette.primary : palette.surfaceHighest,
              elevation: 8,
            }}
          >
            <MaterialIcons
              name={icon}
              size={20}
              color={kind === "typed" ? palette.onPrimary : palette.accent}
            />
            <Text
              style={{
                marginLeft: 8,
                color: kind === "typed" ? palette.onPrimary : palette.onSurface,
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
              }}
            >
              {kind === "typed" ? "Typed" : "Ink"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const WIDTHS = [2, 4, 8];

function NoteEditor({ noteId, onBack }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const note = useSelector((s) => s.notes.items.find((n) => n.id === noteId));
  const { height } = useWindowDimensions();

  const [strokes, setStrokes] = useState(note?.strokes || []);
  const [live, setLive] = useState(null); // in-progress stroke points
  const [tool, setTool] = useState("pen"); // 'pen' | 'eraser'
  const [colorKey, setColorKey] = useState("ink");
  const [customColor, setCustomColor] = useState("#4FC3F7");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [width, setWidth] = useState(4);
  const [title, setTitle] = useState(note?.title || "");
  const liveRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasSize = useRef({ w: 800, h: 600 });

  const COLORS = useMemo(
    () => ({
      ink: palette.onSurface,
      accent: palette.accent,
      gold: palette.tertiary,
      custom: customColor,
    }),
    [palette, customColor]
  );

  const persist = useCallback(
    (nextStrokes) => {
      dispatch(saveNote({ id: noteId, strokes: nextStrokes, title }));
    },
    [dispatch, noteId, title]
  );

  // Local dispatches keep drawing responsive; the SERVER gets one write when
  // the note is left (P6 sync). Un-migrated legacy notes (no _id) stay local
  // until migrateLocalNotes pushes them.
  const syncRemote = useCallback(
    (nextStrokes, nextTitle) => {
      if (!note?._id) return;
      dispatch(
        updateNoteRemote({ id: note._id, strokes: nextStrokes, title: nextTitle })
      )
        .unwrap()
        .catch((error) =>
          Toast.show({ type: "error", text1: "Note sync failed", text2: error?.message })
        );
    },
    [dispatch, note?._id]
  );

  function eraseAt(x, y) {
    setStrokes((prev) => {
      const hit = prev.findIndex((s) =>
        s.points.some(([px, py]) => Math.abs(px - x) < 18 && Math.abs(py - y) < 18)
      );
      if (hit < 0) return prev;
      const next = prev.filter((_, i) => i !== hit);
      persist(next);
      return next;
    });
  }

  const touchHandlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      if (tool === "eraser") {
        eraseAt(locationX, locationY);
        return;
      }
      liveRef.current = [[Math.round(locationX), Math.round(locationY)]];
      setLive({ points: liveRef.current, color: COLORS[colorKey], width });
    },
    onResponderMove: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      if (tool === "eraser") {
        eraseAt(locationX, locationY);
        return;
      }
      if (!liveRef.current) return;
      liveRef.current = [...liveRef.current, [Math.round(locationX), Math.round(locationY)]];
      setLive({ points: liveRef.current, color: COLORS[colorKey], width });
    },
    onResponderRelease: () => {
      if (tool === "eraser" || !liveRef.current) return;
      const finished = { points: liveRef.current, color: COLORS[colorKey], width };
      liveRef.current = null;
      setLive(null);
      setStrokes((prev) => {
        const next = [...prev, finished];
        persist(next);
        return next;
      });
    },
  };

  function undo() {
    setStrokes((prev) => {
      const next = prev.slice(0, -1);
      persist(next);
      return next;
    });
  }

  function clearAll() {
    setStrokes(() => {
      persist([]);
      return [];
    });
  }

  async function runExport(kind) {
    setExportOpen(false);
    const { w, h } = canvasSize.current;
    const svg = buildNoteSvg({
      strokes,
      width: w,
      height: h,
      background: palette.surfaceLowest,
    });
    try {
      if (kind === "pdf") {
        await exportNotePdf({ svg, title });
      } else if (kind === "png") {
        await exportNoteImage({ svg, width: w, height: h, title, viewShotRef: canvasRef });
      } else {
        await exportNoteSvg({ svg, title });
      }
      Toast.show({ type: "success", text1: "Note exported" });
    } catch (error) {
      // user backing out of the share sheet is not an error
      if (!/cancell?ed|dismissed/i.test(error?.message || "")) {
        Toast.show({ type: "error", text1: "Export failed", text2: error?.message });
      }
    }
  }

  if (!note) {
    onBack();
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
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
            persist(strokes);
            syncRemote(strokes, title);
            onBack();
          }}
          accessibilityLabel="Back to notes"
          style={{ padding: 8 }}
        >
          <MaterialIcons name="arrow-back" size={20} color={palette.accent} />
        </Pressable>
        <TextInput
          value={title}
          onChangeText={setTitle}
          onEndEditing={() => dispatch(saveNote({ id: noteId, title }))}
          onBlur={() => dispatch(saveNote({ id: noteId, title }))}
          placeholder="Note title"
          placeholderTextColor={palette.onSurfaceVariant}
          style={{
            flex: 1,
            color: palette.onSurface,
            fontFamily: "SpaceGrotesk_600SemiBold",
            fontSize: 17,
            paddingVertical: 6,
          }}
        />
        <Pressable
          onPress={() => setExportOpen(true)}
          accessibilityLabel="Export note"
          style={{ padding: 8 }}
        >
          <MaterialIcons name="ios-share" size={20} color={palette.onSurfaceVariant} />
        </Pressable>
        <Pressable onPress={undo} accessibilityLabel="Undo last stroke" style={{ padding: 8 }}>
          <MaterialIcons name="undo" size={20} color={palette.onSurfaceVariant} />
        </Pressable>
        <Pressable onPress={clearAll} accessibilityLabel="Clear page" style={{ padding: 8 }}>
          <MaterialIcons name="layers-clear" size={20} color={palette.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* canvas */}
      <View
        ref={canvasRef}
        collapsable={false}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          canvasSize.current = { w: Math.round(w), h: Math.round(h) };
        }}
        {...touchHandlers}
        style={{
          flex: 1,
          margin: 12,
          marginBottom: 6,
          borderRadius: 16,
          backgroundColor: palette.surfaceLowest,
          overflow: "hidden",
        }}
      >
        <Svg width="100%" height="100%">
          {strokes.map((s, i) => (
            <Path
              key={i}
              d={strokeToPath(s.points)}
              stroke={s.color}
              strokeWidth={s.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {live ? (
            <Path
              d={strokeToPath(live.points)}
              stroke={live.color}
              strokeWidth={live.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}
        </Svg>
      </View>

      {/* toolbar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          paddingBottom: Math.max(96, height * 0.02 + 90),
          paddingTop: 6,
        }}
      >
        {Object.entries(COLORS).map(([key, value]) => (
          <Pressable
            key={key}
            onPress={() => {
              setColorKey(key);
              setTool("pen");
            }}
            onLongPress={
              key === "custom" ? () => setPickerOpen(true) : undefined
            }
            accessibilityLabel={key === "custom" ? "Custom pen color" : `${key} pen`}
            accessibilityHint={
              key === "custom" ? "Tap to use, long-press to change the color" : undefined
            }
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: value,
              borderWidth: colorKey === key && tool === "pen" ? 3 : 0,
              borderColor: palette.surfaceHighest,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {key === "custom" ? (
              <MaterialIcons name="palette" size={16} color={palette.surface} />
            ) : null}
          </Pressable>
        ))}
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityLabel="Open color wheel"
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.surfaceHigh,
          }}
        >
          <MaterialIcons name="colorize" size={17} color={palette.onSurfaceVariant} />
        </Pressable>
        <View style={{ width: 8 }} />
        {WIDTHS.map((w) => (
          <Pressable
            key={w}
            onPress={() => setWidth(w)}
            accessibilityLabel={`Stroke width ${w}`}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                width === w ? withAlpha(palette.accent, 0.18) : palette.surfaceHigh,
            }}
          >
            <View
              style={{
                width: w * 2 + 4,
                height: w * 2 + 4,
                borderRadius: w + 2,
                backgroundColor: palette.onSurfaceVariant,
              }}
            />
          </Pressable>
        ))}
        <View style={{ width: 8 }} />
        <Pressable
          onPress={() => setTool(tool === "eraser" ? "pen" : "eraser")}
          accessibilityLabel="Eraser"
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor:
              tool === "eraser" ? withAlpha(palette.error, 0.2) : palette.surfaceHigh,
          }}
        >
          <MaterialIcons
            name="auto-fix-off"
            size={18}
            color={tool === "eraser" ? palette.error : palette.onSurfaceVariant}
          />
        </Pressable>
      </View>

      <ColorPickerSheet
        visible={pickerOpen}
        initialColor={customColor}
        onClose={() => setPickerOpen(false)}
        onPick={(hex) => {
          setCustomColor(hex);
          setColorKey("custom");
          setTool("pen");
          setPickerOpen(false);
        }}
      />

      {exportOpen ? (
        <ExportSheet onClose={() => setExportOpen(false)} onExport={runExport} />
      ) : null}
    </View>
  );
}

// Small share menu: PDF / image / SVG.
function ExportSheet({ onClose, onExport }) {
  const palette = usePalette();
  const OPTIONS = [
    ["pdf", "picture-as-pdf", "Export as PDF"],
    ["png", "image", "Export as image (PNG)"],
    ["svg", "polyline", "Export as SVG (vector)"],
  ];
  return (
    <Pressable
      onPress={onClose}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: withAlpha("#000000", 0.5),
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <Pressable
        onPress={() => {}}
        style={{
          width: "100%",
          maxWidth: 340,
          borderRadius: 20,
          backgroundColor: palette.surfaceContainer,
          padding: 12,
        }}
      >
        {OPTIONS.map(([kind, icon, label]) => (
          <Pressable
            key={kind}
            onPress={() => onExport(kind)}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 14,
              paddingVertical: 14,
              borderRadius: 12,
            }}
          >
            <MaterialIcons name={icon} size={20} color={palette.accent} />
            <Text
              style={{
                color: palette.onSurface,
                fontFamily: "Inter_500Medium",
                fontSize: 15,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </Pressable>
    </Pressable>
  );
}
