// App — routing + tweaks + host edit-mode bridge + speed-read persistence

const { useState: _us, useEffect: _ue } = React;

function App() {
  const [route, setRoute] = useState(() => localStorage.getItem("np-route") || "home");
  const [tweaksOn, setTweaksOn] = useState(false);
  const [tweaks, setTweaks] = useState(() => ({ ...window.__TWEAKS__ }));
  const [state, setState] = useState("yellow");
  const [activePaper, setActivePaper] = useState(() => localStorage.getItem("np-paper") || "neuro-1");
  const [focusModeOn, setFocusModeOn] = useState(false);

  window.__setRoute = setRoute;

  // Persist route & paper
  useEffect(() => { localStorage.setItem("np-route", route); }, [route]);
  useEffect(() => { localStorage.setItem("np-paper", activePaper); }, [activePaper]);

  // Apply tweaks → CSS vars + data attributes
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = tweaks.theme;
    el.dataset.accent = tweaks.accent;
    el.dataset.readerFont = tweaks.readerFont;
    el.style.setProperty("--reader-size", `${tweaks.fontSize}px`);
    el.style.setProperty("--reader-line", String(tweaks.lineSpacing));
    // density affects reader padding via body class if needed later
  }, [tweaks]);

  // Host edit-mode bridge (MUST register listener before announcing)
  useEffect(() => {
    const onMsg = (ev) => {
      const d = ev.data || {};
      if (d.type === "__activate_edit_mode") setTweaksOn(true);
      if (d.type === "__deactivate_edit_mode") setTweaksOn(false);
    };
    window.addEventListener("message", onMsg);
    window.parent?.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const content = route === "home" ? <Home setRoute={setRoute} state={state} setState={setState} />
    : route === "library" ? <Library setRoute={setRoute} setActivePaper={setActivePaper} />
    : route === "reader" ? <Reader activePaper={activePaper} layout={tweaks.readerLayout} chatBehavior="inline" focusModeOn={focusModeOn} setFocusModeOn={setFocusModeOn} />
    : <StubRoute route={route} setRoute={setRoute} />;

  return (
    <div data-screen-label={route} style={{ display: "flex", height: "100vh", width: "100vw", background: "var(--surface)" }}>
      <NavRail route={route} setRoute={setRoute} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <TopBar route={route} onTweak={setTweaksOn} tweaksOn={tweaksOn} />
        <div style={{ flex: 1, overflow: "hidden" }}>{content}</div>
      </div>
      {tweaksOn && <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} onClose={() => setTweaksOn(false)} />}
    </div>
  );
}

function StubRoute({ route, setRoute }) {
  const meta = {
    anchors: { icon: "anchor", title: "Daily Anchors", sub: "Morning routine, meds, movement, wind-down." },
    state: { icon: "monitor_heart", title: "State log & protocols", sub: "TIPP · ACCEPTS · physiological sigh · grounding. Trend over 30 days." },
    chat: { icon: "auto_awesome", title: "Claude Companion", sub: "Weekly pattern analysis across your framework, state log, and study history. Defers clinical questions." },
  }[route] || { icon: "construction", title: route, sub: "" };
  return (
    <div style={{ padding: 40, overflow: "auto", height: "100%" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", paddingTop: 80 }}>
        <div style={{
          width: 84, height: 84, borderRadius: 24, margin: "0 auto 20px",
          background: "color-mix(in oklab, var(--accent) 15%, var(--surface-container))",
          display: "grid", placeItems: "center",
          boxShadow: "0 0 32px var(--accent-glow)",
        }}>
          <span className="material-symbols-outlined" style={{ color: "var(--accent)", fontSize: 40 }}>{meta.icon}</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--outline)", letterSpacing: "0.18em", marginBottom: 6 }}>
          BUILDING · POST-MVP
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, letterSpacing: "-0.03em", fontWeight: 600, margin: "0 0 10px" }}>{meta.title}</h1>
        <div style={{ color: "var(--on-surface-variant)", fontSize: 15, marginBottom: 24 }}>{meta.sub}</div>
        <button className="btn-ghost" onClick={() => setRoute("reader")}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: "-3px", marginRight: 6 }}>arrow_back</span>
          Back to the Reader
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
