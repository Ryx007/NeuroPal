import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, Text, View } from "react-native";

import {
  DataPulse,
  NpGhostButton,
  withAlpha,
} from "@/components/primitives";
import { MockAnchors } from "@/data/mock";
import { formatTime12 } from "@/models/types";
import type { Anchor } from "@/models/types";
import { usePalette } from "@/theme/ThemeProvider";

export default function AnchorsScreen() {
  const palette = usePalette();
  const anchors = MockAnchors;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 160,
      }}
    >
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
        A skeleton for today. Nothing here is mandatory — miss one, the rest
        still hold.
      </Text>
      <View style={{ height: 28 }} />
      {anchors.map((a, i) => (
        <AnchorRow key={a.id} anchor={a} isLast={i === anchors.length - 1} />
      ))}
      <View style={{ height: 12 }} />
      <NpGhostButton label="Add anchor" icon="add" onPress={() => {}} />
    </ScrollView>
  );
}

function AnchorRow({ anchor, isLast }: { anchor: Anchor; isLast: boolean }) {
  const palette = usePalette();
  const statusColor =
    anchor.status === "done"
      ? palette.secondary
      : anchor.status === "current"
        ? palette.accent
        : palette.outlineVariant;

  return (
    <View style={{ flexDirection: "row", minHeight: 90 }}>
      {/* Rail */}
      <View style={{ width: 60, alignItems: "center" }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
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
            <MaterialIcons name="check" size={14} color={palette.surface} />
          ) : anchor.status === "current" ? (
            <DataPulse size={8} />
          ) : null}
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
      {/* Card */}
      <View style={{ flex: 1, paddingBottom: 18 }}>
        <View
          style={{
            padding: 16,
            borderRadius: 20,
            backgroundColor:
              anchor.status === "current"
                ? withAlpha(palette.primaryContainer, 0.22)
                : palette.surfaceContainer,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={{
                  color: statusColor,
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 11,
                }}
              >
                {formatTime12(anchor.time)}
              </Text>
              <View style={{ width: 8 }} />
              <Text
                style={{
                  color: statusColor,
                  fontFamily: "Inter_500Medium",
                  fontSize: 10,
                  letterSpacing: 2,
                }}
              >
                {anchor.status.toUpperCase()}
              </Text>
            </View>
            <View style={{ height: 4 }} />
            <Text
              style={{
                color: palette.onSurface,
                fontFamily: "SpaceGrotesk_600SemiBold",
                fontSize: 16,
              }}
            >
              {anchor.title}
            </Text>
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 13,
              }}
            >
              {anchor.subtitle}
            </Text>
          </View>
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={palette.outlineVariant}
          />
        </View>
      </View>
    </View>
  );
}
