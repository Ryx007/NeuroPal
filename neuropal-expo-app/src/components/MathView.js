// Block-equation renderer (D9) — KaTeX inside a transparent WebView, assets
// served by the backend (`/katex/*`) so it works offline on the LAN. Height
// auto-adjusts via postMessage. Web resolves MathView.web.js instead.
import { memo, useMemo, useState } from "react";
import { WebView } from "react-native-webview";

import { apiHost } from "../store/ApiLink";
import { buildEquationHtml } from "./mathViewHtml";

// memo (P7): the reader body re-renders on every karaoke tick — equation
// WebViews with unchanged latex must not even enter reconciliation.
export const MathView = memo(function MathView({ latex, color, fontSize = 18 }) {
  const [height, setHeight] = useState(64);
  const html = useMemo(
    () => buildEquationHtml(latex, color, fontSize, apiHost),
    [latex, color, fontSize]
  );

  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html }}
      scrollEnabled={false}
      style={{ height, backgroundColor: "transparent" }}
      containerStyle={{ backgroundColor: "transparent" }}
      javaScriptEnabled
      onMessage={(event) => {
        const h = parseInt(event.nativeEvent.data, 10);
        if (Number.isFinite(h) && h > 20 && h < 800) setHeight(h + 8);
      }}
    />
  );
});
