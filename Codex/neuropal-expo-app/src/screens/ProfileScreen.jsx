import { MaterialIcons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { ScrollView, Text, View } from "react-native";

import { SectionHeader, NpGhostButton } from "../components/primitives";
import { selectOnboardingState } from "../store/selectors";
import { usePalette } from "../theme/ThemeProvider";

export function ProfileScreen() {
  const palette = usePalette();
  const { conditions, energyPattern, primaryUse } =
    useSelector(selectOnboardingState);

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
      <Text
        style={{
          color: palette.onSurface,
          fontFamily: "SpaceGrotesk_700Bold",
          fontSize: 34,
          letterSpacing: -0.8,
        }}
      >
        Profile
      </Text>
      <View style={{ height: 20 }} />

      <ProfileCard
        title="Conditions"
        value={
          conditions.length === 0
            ? "Not set"
            : conditions.join(" · ").toUpperCase()
        }
      />
      <ProfileCard title="Energy pattern" value={energyPattern || "Not set"} />
      <ProfileCard title="Primary use" value={primaryUse || "Not set"} />

      <View style={{ height: 24 }} />
      <SectionHeader label="Privacy" />
      <View style={{ height: 10 }} />
      <View
        style={{
          padding: 18,
          borderRadius: 20,
          backgroundColor: palette.surfaceContainer,
        }}
      >
        <Text
          style={{
            color: palette.onSurface,
            fontFamily: "SpaceGrotesk_600SemiBold",
            fontSize: 16,
          }}
        >
          Your data stays private and local-first.
        </Text>
        <View style={{ height: 6 }} />
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            lineHeight: 20,
          }}
        >
          NeuroPal uses persisted local state for this prototype. API requests
          route through a shared axios module and can point at your backend
          when `EXPO_PUBLIC_API_BASE_URL` is configured.
        </Text>
        <View style={{ height: 12 }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <NpGhostButton label="Export my data" icon="download" onPress={() => {}} />
          <NpGhostButton label="Delete account" icon="delete-outline" onPress={() => {}} />
        </View>
      </View>
    </ScrollView>
  );
}

function ProfileCard({ title, value }) {
  const palette = usePalette();

  return (
    <View
      style={{
        padding: 16,
        marginBottom: 10,
        borderRadius: 16,
        backgroundColor: palette.surfaceContainer,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_500Medium",
            fontSize: 11,
            letterSpacing: 2,
          }}
        >
          {title.toUpperCase()}
        </Text>
        <View style={{ height: 4 }} />
        <Text
          style={{
            color: palette.onSurface,
            fontFamily: "Inter_600SemiBold",
            fontSize: 15,
          }}
        >
          {value}
        </Text>
      </View>
      <MaterialIcons name="edit" size={18} color={palette.outline} />
    </View>
  );
}
