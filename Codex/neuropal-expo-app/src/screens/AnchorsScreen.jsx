import { MaterialIcons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { ScrollView, Text, View } from "react-native";

import { formatTime12 } from "../data/mockData";
import { selectAnchors } from "../store/selectors";
import { usePalette } from "../theme/ThemeProvider";
import { DataPulse, NpGhostButton, withAlpha } from "../components/primitives";

export function AnchorsScreen() {
  const palette = usePalette();
  const anchors = useSelector(selectAnchors);

  return (
    <ScrollView
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 160,
      }}
    >
      <View
        style={{
          height: 5,
          borderRadius: 999,
          backgroundColor: palette.surfaceHigh,
          overflow: "hidden",
          marginBottom: 30,
        }}
      >
        <View
          style={{
            width: "32%",
            height: "100%",
            backgroundColor: palette.secondary,
          }}
        />
      </View>

      <Text
        style={{
          color: palette.onSurface,
          fontFamily: "SpaceGrotesk_700Bold",
          fontSize: 34,
          letterSpacing: -0.8,
        }}
      >
        Daily Anchors
      </Text>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_400Regular",
          fontSize: 15,
          marginTop: 6,
        }}
      >
        SCAFFOLD framework for today. Miss one and the rest still hold.
      </Text>
      <View style={{ height: 28 }} />
      {anchors.map((anchor, index) => (
        <AnchorRow
          key={anchor.id}
          anchor={anchor}
          isLast={index === anchors.length - 1}
        />
      ))}
      <View style={{ height: 12 }} />
      <NpGhostButton label="Add anchor" icon="add" onPress={() => {}} />
    </ScrollView>
  );
}

function AnchorRow({ anchor, isLast }) {
  const palette = usePalette();
  const statusColor =
    anchor.status === "done"
      ? palette.secondary
      : anchor.status === "current"
        ? palette.accent
        : palette.outlineVariant;

  return (
    <View style={{ flexDirection: "row", minHeight: 100 }}>
      <View style={{ width: 60, alignItems: "center" }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            borderWidth: 2,
            borderColor: statusColor,
            backgroundColor:
              anchor.status === "done" ? statusColor : palette.surface,
            marginTop: 6,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {anchor.status === "done" ? (
            <MaterialIcons name="check" size={16} color={palette.surface} />
          ) : anchor.status === "current" ? (
            <DataPulse size={8} />
          ) : (
            <MaterialIcons
              name={anchor.icon}
              size={16}
              color={palette.onSurfaceVariant}
            />
          )}
        </View>
        {!isLast ? (
          <View
            style={{
              flex: 1,
              width: 2,
              backgroundColor: withAlpha(palette.outlineVariant, 0.3),
              marginTop: 2,
            }}
          />
        ) : null}
      </View>

      <View style={{ flex: 1, paddingBottom: 18 }}>
        <View
          style={{
            padding: 18,
            borderRadius: 24,
            backgroundColor:
              anchor.status === "current"
                ? palette.surfaceContainer
                : palette.surfaceLow,
            borderWidth: anchor.status === "current" ? 1 : 0,
            borderColor: withAlpha(palette.accent, 0.2),
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: statusColor,
                  fontFamily: "Inter_500Medium",
                  fontSize: 10,
                  letterSpacing: 2,
                }}
              >
                {anchor.status === "current" ? "ACTIVE NOW" : anchor.status.toUpperCase()}
              </Text>
              <View style={{ height: 6 }} />
              <Text
                style={{
                  color: palette.onSurface,
                  fontFamily: "SpaceGrotesk_700Bold",
                  fontSize: 28,
                  lineHeight: 32,
                }}
              >
                {anchor.title}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 16,
                backgroundColor: withAlpha(statusColor, 0.12),
              }}
            >
              <Text
                style={{
                  color: statusColor,
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 12,
                }}
              >
                {formatTime12(anchor.time)}
              </Text>
            </View>
          </View>
          <View style={{ height: 10 }} />
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            {anchor.subtitle}
          </Text>
          {anchor.status === "current" ? (
            <>
              <View style={{ height: 16 }} />
              <View
                style={{
                  paddingVertical: 14,
                  borderRadius: 16,
                  backgroundColor: palette.secondary,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: palette.surface,
                    fontFamily: "Inter_700Bold",
                    fontSize: 15,
                  }}
                >
                  Complete Anchor
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}
