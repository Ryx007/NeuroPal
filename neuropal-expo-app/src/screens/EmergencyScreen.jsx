import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NpPrimaryButton, withAlpha } from "../components/primitives";
import { usePalette } from "../theme/ThemeProvider";

export function EmergencyScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Temperature",
      body: "Splash cold water on your face or hold an ice pack to your eyes and cheeks. This cues the mammalian dive reflex to lower heart rate.",
      minutes: "60 Seconds",
      icon: "ac-unit",
    },
    {
      title: "Intense Exercise",
      body: "Engage in short, high-intensity movement. Burpees, jumping jacks, or running in place. Burn off the excess sympathetic energy.",
      minutes: "2 Minutes",
      icon: "directions-run",
    },
    {
      title: "Paced Breathing",
      body: "Breathe in for 4 seconds, hold for 2, and exhale for 6. Focus on making your exhale longer than your inhale to signal safety to your brain.",
      minutes: "4 Minutes",
      icon: "air",
    },
    {
      title: "Paired Relaxation",
      body: "Tense a muscle group as hard as you can for 5 seconds, then release completely. Notice the sensation of tension leaving your body.",
      minutes: "3 Minutes",
      icon: "accessibility-new",
    },
  ];

  const current = steps[step];

  function exit() {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("Tabs");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#11131A" }}>
      <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={exit} accessibilityLabel="Close emergency protocol">
            <MaterialIcons name="close" size={22} color="#A9B0C3" />
          </Pressable>
          <View style={{ width: 10 }} />
          <Text
            style={{
              color: "#B1C5FF",
              fontFamily: "SpaceGrotesk_700Bold",
              fontSize: 14,
            }}
          >
            NeuroPal
          </Text>
        </View>

        <View style={{ height: 18 }} />
        <Text
          style={{
            color: "#FF8E8E",
            fontFamily: "Inter_600SemiBold",
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          EMERGENCY PROTOCOL
        </Text>
        <View style={{ height: 8 }} />
        <Text
          style={{
            color: "#F2F1F0",
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: 36,
            lineHeight: 38,
          }}
        >
          Red State Regulation
        </Text>
        <View style={{ height: 10 }} />
        <Text
          style={{
            color: "#C3C6D6",
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            lineHeight: 21,
          }}
        >
          When your nervous system is overwhelmed, we focus on physical biology
          first. This protocol is designed to cool your system down and anchor
          your body.
        </Text>

        <View style={{ height: 22 }} />
        <View
          style={{
            padding: 18,
            borderRadius: 24,
            backgroundColor: "#202329",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: withAlpha(palette.primary, 0.12),
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <MaterialIcons name={current.icon} size={22} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: "#F2F1F0",
                  fontFamily: "Inter_700Bold",
                  fontSize: 18,
                }}
              >
                Step {step + 1}: {current.title}
              </Text>
              <View style={{ height: 4 }} />
              <Text
                style={{
                  color: "#8DA1B9",
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 11,
                }}
              >
                {current.minutes}
              </Text>
            </View>
          </View>
          <View style={{ height: 14 }} />
          <Text
            style={{
              color: "#C3C6D6",
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              lineHeight: 21,
            }}
          >
            {current.body}
          </Text>
        </View>

        <View style={{ height: 14 }} />
        <View
          style={{
            padding: 18,
            borderRadius: 20,
            backgroundColor: "#1A1D23",
          }}
        >
          <Text
            style={{
              color: "#D5D9E6",
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              lineHeight: 20,
              textAlign: "center",
              fontStyle: "italic",
            }}
          >
            You are doing a great job managing this moment. This state is
            temporary and your body is capable of finding its way back to calm.
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ flexDirection: "row", gap: 6, marginBottom: 18 }}>
          {steps.map((_, index) => (
            <View
              key={index}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 999,
                backgroundColor:
                  index <= step ? palette.primary : "rgba(255,255,255,0.14)",
              }}
            />
          ))}
        </View>

        {step < steps.length - 1 ? (
          <NpPrimaryButton
            expanded
            label="Next step"
            onPress={() => setStep(step + 1)}
          />
        ) : (
          <NpPrimaryButton expanded label="I feel better" onPress={exit} />
        )}
      </View>
    </SafeAreaView>
  );
}
