import { MaterialIcons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DataPulse, GlassPanel, withAlpha } from "@/components/primitives";
import { TweaksSheet } from "@/components/TweaksSheet";
import { usePalette } from "@/theme/ThemeProvider";

export default function TabsLayout() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Tabs
        screenOptions={{
          header: () => (
            <GlassPanel
              radius={0}
              style={{
                paddingTop: insets.top,
                paddingBottom: 10,
                borderRadius: 0,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingTop: 6,
                }}
              >
                <Pressable style={{ padding: 6 }} accessibilityLabel="Menu">
                  <MaterialIcons name="menu" size={22} color={palette.accent} />
                </Pressable>
                <View style={{ width: 6 }} />
                <DataPulse />
                <View style={{ width: 10 }} />
                <Text
                  style={{
                    fontFamily: "SpaceGrotesk_700Bold",
                    fontSize: 20,
                    color: palette.accent,
                    letterSpacing: -0.5,
                  }}
                >
                  NeuroPal
                </Text>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => setTweaksOpen(true)}
                  style={{ padding: 6 }}
                  accessibilityLabel="Open tweaks"
                >
                  <MaterialIcons
                    name="tune"
                    size={22}
                    color={palette.onSurfaceVariant}
                  />
                </Pressable>
                <Pressable
                  onPress={() => router.push("/profile")}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: palette.surfaceHigh,
                    alignItems: "center",
                    justifyContent: "center",
                    marginLeft: 4,
                    borderWidth: 2,
                    borderColor: withAlpha(palette.accent, 0.3),
                  }}
                  accessibilityLabel="Open profile"
                >
                  <MaterialIcons
                    name="person"
                    size={18}
                    color={palette.onSurfaceVariant}
                  />
                </Pressable>
              </View>
            </GlassPanel>
          ),
          tabBarShowLabel: true,
          tabBarActiveTintColor: palette.accent,
          tabBarInactiveTintColor: withAlpha(palette.onSurfaceVariant, 0.7),
          tabBarStyle: {
            position: "absolute",
            backgroundColor: "transparent",
            borderTopWidth: 0,
            elevation: 0,
            paddingHorizontal: 12,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
            paddingTop: 8,
            height: (insets.bottom > 0 ? insets.bottom : 0) + 66,
          },
          tabBarBackground: () => (
            <View
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                top: 0,
                bottom: insets.bottom > 0 ? insets.bottom : 6,
                borderRadius: 28,
                overflow: "hidden",
              }}
            >
              <GlassPanel
                radius={28}
                style={{ flex: 1, borderRadius: 28 }}
              >
                <View />
              </GlassPanel>
            </View>
          ),
          tabBarItemStyle: {
            marginTop: 6,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: "Inter_500Medium",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => (
              <MaterialIcons name="home" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: "Library",
            tabBarIcon: ({ color }) => (
              <MaterialIcons name="menu-book" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="reader"
          options={{
            title: "Reader",
            tabBarIcon: ({ color }) => (
              <MaterialIcons name="chrome-reader-mode" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="anchors"
          options={{
            title: "Anchors",
            tabBarIcon: ({ color }) => (
              <MaterialIcons name="anchor" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color }) => (
              <MaterialIcons name="person" size={22} color={color} />
            ),
          }}
        />
      </Tabs>
      <TweaksSheet
        visible={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
      />
    </>
  );
}
