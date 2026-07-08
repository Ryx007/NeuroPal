import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePalette } from "../../theme/ThemeProvider";
import { GlassPanel, withAlpha } from "../primitives";

// Text-selection action bar: long-press a word to anchor a selection, tap
// another word to extend it, then highlight (4 colors) / explain / cancel.

export function SelectionBar({ wordCount, onHighlight, onExplain, onCancel }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const colors = [
    { key: "gold", value: palette.tertiary },
    { key: "rose", value: palette.secondary },
    { key: "ruby", value: palette.accent },
    { key: "amber", value: palette.warn },
  ];

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + 58,
        left: 12,
        right: 12,
        zIndex: 30,
      }}
    >
      <GlassPanel radius={18} intensity={55}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "JetBrainsMono_400Regular",
              fontSize: 11,
              marginRight: 10,
            }}
          >
            {wordCount}w
          </Text>
          {colors.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => onHighlight(c.value)}
              accessibilityRole="button"
              accessibilityLabel={`Highlight ${c.key}`}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: withAlpha(c.value, 0.85),
                marginRight: 8,
                borderWidth: 1,
                borderColor: withAlpha("#FFFFFF", 0.25),
              }}
            />
          ))}
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={onExplain}
            accessibilityRole="button"
            accessibilityLabel="Explain selection"
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 10,
              backgroundColor: withAlpha(palette.accent, 0.14),
              marginRight: 8,
            }}
          >
            <MaterialIcons name="auto-awesome" size={14} color={palette.accent} />
            <Text
              style={{
                marginLeft: 6,
                color: palette.accent,
                fontFamily: "Inter_600SemiBold",
                fontSize: 12,
              }}
            >
              Explain
            </Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel selection"
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <MaterialIcons name="close" size={18} color={palette.onSurfaceVariant} />
          </Pressable>
        </View>
      </GlassPanel>
    </View>
  );
}
