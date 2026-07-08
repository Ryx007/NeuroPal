// Native renderer for visualizer templates: a WebView with inline HTML.
// Web resolves VizView.web.js (iframe) instead.
import { WebView } from "react-native-webview";

export function VizView({ html }) {
  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html }}
      style={{ flex: 1, backgroundColor: "#131313" }}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      setSupportMultipleWindows={false}
    />
  );
}
