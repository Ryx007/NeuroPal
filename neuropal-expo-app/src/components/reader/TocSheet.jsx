import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";

import { usePalette } from "../../theme/ThemeProvider";
import { withAlpha } from "../primitives";

// D8 — Table of Contents sheet (replaces ‹ Part N/M ›), plus the bookmarks
// list. Tap a chapter to jump the view AND the read cursor; tap a bookmark
// to jump to its exact word.

export function TocSheet({
  visible,
  onClose,
  sections,
  activeSection,
  onJumpSection,
  bookmarks,
  onJumpBookmark,
  onDeleteBookmark,
}) {
  const palette = usePalette();
  const [tab, setTab] = useState("contents"); // 'contents' | 'bookmarks'

  if (!visible) return null;

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
              data={sections.map((s, i) => ({ ...s, index: i }))}
              keyExtractor={(item) => item.id}
              initialScrollIndex={Math.max(0, Math.min(activeSection, sections.length - 1))}
              getItemLayout={(_, index) => ({
                length: 52,
                offset: 52 * index,
                index,
              })}
              contentContainerStyle={{ paddingBottom: 30 }}
              renderItem={({ item }) => {
                const focused = item.index === activeSection;
                return (
                  <Pressable
                    onPress={() => onJumpSection(item.index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to ${item.heading}`}
                    style={{
                      height: 52,
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 20,
                      backgroundColor: focused
                        ? withAlpha(palette.accent, 0.1)
                        : "transparent",
                      borderLeftWidth: 3,
                      borderLeftColor: focused ? palette.accent : "transparent",
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        color: focused ? palette.accent : palette.onSurface,
                        fontFamily: focused
                          ? "Inter_600SemiBold"
                          : "Inter_400Regular",
                        fontSize: 14,
                      }}
                    >
                      {item.heading}
                    </Text>
                    <Text
                      style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: "JetBrainsMono_400Regular",
                        fontSize: 10,
                        marginLeft: 8,
                      }}
                    >
                      {item.index + 1}
                    </Text>
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
                    accessibilityLabel={`Jump to bookmark: ${item.excerpt || ""}`}
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
                      {item.excerpt || `Word ${item.wordStart}`}
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
