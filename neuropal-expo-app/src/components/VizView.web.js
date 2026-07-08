// Web renderer for visualizer templates — react-native-webview has no web
// implementation, so an iframe hosts the same self-contained HTML.
import { View } from "react-native";

export function VizView({ html }) {
  return (
    <View style={{ flex: 1 }}>
      <iframe
        srcDoc={html}
        title="Physics visualizer"
        sandbox="allow-scripts"
        style={{ border: "none", width: "100%", height: "100%", background: "#131313" }}
      />
    </View>
  );
}
