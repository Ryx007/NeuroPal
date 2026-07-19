import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";

import { usePalette } from "../../theme/ThemeProvider";
import { withAlpha } from "../primitives";

// Issue 1(C) — the EPUB Table of Contents: the book's REAL nested nav tree
// (Parts → chapters → sections) from nav.xhtml/toc.ncx, indented by depth,
// with real print page numbers when the book ships a page-list nav (never
// fabricated — books without one simply show no number). Same sheet visual
// language as TocSheet; the data shape (tree vs. flat word spans) is why
// this is its own component.

export function EpubTocSheet({
  visible,
  onClose,
  tocFlat, // [{title, href, anchor, depth, spineIndex}]
  pageList, // [{page, href, anchor}]
  spineIndex,
  onJump,
  bookmarks,
  onJumpBookmark,
  onDeleteBookmark,
}) {
  const palette = usePalette();
  const [tab, setTab] = useState("contents");

  if (!visible) return null;

  // first real page at/inside each toc target's chapter file
  const pageForHref = (href) => {
    if (!href || !pageList || pageList.length === 0) return null;
    const hit = pageList.find((p) => p.href === href);
    return hit ? hit.page : null;
  };

  // the deepest toc entry whose chapter is at/before the open one → active
  let activeIdx = -1;
  tocFlat.forEach((e, i) => {
    if (e.spineIndex !== null && e.spineIndex <= spineIndex) activeIdx = i;
  });

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: withAlpha("#000000", 0.55),
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            maxHeight: "78%",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: withAlpha(palette.surfaceContainer, 0.98),
            paddingTop: 10,
          }}
        >
          <View style={{ alignItems: "center", marginBottom: 6 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: withAlpha(palette.outline, 0.3),
              }}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              paddingHorizontal: 18,
              gap: 8,
              marginBottom: 8,
            }}
          >
            {[
              ["contents", "Contents"],
              ["bookmarks", `Bookmarks (${bookmarks.length})`],
            ].map(([key, label]) => {
              const selected = tab === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 12,
                    backgroundColor: selected
                      ? withAlpha(palette.accent, 0.14)
                      : palette.surfaceHigh,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? palette.accent : palette.onSurfaceVariant,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 13,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close contents"
              style={{ padding: 8 }}
            >
              <MaterialIcons name="close" size={20} color={palette.onSurfaceVariant} />
            </Pressable>
          </View>

          {tab === "contents" ? (
            <FlatList
              data={tocFlat.map((e, i) => ({ ...e, index: i }))}
              keyExtractor={(item) => `${item.index}`}
              initialScrollIndex={Math.max(0, activeIdx)}
              getItemLayout={(_, index) => ({
                length: 48,
                offset: 48 * index,
                index,
              })}
              contentContainerStyle={{ paddingBottom: 30 }}
              renderItem={({ item }) => {
                const focused = item.index === activeIdx;
                const page = pageForHref(item.href);
                const topLevel = item.depth === 0;
                return (
                  <Pressable
                    onPress={() => onJump(item)}
                    disabled={item.spineIndex === null}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to ${item.title}${page ? `, page ${page}` : ""}`}
                    style={{
                      height: 48,
                      flexDirection: "row",
                      alignItems: "center",
                      paddingLeft: 20 + item.depth * 18,
                      paddingRight: 20,
                      backgroundColor: focused
                        ? withAlpha(palette.accent, 0.1)
                        : "transparent",
                      borderLeftWidth: 3,
                      borderLeftColor: focused ? palette.accent : "transparent",
                      opacity: item.spineIndex === null ? 0.45 : 1,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        color: focused
                          ? palette.accent
                          : topLevel
                            ? palette.onSurface
                            : palette.onSurfaceVariant,
                        fontFamily:
                          focused || topLevel
                            ? "Inter_600SemiBold"
                            : "Inter_400Regular",
                        fontSize: topLevel ? 14 : 13,
                      }}
                    >
                      {item.title}
                    </Text>
                    {page ? (
                      <Text
                        style={{
                          color: palette.onSurfaceVariant,
                          fontFamily: "JetBrainsMono_400Regular",
                          fontSize: 10,
                          marginLeft: 8,
                        }}
                      >
                        p. {page}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          ) : (
            <FlatList
              data={bookmarks}
              keyExtractor={(item) => item._id || item.id}
              contentContainerStyle={{ paddingBottom: 30 }}
              ListEmptyComponent={
                <Text
                  style={{
                    color: palette.onSurfaceVariant,
                    fontFamily: "Inter_400Regular",
                    fontSize: 13,
                    paddingHorizontal: 20,
                    paddingVertical: 16,
                  }}
                >
                  No bookmarks yet — use “Bookmark here” in the reader menu.
                </Text>
              }
              renderItem={({ item }) => (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                  }}
                >
                  <MaterialIcons name="bookmark" size={18} color={palette.tertiary} />
                  <Pressable
                    onPress={() => onJumpBookmark(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Jump to bookmark: ${item.note || item.excerpt || ""}`}
                    style={{ flex: 1, marginLeft: 12 }}
                  >
                    <Text
                      numberOfLines={2}
                      style={{
                        color: palette.onSurface,
                        fontFamily: "Inter_400Regular",
                        fontSize: 13,
                        lineHeight: 18,
                      }}
                    >
                      {item.note || item.excerpt || "Bookmark"}
                    </Text>
                    <Text
                      style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: "JetBrainsMono_400Regular",
                        fontSize: 10,
                        marginTop: 2,
                      }}
                    >
                      {new Date(item.createdAt || Date.now()).toLocaleString()}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onDeleteBookmark(item)}
                    accessibilityLabel="Delete bookmark"
                    hitSlop={8}
                    style={{ padding: 6 }}
                  >
                    <MaterialIcons name="close" size={16} color={palette.onSurfaceVariant} />
                  </Pressable>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
