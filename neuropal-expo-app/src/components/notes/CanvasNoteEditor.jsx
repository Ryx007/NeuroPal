import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import Toast from "../toast";

import { ColorPickerSheet } from "./ColorPickerSheet";
import { MarkdownBlocks } from "./markdownPreview";
import {
  buildNoteSvg,
  canvasToMarkdown,
  exportNoteImage,
  exportNoteMarkdown,
  exportNotePdf,
  exportNoteSvg,
  strokeToPath,
} from "../../utils/noteExport";
import { saveNote, updateNoteRemote } from "../../store/slices/notesSlice";
import { usePalette } from "../../theme/ThemeProvider";
import { withAlpha } from "../primitives";

// Issue 2 — ONE canvas for typed text and ink (Samsung Notes / GoodNotes
// style). A note is { blocks:[{id,type:'text',x,y,w,content}], strokes }
// on a single scrolling page.
//
// INPUT ROUTING (the part that makes the S-Pen feel native). Two channels
// cooperate:
//   · RN new-arch POINTER EVENTS (onPointerDown/Move/Up — Fabric's W3C
//     dispatch, RN 0.83 + newArchEnabled) supply pointerType
//     ('pen'/'touch'/'mouse') and pressure.
//   · The classic RESPONDER system supplies canvas-local geometry
//     (locationX/Y) and, via onStartShouldSetResponderCapture, the power to
//     steal the gesture from the surrounding ScrollView BEFORE it scrolls.
// The capture decision reads the pointer channel:
//   · Type mode — only pointerType 'pen' draws (S-Pen ALWAYS inks, even
//     over a text box); finger taps/edits/drags, and scrolling stays free.
//   · Pen/Highlighter/Eraser — 'pen' and 'mouse' (web) draw; 'touch'
//     scrolls (palm rejection).
//   · Devices where pointer events never fire fall back to responder-only:
//     every input draws in pen modes (no palm rejection — degraded, but
//     functional).
// Pressure (S-Pen) scales the finished stroke's width.

const WIDTHS = [2, 4, 8];
const MIN_PAGE_H = 1100;
const PAGE_GROW = 500; // grow the page when ink/text approaches the bottom
const POINTER_FRESH_MS = 700;

// Lossless view of any legacy note on the unified surface. kind stays
// untouched until the first SAVE writes back as 'canvas'.
function toCanvas(note) {
  if (note.kind === "canvas") {
    return { blocks: note.blocks || [], strokes: note.strokes || [] };
  }
  if (note.kind === "typed") {
    const content = note.contentMarkdown || "";
    return {
      blocks: content.trim()
        ? [{ id: "b-migrated", type: "text", x: 16, y: 16, w: -1, content }]
        : [],
      strokes: [],
    };
  }
  return { blocks: [], strokes: note.strokes || [] };
}

function contentBottom(blocks, strokes) {
  let bottom = 0;
  for (const b of blocks) bottom = Math.max(bottom, b.y + 120);
  for (const s of strokes) {
    for (const p of s.points) bottom = Math.max(bottom, p[1]);
  }
  return bottom;
}

export function CanvasNoteEditor({ note, onBack }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const { width: winW } = useWindowDimensions();

  const initial = useMemo(() => toCanvas(note), [note.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [blocks, setBlocks] = useState(initial.blocks);
  const [strokes, setStrokes] = useState(initial.strokes);
  const [title, setTitle] = useState(note.title || "");
  const [mode, setMode] = useState("type"); // 'type' | 'pen' | 'highlighter' | 'eraser'
  const [colorKey, setColorKey] = useState("ink");
  const [customColor, setCustomColor] = useState("#4FC3F7");
  const [width, setWidth] = useState(4);
  const [live, setLive] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [dragOffset, setDragOffset] = useState(null); // {id, dx, dy} while dragging
  const [scrollLocked, setScrollLocked] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [pageH, setPageH] = useState(() =>
    Math.max(MIN_PAGE_H, contentBottom(initial.blocks, initial.strokes) + PAGE_GROW)
  );

  const liveRef = useRef(null);
  const canvasRef = useRef(null);
  const saveTimer = useRef(null);
  const undoStack = useRef([]);
  // pointer channel — freshest pointerType/pressure seen (see header comment)
  const pointerRef = useRef({ type: null, pressure: 0, t: 0 });
  const pointerCapable = useRef(false);
  const latest = useRef({ blocks, strokes, title });
  latest.current = { blocks, strokes, title };
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const canvasW = winW; // page fills the screen; blocks stretch to margins

  const COLORS = useMemo(
    () => ({
      ink: palette.onSurface,
      accent: palette.accent,
      gold: palette.tertiary,
      custom: customColor,
    }),
    [palette, customColor]
  );

  // ---- sync ---------------------------------------------------------------
  const save = useCallback(() => {
    const { blocks: b, strokes: s, title: t } = latest.current;
    dispatch(saveNote({ id: note.id, blocks: b, strokes: s, title: t, kind: "canvas" }));
    if (!note._id) return; // un-migrated local legacy note — stays local
    dispatch(
      updateNoteRemote({ id: note._id, kind: "canvas", blocks: b, strokes: s, title: t })
    )
      .unwrap()
      .catch((error) =>
        Toast.show({ type: "error", text1: "Note sync failed", text2: error?.message })
      );
  }, [dispatch, note.id, note._id]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 1200);
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

  const pushUndo = useCallback(() => {
    undoStack.current.push({
      blocks: latest.current.blocks,
      strokes: latest.current.strokes,
    });
    if (undoStack.current.length > 50) undoStack.current.shift();
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setBlocks(prev.blocks);
    setStrokes(prev.strokes);
    scheduleSave();
  }, [scheduleSave]);

  const growIfNeeded = useCallback(
    (y) => {
      if (y > pageH - 200) setPageH(y + PAGE_GROW);
    },
    [pageH]
  );

  // ---- input routing ------------------------------------------------------
  const freshPointerType = () => {
    const p = pointerRef.current;
    return Date.now() - p.t < POINTER_FRESH_MS ? p.type : null;
  };

  const shouldDrawNow = () => {
    const m = modeRef.current;
    const pt = freshPointerType();
    if (m === "type") return pt === "pen"; // S-Pen always inks
    // pen / highlighter / eraser:
    if (pt === "pen" || pt === "mouse") return true;
    if (pt === "touch") return false; // finger scrolls — palm rejection
    return !pointerCapable.current; // no pointer events on this platform
  };

  const notePointer = (e) => {
    const ne = e.nativeEvent || {};
    if (ne.pointerType) {
      pointerCapable.current = true;
      pointerRef.current = {
        type: ne.pointerType,
        pressure: typeof ne.pressure === "number" ? ne.pressure : 0,
        t: Date.now(),
      };
    }
  };

  const strokeStyle = () => {
    const m = modeRef.current === "type" ? "pen" : modeRef.current; // S-Pen in type mode inks as pen
    if (m === "highlighter") {
      return { color: withAlpha(COLORS[colorKey], 0.4), width: width * 3.5 };
    }
    return { color: COLORS[colorKey], width };
  };

  function eraseAt(x, y) {
    setStrokes((prev) => {
      const hit = prev.findIndex((s) =>
        s.points.some((p) => Math.abs(p[0] - x) < 18 && Math.abs(p[1] - y) < 18)
      );
      if (hit < 0) return prev;
      return prev.filter((_, i) => i !== hit);
    });
  }

  const pressures = useRef([]);
  const drawHandlers = {
    onPointerDown: notePointer,
    onPointerMove: notePointer,
    onStartShouldSetResponderCapture: () => shouldDrawNow(),
    onMoveShouldSetResponderCapture: () => shouldDrawNow(),
    onResponderGrant: (e) => {
      const ne = e.nativeEvent;
      const x = Number.isFinite(ne.locationX) ? ne.locationX : ne.offsetX;
      const y = Number.isFinite(ne.locationY) ? ne.locationY : ne.offsetY;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      setScrollLocked(true);
      if (modeRef.current === "eraser") {
        pushUndo();
        eraseAt(x, y);
        return;
      }
      pressures.current = [pointerRef.current.pressure || 0];
      liveRef.current = [[Math.round(x), Math.round(y)]];
      setLive({ points: liveRef.current, ...strokeStyle() });
    },
    onResponderMove: (e) => {
      const ne = e.nativeEvent;
      const x = Number.isFinite(ne.locationX) ? ne.locationX : ne.offsetX;
      const y = Number.isFinite(ne.locationY) ? ne.locationY : ne.offsetY;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (modeRef.current === "eraser") {
        eraseAt(x, y);
        return;
      }
      if (!liveRef.current) return;
      pressures.current.push(pointerRef.current.pressure || 0);
      liveRef.current = [...liveRef.current, [Math.round(x), Math.round(y)]];
      setLive({ points: liveRef.current, ...strokeStyle() });
    },
    onResponderRelease: () => {
      setScrollLocked(false);
      if (modeRef.current === "eraser") {
        scheduleSave();
        return;
      }
      if (!liveRef.current) return;
      const style = strokeStyle();
      // S-Pen pressure → width: mean pressure over the stroke scales the
      // base width (0 pressure reported = capacitive touch/mouse → 1×)
      const ps = pressures.current.filter((p) => p > 0);
      const mean = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
      const effWidth = mean > 0 ? Math.max(1, style.width * (0.55 + 0.9 * mean)) : style.width;
      const finished = { points: liveRef.current, color: style.color, width: effWidth };
      const maxY = Math.max(...liveRef.current.map((p) => p[1]));
      liveRef.current = null;
      pressures.current = [];
      setLive(null);
      pushUndo();
      setStrokes((prev) => [...prev, finished]);
      growIfNeeded(maxY);
      scheduleSave();
    },
    onResponderTerminate: () => {
      setScrollLocked(false);
      liveRef.current = null;
      setLive(null);
    },
  };

  // ---- blocks -------------------------------------------------------------
  // RN-web's Pressable press event doesn't reliably carry locationX/Y —
  // fall back through the DOM event's offsetX before giving up. A tap with
  // no resolvable coordinates must NOT create a corrupt block (NaN → null
  // over the wire → server 400).
  const tapPoint = (ne) => {
    const x = Number.isFinite(ne.locationX) ? ne.locationX : ne.offsetX;
    const y = Number.isFinite(ne.locationY) ? ne.locationY : ne.offsetY;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };

  const handleCanvasTap = (e) => {
    if (editingId) {
      setEditingId(null);
      setSelectedId(null);
      return;
    }
    if (selectedId) {
      setSelectedId(null);
      return;
    }
    if (modeRef.current !== "type") return;
    const pt = tapPoint(e.nativeEvent);
    if (!pt) return;
    // tap empty space → new text box, editing immediately
    const id = `b-${Date.now().toString(36)}`;
    pushUndo();
    setBlocks((prev) => [
      ...prev,
      {
        id,
        type: "text",
        x: Math.max(8, Math.min(Math.round(pt.x) - 8, canvasW - 180)),
        y: Math.round(pt.y),
        w: -1,
        content: "",
      },
    ]);
    growIfNeeded(pt.y + 160);
    setEditingId(id);
    setSelectedId(id);
  };

  const changeBlock = (id, content) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, content } : b)));
    scheduleSave();
  };

  const moveBlockEnd = (id, dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) {
      setDragOffset(null);
      setScrollLocked(false);
      return;
    }
    pushUndo();
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              x: Math.max(0, Math.min(b.x + dx, canvasW - 120)),
              y: Math.max(0, b.y + dy),
            }
          : b
      )
    );
    setDragOffset(null);
    setScrollLocked(false);
    scheduleSave();
  };

  const deleteBlock = (id) => {
    pushUndo();
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setEditingId(null);
    setSelectedId(null);
    scheduleSave();
  };

  // ---- export -------------------------------------------------------------
  async function runExport(kind) {
    setExportOpen(false);
    const h = Math.max(MIN_PAGE_H, contentBottom(blocks, strokes) + 80);
    try {
      if (kind === "md") {
        await exportNoteMarkdown({
          title,
          markdown: canvasToMarkdown({ blocks, strokes }),
        });
      } else {
        const svg = buildNoteSvg({
          strokes,
          blocks,
          width: canvasW,
          height: h,
          background: palette.surfaceLowest,
          textColor: palette.onSurface,
        });
        if (kind === "pdf") await exportNotePdf({ svg, title });
        else if (kind === "png")
          await exportNoteImage({ svg, width: canvasW, height: h, title, viewShotRef: canvasRef });
        else await exportNoteSvg({ svg, title });
      }
      Toast.show({ type: "success", text1: "Note exported" });
    } catch (error) {
      if (!/cancell?ed|dismissed/i.test(error?.message || "")) {
        Toast.show({ type: "error", text1: "Export failed", text2: error?.message });
      }
    }
  }

  // ---- render -------------------------------------------------------------
  const MODES = [
    ["type", "text-fields", "Select and type"],
    ["pen", "edit", "Pen"],
    ["highlighter", "border-color", "Highlighter"],
    ["eraser", "auto-fix-off", "Eraser"],
  ];

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
          onPress={() => setExportOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Export note"
          style={{ padding: 8 }}
        >
          <MaterialIcons name="ios-share" size={20} color={palette.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* page */}
      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={!scrollLocked}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <View
          ref={canvasRef}
          collapsable={false}
          {...drawHandlers}
          style={{
            width: canvasW,
            height: pageH,
            backgroundColor: palette.surfaceLowest,
          }}
        >
          <Pressable
            onPress={handleCanvasTap}
            accessibilityLabel={
              mode === "type" ? "Canvas — tap empty space for a new text box" : "Canvas"
            }
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <Svg pointerEvents="none" width="100%" height={pageH}>
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

          {blocks.map((block) => (
            <TextBlock
              key={block.id}
              block={block}
              palette={palette}
              canvasW={canvasW}
              editing={editingId === block.id}
              selected={selectedId === block.id}
              dragOffset={dragOffset && dragOffset.id === block.id ? dragOffset : null}
              onTap={() => {
                if (modeRef.current === "type") {
                  setSelectedId(block.id);
                  setEditingId(block.id);
                } else {
                  setSelectedId(block.id === selectedId ? null : block.id);
                }
              }}
              onChange={(text) => changeBlock(block.id, text)}
              onDrag={(dx, dy) => setDragOffset({ id: block.id, dx, dy })}
              onDragStart={() => setScrollLocked(true)}
              onDragEnd={(dx, dy) => moveBlockEnd(block.id, dx, dy)}
              onDelete={() => deleteBlock(block.id)}
            />
          ))}
        </View>
      </ScrollView>

      {/* toolbar row 1 — modes + undo */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingTop: 8,
        }}
      >
        {MODES.map(([key, icon, label]) => (
          <Pressable
            key={key}
            onPress={() => {
              setMode(key);
              setEditingId(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: mode === key }}
            style={{
              minWidth: 44,
              height: 40,
              paddingHorizontal: 10,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                mode === key ? withAlpha(palette.accent, 0.16) : palette.surfaceHigh,
            }}
          >
            <MaterialIcons
              name={icon}
              size={20}
              color={mode === key ? palette.accent : palette.onSurfaceVariant}
            />
          </Pressable>
        ))}
        <Pressable
          onPress={undo}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          style={{
            minWidth: 44,
            height: 40,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.surfaceHigh,
          }}
        >
          <MaterialIcons name="undo" size={20} color={palette.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* toolbar row 2 — colors + widths (kept from the ink editor) */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          paddingVertical: 10,
          paddingBottom: 14,
        }}
      >
        {Object.entries(COLORS).map(([key, value]) => (
          <Pressable
            key={key}
            onPress={() => setColorKey(key)}
            onLongPress={key === "custom" ? () => setPickerOpen(true) : undefined}
            accessibilityRole="button"
            accessibilityLabel={key === "custom" ? "Custom pen color" : `${key} pen`}
            accessibilityHint={
              key === "custom" ? "Tap to use, long-press to change the color" : undefined
            }
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: value,
              borderWidth: colorKey === key ? 3 : 0,
              borderColor: palette.surfaceHighest,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {key === "custom" ? (
              <MaterialIcons name="palette" size={15} color={palette.surface} />
            ) : null}
          </Pressable>
        ))}
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open color wheel"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.surfaceHigh,
          }}
        >
          <MaterialIcons name="colorize" size={16} color={palette.onSurfaceVariant} />
        </Pressable>
        <View style={{ width: 6 }} />
        {WIDTHS.map((w) => (
          <Pressable
            key={w}
            onPress={() => setWidth(w)}
            accessibilityRole="button"
            accessibilityLabel={`Stroke width ${w}`}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
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
      </View>

      <ColorPickerSheet
        visible={pickerOpen}
        initialColor={customColor}
        onClose={() => setPickerOpen(false)}
        onPick={(hex) => {
          setCustomColor(hex);
          setColorKey("custom");
          setPickerOpen(false);
        }}
      />

      {exportOpen ? (
        <ExportSheet onClose={() => setExportOpen(false)} onExport={runExport} palette={palette} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// One positioned text box
// ---------------------------------------------------------------------------

function TextBlock({
  block,
  palette,
  canvasW,
  editing,
  selected,
  dragOffset,
  onTap,
  onChange,
  onDrag,
  onDragStart,
  onDragEnd,
  onDelete,
}) {
  const dragStart = useRef(null);
  const w = block.w === -1 ? canvasW - block.x - 16 : block.w;

  const handleResponders = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e) => {
      dragStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      onDragStart();
    },
    onResponderMove: (e) => {
      if (!dragStart.current) return;
      onDrag(
        e.nativeEvent.pageX - dragStart.current.x,
        e.nativeEvent.pageY - dragStart.current.y
      );
    },
    onResponderRelease: (e) => {
      if (!dragStart.current) return;
      const dx = e.nativeEvent.pageX - dragStart.current.x;
      const dy = e.nativeEvent.pageY - dragStart.current.y;
      dragStart.current = null;
      onDragEnd(dx, dy);
    },
    onResponderTerminate: () => {
      dragStart.current = null;
      onDragEnd(0, 0);
    },
  };

  return (
    <View
      style={{
        position: "absolute",
        left: block.x + (dragOffset?.dx || 0),
        top: block.y + (dragOffset?.dy || 0),
        width: w,
        borderWidth: 1,
        borderRadius: 10,
        borderColor:
          selected || editing ? withAlpha(palette.accent, 0.55) : "transparent",
        backgroundColor:
          selected || editing ? withAlpha(palette.surface, 0.35) : "transparent",
      }}
    >
      {selected || editing ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 4,
            height: 26,
          }}
        >
          <View
            {...handleResponders}
            accessible
            accessibilityLabel="Drag to move text box"
            style={{ flex: 1, alignItems: "flex-start", justifyContent: "center", height: 26 }}
          >
            <MaterialIcons name="drag-indicator" size={18} color={palette.onSurfaceVariant} />
          </View>
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete text box"
            hitSlop={6}
            style={{ padding: 2 }}
          >
            <MaterialIcons name="close" size={16} color={palette.onSurfaceVariant} />
          </Pressable>
        </View>
      ) : null}

      {editing ? (
        <TextInput
          value={block.content}
          onChangeText={onChange}
          multiline
          autoFocus
          textAlignVertical="top"
          placeholder={"Write — **bold**, $\\psi$ math, - lists…"}
          placeholderTextColor={palette.onSurfaceVariant}
          accessibilityLabel="Text box content in Markdown"
          style={{
            color: palette.onSurface,
            fontFamily: "JetBrainsMono_400Regular",
            fontSize: 14,
            lineHeight: 21,
            padding: 8,
            minHeight: 60,
            ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
          }}
        />
      ) : (
        <Pressable onPress={onTap} accessibilityLabel="Text box" style={{ padding: 8 }}>
          {block.content.trim() ? (
            <MarkdownBlocks markdown={block.content} palette={palette} fontSize={14} />
          ) : (
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              Empty text box — tap to write
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

// Export menu: PDF / PNG / SVG / Markdown.
function ExportSheet({ onClose, onExport, palette }) {
  const OPTIONS = [
    ["pdf", "picture-as-pdf", "Export as PDF"],
    ["png", "image", "Export as image (PNG)"],
    ["svg", "polyline", "Export as SVG (vector)"],
    ["md", "description", "Export as Markdown"],
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
