// Web variant of the equation renderer — sandboxed iframe, height reported
// back via postMessage from the shared HTML.
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { apiHost } from "../store/ApiLink";
import { buildEquationHtml } from "./mathViewHtml";

export function MathView({ latex, color, fontSize = 18 }) {
  const [height, setHeight] = useState(64);
  const frameRef = useRef(null);
  const html = useMemo(
    () => buildEquationHtml(latex, color, fontSize, apiHost),
    [latex, color, fontSize]
  );

  useEffect(() => {
    function onMessage(event) {
      const h = event?.data?.neuropalEqHeight;
      if (
        Number.isFinite(h) &&
        h > 20 &&
        h < 800 &&
        frameRef.current &&
        event.source === frameRef.current.contentWindow
      ) {
        setHeight(h + 8);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <View style={{ height }}>
      <iframe
        ref={frameRef}
        srcDoc={html}
        title="Equation"
        sandbox="allow-scripts"
        style={{
          border: "none",
          width: "100%",
          height: "100%",
          background: "transparent",
        }}
      />
    </View>
  );
}
