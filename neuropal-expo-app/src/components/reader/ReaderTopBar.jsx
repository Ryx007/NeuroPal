import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePalette } from "../../theme/ThemeProvider";
import { GlassPanel, withAlpha } from "../primitives";

// D8 — Play-Books-style top bar: back · title · Contents · Display options ·
// overflow (Study, view toggle, go-to-page, bookmark, edit). Liquid glass,
// hides with the chrome.

export function ReaderTopBar({
  title,
  subtitle,
  onBack,
  onToc,
  onDisplay,
  overflowItems, // [{ icon, label, onPress }]
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}
    >
      <GlassPanel radius={0} style={{ paddingTop: insets.top, borderRadius: 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 8,
            paddingVertical: 8,
          }}
        >
          <Pressable
            onPress={onBack}
            accessibilityLabel="Back to library"
            hitSlop={6}
            style={{ padding: 8 }}
          >
            <MaterialIcons name="arrow-back" size={22} color={palette.onSurface} />
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: 6 }}>
            <Text
              numberOfLines={1}
              style={{
                color: palette.onSurface,
                fontFamily: "SpaceGrotesk_600SemiBold",
                fontSize: 16,
              }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                numberOfLines={1}
                style={{
                  color: palette.onSurfaceVariant,
                  fontFamily: "Inter_400Regular",
                  fontSize: 11,
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onToc}
            accessibilityLabel="Table of contents and bookmarks"
            hitSlop={6}
            style={{ padding: 8 }}
          >
            <MaterialIcons name="toc" size={22} color={palette.onSurface} />
          </Pressable>
          <Pressable
            onPress={onDisplay}
            accessibilityLabel="Display options"
            hitSlop={6}
            style={{ padding: 8 }}
          >
            <MaterialIcons name="text-format" size={22} color={palette.onSurface} />
          </Pressable>
          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="More reader actions"
            hitSlop={6}
            style={{ padding: 8 }}
          >
            <MaterialIcons name="more-vert" size={22} color={palette.onSurface} />
          </Pressable>
        </View>
      </GlassPanel>

      <Modal
        transparent
        visible={menuOpen}
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          onPress={() => setMenuOpen(false)}
          style={{ flex: 1, backgroundColor: withAlpha("#000000", 0.35) }}
        >
          <View
            style={{
              position: "absolute",
              top: insets.top + 52,
              right: 10,
              minWidth: 220,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: withAlpha(palette.surfaceContainer, 0.97),
              borderWidth: 1,
              borderColor: withAlpha(palette.outlineVariant, 0.3),
            }}
          >
            {(overflowItems || []).map((item) => (
              <Pressable
                key={item.label}
                onPress={() => {
                  setMenuOpen(false);
                  item.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 13,
                }}
              >
                <MaterialIcons name={item.icon} size={18} color={palette.accent} />
                <Text
                  style={{
                    marginLeft: 12,
                    color: palette.onSurface,
                    fontFamily: "Inter_500Medium",
                    fontSize: 14,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
