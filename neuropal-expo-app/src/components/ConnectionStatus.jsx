import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { apiHost, getApiStatus, recheckApi, subscribeApi } from "../store/ApiLink";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "../components/primitives";

// P3 — "what is the app pointed at, and is it alive?" at a glance.
// Renders the active backend host, an overall state line, and every
// candidate address with its last probe result. State is never conveyed by
// colour alone (WCAG 1.4.1): each state has its own text.

const STATE_TEXT = {
  checking: "Checking…",
  ok: "Connected",
  down: "Unreachable",
  unconfigured: "No backend configured",
};

export function ConnectionStatus() {
  const palette = usePalette();
  // ApiLink mutates its status object in place — copy what we render.
  const [snap, setSnap] = useState(() => copyStatus(getApiStatus()));
  // Issue 1: per-dependency backend health (mongo/qdrant/ollama/extractor) —
  // see what's dead BEFORE uploading a 644-page book.
  const [deps, setDeps] = useState(null);

  const fetchDeps = useCallback(async () => {
    try {
      const res = await fetch(`${apiHost}/healthz?deps=1`);
      const data = await res.json();
      setDeps(data?.deps || null);
    } catch (e) {
      setDeps(null);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeApi((s) => {
      setSnap(copyStatus(s));
      if (s.state === "ok") fetchDeps();
    });
    fetchDeps();
    return unsub;
  }, [fetchDeps]);

  // no `success` key in the palette — the dot is decorative reinforcement
  // (state is carried by text), so a fixed green is fine across themes
  const stateColor =
    snap.state === "ok"
      ? "#4CAF82"
      : snap.state === "checking"
        ? palette.onSurfaceVariant
        : palette.error;

  return (
    <View>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Backend ${STATE_TEXT[snap.state] || snap.state}${
          snap.host ? `, ${hostOnly(snap.host)}` : ""
        }`}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: stateColor,
          }}
        />
        <Text
          style={{
            color: palette.onSurface,
            fontFamily: "Inter_600SemiBold",
            fontSize: 15,
          }}
        >
          {STATE_TEXT[snap.state] || snap.state}
        </Text>
      </View>

      {snap.host ? (
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "JetBrainsMono_400Regular",
            fontSize: 12,
            marginTop: 6,
          }}
        >
          {hostOnly(snap.host)}
        </Text>
      ) : null}

      <View style={{ marginTop: 12, gap: 6 }}>
        {snap.candidates.map((c) => {
          const active = c.url === snap.host;
          const result =
            c.ok === null ? "not checked" : c.ok ? `${c.ms} ms` : "unreachable";
          return (
            <View
              key={c.url}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: active
                  ? withAlpha(palette.accent, 0.1)
                  : palette.surfaceLowest,
              }}
              accessibilityRole="text"
              accessibilityLabel={`${hostOnly(c.url)}: ${result}${active ? ", active" : ""}`}
            >
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: active ? palette.accent : palette.onSurfaceVariant,
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 11,
                }}
              >
                {hostOnly(c.url)}
              </Text>
              <Text
                style={{
                  color: c.ok === false ? palette.error : palette.onSurfaceVariant,
                  fontFamily: "Inter_500Medium",
                  fontSize: 11,
                  marginLeft: 10,
                }}
              >
                {result}
              </Text>
            </View>
          );
        })}
      </View>

      {deps ? (
        <View style={{ marginTop: 12, gap: 6 }}>
          {Object.entries(deps).map(([name, d]) => (
            <View
              key={name}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 12,
                backgroundColor: palette.surfaceLowest,
              }}
              accessibilityRole="text"
              accessibilityLabel={`${name}: ${d.up ? "up" : "down"}`}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: d.up ? "#4CAF82" : palette.error,
                  marginRight: 10,
                }}
              />
              <Text
                style={{
                  flex: 1,
                  color: palette.onSurfaceVariant,
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 11,
                }}
              >
                {name}
              </Text>
              <Text
                style={{
                  color: d.up ? palette.onSurfaceVariant : palette.error,
                  fontFamily: "Inter_500Medium",
                  fontSize: 11,
                }}
              >
                {d.up ? `${d.ms} ms` : `down${d.error ? ` — ${d.error}` : ""}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          recheckApi();
          fetchDeps();
        }}
        disabled={snap.state === "checking"}
        accessibilityRole="button"
        accessibilityLabel="Check backend connection now"
        accessibilityState={{ disabled: snap.state === "checking" }}
        style={{
          alignSelf: "flex-start",
          marginTop: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 14,
          backgroundColor: withAlpha(palette.accent, 0.14),
          borderWidth: 1,
          borderColor: withAlpha(palette.accent, 0.4),
          opacity: snap.state === "checking" ? 0.6 : 1,
        }}
      >
        <Text
          style={{
            color: palette.accent,
            fontFamily: "Inter_600SemiBold",
            fontSize: 13,
          }}
        >
          {snap.state === "checking" ? "Checking…" : "Check now"}
        </Text>
      </Pressable>
    </View>
  );
}

function copyStatus(s) {
  return {
    host: s.host,
    state: s.state,
    checkedAt: s.checkedAt,
    candidates: s.candidates.map((c) => ({ ...c })),
  };
}

// http://ryx-mac-mini.tail73ed8.ts.net:4000 → ryx-mac-mini.tail73ed8.ts.net:4000
function hostOnly(url) {
  return String(url).replace(/^https?:\/\//, "");
}
