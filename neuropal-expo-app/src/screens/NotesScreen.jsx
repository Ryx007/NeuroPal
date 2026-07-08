import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
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

import {
  createNote,
  deleteNote,
  saveNote,
} from "../store/slices/notesSlice";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "../components/primitives";

// Handwritten notes — S-pen/stylus/finger ink on an SVG canvas.
// v1 scope: freehand pen (3 colors × 3 widths), stroke eraser, undo, clear,
// multiple notes with titles, everything persisted locally on the device.

export function NotesScreen() {
  const [openId, setOpenId] = useState(null);

  if (openId) {
    return <NoteEditor noteId={openId} onBack={() => setOpenId(null)} />;
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

  function newNote() {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    dispatch(createNote({ id, title: `Note ${notes.length + 1}` }));
    onOpen(id);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 160 }}
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

        <View style={{ marginTop: 20, gap: 12 }}>
          {notes.length === 0 ? (
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 14,
              }}
            >
              No notes yet — tap + to start writing with the S-Pen.
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
                <MaterialIcons name="gesture" size={22} color={palette.accent} />
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
                    style={{
                      color: palette.onSurfaceVariant,
                      fontFamily: "JetBrainsMono_400Regular",
                      fontSize: 11,
                      marginTop: 3,
                    }}
                  >
                    {note.strokes.length} strokes · {new Date(note.updatedAt).toLocaleString()}
                  </Text>
                </View>
                <Pressable
                  onPress={() => dispatch(deleteNote(note.id))}
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

      <Pressable
        onPress={newNote}
        accessibilityLabel="New note"
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
          elevation: 8,
        }}
      >
        <MaterialIcons name="add" size={30} color={palette.onPrimary} />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const WIDTHS = [2, 4, 8];

function strokeToPath(points) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${x} ${y} L ${x + 0.1} ${y + 0.1}`;
  }
  // Midpoint-quadratic smoothing — turns jittery touch samples into ink.
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    d += ` Q ${x1} ${y1} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

function NoteEditor({ noteId, onBack }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const note = useSelector((s) => s.notes.items.find((n) => n.id === noteId));
  const { height } = useWindowDimensions();

  const [strokes, setStrokes] = useState(note?.strokes || []);
  const [live, setLive] = useState(null); // in-progress stroke points
  const [tool, setTool] = useState("pen"); // 'pen' | 'eraser'
  const [colorKey, setColorKey] = useState("ink");
  const [width, setWidth] = useState(4);
  const [title, setTitle] = useState(note?.title || "");
  const liveRef = useRef(null);

  const COLORS = useMemo(
    () => ({
      ink: palette.onSurface,
      accent: palette.accent,
      gold: palette.tertiary,
    }),
    [palette]
  );

  const persist = useCallback(
    (nextStrokes) => {
      dispatch(saveNote({ id: noteId, strokes: nextStrokes, title }));
    },
    [dispatch, noteId, title]
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
        <Pressable onPress={undo} accessibilityLabel="Undo last stroke" style={{ padding: 8 }}>
          <MaterialIcons name="undo" size={20} color={palette.onSurfaceVariant} />
        </Pressable>
        <Pressable onPress={clearAll} accessibilityLabel="Clear page" style={{ padding: 8 }}>
          <MaterialIcons name="layers-clear" size={20} color={palette.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* canvas */}
      <View
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
            accessibilityLabel={`${key} pen`}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: value,
              borderWidth: colorKey === key && tool === "pen" ? 3 : 0,
              borderColor: palette.surfaceHighest,
            }}
          />
        ))}
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
    </View>
  );
}
