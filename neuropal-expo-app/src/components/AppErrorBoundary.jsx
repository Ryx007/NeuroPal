import { Component } from "react";
import { Pressable, ScrollView, Text } from "react-native";

import { applyAppearance } from "../store/appearance";
import { normalizeAppearance } from "../theme/tokens";

// Last line of defence: a render error anywhere below shows this screen
// instead of a blank app. It draws with fixed colours (the theme itself may
// be what broke), and offers to reset the look — a corrupt synced appearance
// is the one cause the user can't otherwise get out of. The reset is stamped
// now, so it also replaces the bad copy on the server at the next sync.
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[NeuroPal] a screen crashed:", error, info?.componentStack);
  }

  retry = () => this.setState({ error: null });

  resetLook = () => {
    try {
      this.props.store.dispatch(applyAppearance(normalizeAppearance({ updatedAt: new Date().toISOString() })));
    } catch (e) {
      // even if the store is unhappy, still try to render again
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const button = (label, onPress, primary) => (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={{
          minHeight: 48,
          paddingHorizontal: 18,
          marginTop: 12,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: primary ? "#FF7F8E" : "transparent",
          borderWidth: primary ? 0 : 1.5,
          borderColor: "#9F8D91",
        }}
      >
        <Text style={{ color: primary ? "#4A0316" : "#E4E2E1", fontSize: 16, fontWeight: "600" }}>{label}</Text>
      </Pressable>
    );
    return (
      <ScrollView style={{ flex: 1, backgroundColor: "#131313" }} contentContainerStyle={{ padding: 24, paddingTop: 72 }}>
        <Text accessibilityRole="header" style={{ color: "#E4E2E1", fontSize: 26, fontWeight: "700" }}>
          Something broke on this screen
        </Text>
        <Text style={{ color: "#D0C6C8", fontSize: 16, lineHeight: 23, marginTop: 10 }}>
          Your documents, notes and progress are safe. Try again, or reset the look (skin, colours, Pal and Home layout) to the
          defaults if this keeps happening.
        </Text>
        {button("Try again", this.retry, true)}
        {button("Reset the look", this.resetLook, false)}
        <Text selectable style={{ color: "#9F8D91", fontSize: 12, marginTop: 24 }}>
          {String(error?.message || error).slice(0, 300)}
        </Text>
      </ScrollView>
    );
  }
}
