// Tweaks panel — floating, toggleable from the topbar AND the host toolbar

function TweaksPanel({ tweaks, setTweaks, onClose, embedded }) {
  const setK = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    // Persist to host
    window.parent?.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*");
  };

  const Row = ({ label, children }) => (
    <div style={{ display: "grid", gap: 8, padding: "14px 0", borderBottom: "1px solid color-mix(in oklab, var(--outline-variant) 12%, transparent)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--outline)" }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );

  const Pills = ({ value, options, onChange }) => (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          padding: "7px 12px", borderRadius: 10,
          background: value === o.id ? "color-mix(in oklab, var(--accent) 15%, transparent)" : "var(--surface-lowest)",
          color: value === o.id ? "var(--accent)" : "var(--on-surface-variant)",
          border: value === o.id ? "1px solid color-mix(in oklab, var(--accent) 40%, transparent)" : "1px solid color-mix(in oklab, var(--outline-variant) 15%, transparent)",
          fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 500, cursor: "pointer",
        }}>{o.label}</button>
      ))}
    </div>
  );

  return (
    <div className="glass" style={{
      position: "fixed",
      bottom: 24, right: 24,
      width: 340, maxHeight: "calc(100vh - 48px)",
      borderRadius: 20, padding: 20, zIndex: 200,
      overflow: "auto",
      boxShadow: "0 20px 80px -20px rgba(0,0,0,0.6)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--outline)" }}>
            <span className="data-pulse" style={{ marginRight: 6 }} />TWEAKS
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>Reader controls</div>
        </div>
        {!embedded && onClose && (
          <button style={{ background: "transparent", border: "none", color: "var(--on-surface-variant)", cursor: "pointer" }} onClick={onClose}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        )}
      </div>

      <Row label="Theme">
        <Pills value={tweaks.theme} options={[
          { id: "dark", label: "Dark" },
          { id: "sepia", label: "Sepia" },
          { id: "light", label: "Light" },
          { id: "contrast", label: "High contrast" },
        ]} onChange={v => setK("theme", v)} />
      </Row>

      <Row label="Accent hue">
        <div style={{ display: "flex", gap: 8 }}>
          {[
            ["blue", "#b1c5ff"],
            ["cyan", "#a6e6ff"],
            ["purple", "#d6baff"],
            ["green", "#b9e6a8"],
          ].map(([id, hex]) => (
            <button key={id} onClick={() => setK("accent", id)} style={{
              width: 36, height: 36, borderRadius: 12,
              background: hex,
              border: tweaks.accent === id ? "2px solid var(--on-surface)" : "2px solid transparent",
              boxShadow: tweaks.accent === id ? `0 0 16px ${hex}` : "none",
              cursor: "pointer",
            }} />
          ))}
        </div>
      </Row>

      <Row label="Reader font">
        <Pills value={tweaks.readerFont} options={[
          { id: "inter", label: "Inter" },
          { id: "atkinson", label: "Atkinson" },
          { id: "dyslexic", label: "Dyslexia-friendly" },
          { id: "serif", label: "Lora" },
          { id: "fraunces", label: "Fraunces" },
        ]} onChange={v => setK("readerFont", v)} />
      </Row>

      <Row label="Reader layout">
        <Pills value={tweaks.readerLayout} options={[
          { id: "split", label: "Split · inline Q&A" },
          { id: "focus", label: "Focus · cocoon" },
          { id: "paginated", label: "Paginated" },
        ]} onChange={v => setK("readerLayout", v)} />
      </Row>

      <Row label="Density">
        <Pills value={tweaks.density} options={[
          { id: "calm", label: "Calm · sparse" },
          { id: "dense", label: "Dense · info-rich" },
        ]} onChange={v => setK("density", v)} />
      </Row>

      <Row label={`Font size · ${tweaks.fontSize}px`}>
        <input type="range" className="np-range"
          min={14} max={28} step={1} value={tweaks.fontSize}
          onChange={e => setK("fontSize", parseInt(e.target.value))}
          style={{ "--val": `${((tweaks.fontSize - 14) / 14) * 100}%` }}
        />
      </Row>

      <Row label={`Line spacing · ${tweaks.lineSpacing.toFixed(2)}`}>
        <input type="range" className="np-range"
          min={1.3} max={2.2} step={0.05} value={tweaks.lineSpacing}
          onChange={e => setK("lineSpacing", parseFloat(e.target.value))}
          style={{ "--val": `${((tweaks.lineSpacing - 1.3) / 0.9) * 100}%` }}
        />
      </Row>

      <Row label={`TTS speed · ${tweaks.wpm} wpm`}>
        <input type="range" className="np-range"
          min={120} max={380} step={5} value={tweaks.wpm}
          onChange={e => setK("wpm", parseInt(e.target.value))}
          style={{ "--val": `${((tweaks.wpm - 120) / 260) * 100}%` }}
        />
      </Row>

      <Row label="Voice">
        <Pills value={tweaks.voice} options={[
          { id: "natural", label: "Natural" },
          { id: "soft", label: "Soft" },
          { id: "deep", label: "Deep" },
        ]} onChange={v => setK("voice", v)} />
      </Row>

      <div style={{ paddingTop: 12, fontSize: 11, color: "var(--outline)", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
        Changes persist via the host. Toggle Tweaks from the toolbar or the topbar.
      </div>
    </div>
  );
}

Object.assign(window, { TweaksPanel });
