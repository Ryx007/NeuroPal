// Home dashboard: state check-in, resume reading, MVD tasks, anchor

function StateChip({ state }) {
  const meta = {
    green: { color: "#7ed4a8", label: "Green · regulated" },
    yellow: { color: "#ffcd6b", label: "Yellow · mild load" },
    red: { color: "var(--error)", label: "Red · dysregulated" },
  }[state];
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 12px", borderRadius: 999,
      background: "color-mix(in oklab, var(--surface-container) 80%, transparent)",
      border: "1px solid color-mix(in oklab, var(--outline-variant) 20%, transparent)",
      fontSize: 12, fontFamily: "var(--font-mono)",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
      {meta.label}
    </div>
  );
}

function StateCheckIn({ state, setState }) {
  const rows = [
    { id: "green",  icon: "sentiment_satisfied",        label: "I feel okay",       sub: "Regulated and ready", color: "#7ed4a8", glow: "rgba(126,212,168,0.15)" },
    { id: "yellow", icon: "sentiment_neutral",          label: "A bit off",         sub: "Some friction, not overwhelmed", color: "#ffcd6b", glow: "rgba(255,205,107,0.15)" },
    { id: "red",    icon: "sentiment_very_dissatisfied",label: "Help, I'm overwhelmed", sub: "Route me to TIPP or grounding", color: "var(--error)", glow: "rgba(255,180,171,0.15)" },
  ];
  return (
    <div style={{
      background: "var(--surface-low)",
      borderRadius: 28, padding: 28,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", color: "var(--outline)" }}>MODULE 2 · STATE</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "4px 0 0", fontWeight: 600 }}>How are you right now?</h3>
        </div>
        <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>3-tap check-in · ~8 sec</div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map(r => {
          const active = state === r.id;
          return (
            <button key={r.id} onClick={() => setState(r.id)}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: 16, borderRadius: 18,
                background: active ? `color-mix(in oklab, ${r.color} 14%, var(--surface-container))` : "var(--surface-container)",
                border: active ? `1px solid ${r.color}` : "1px solid color-mix(in oklab, var(--outline-variant) 15%, transparent)",
                color: "var(--on-surface)", textAlign: "left",
                cursor: "pointer", fontFamily: "var(--font-body)",
                transition: "background 0.2s, border-color 0.2s, transform 0.1s",
              }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `color-mix(in oklab, ${r.color} 18%, transparent)`,
                display: "grid", placeItems: "center",
                boxShadow: active ? `0 0 20px ${r.glow}` : "none",
              }}>
                <span className="material-symbols-outlined" style={{ color: r.color, fontSize: 24 }}>{r.icon}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>{r.sub}</div>
              </div>
              {active && <span className="material-symbols-outlined" style={{ color: r.color, fontSize: 20 }}>check_circle</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResumeCard({ onOpen }) {
  return (
    <div
      onClick={onOpen}
      style={{
        background: "linear-gradient(135deg, color-mix(in oklab, var(--primary-container) 40%, var(--surface-container)) 0%, var(--surface-low) 100%)",
        borderRadius: 28, padding: 28,
        position: "relative", overflow: "hidden",
        cursor: "pointer",
      }}>
      <div style={{ position: "absolute", right: -30, bottom: -30, width: 200, height: 200, borderRadius: "50%", background: "var(--accent)", filter: "blur(80px)", opacity: 0.15 }} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", color: "var(--accent)", marginBottom: 8 }}>
        <span className="data-pulse" style={{ marginRight: 8 }} />RESUME READING
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 8 }}>
        Neuroplasticity and the Architecture of Attention
      </div>
      <div style={{ fontSize: 13, color: "var(--on-surface-variant)", marginBottom: 18 }}>
        §2 Prefrontal Mediation · paragraph 1 · 45% through
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 999, background: "color-mix(in oklab, var(--outline-variant) 40%, transparent)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: "45%", background: "var(--accent)", boxShadow: "0 0 10px var(--accent-glow)" }} />
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>6:30 left · 225 wpm</div>
        <button className="btn-primary" style={{ padding: "10px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <span className="material-symbols-outlined msym-fill" style={{ fontSize: 16 }}>play_arrow</span> Continue
        </button>
      </div>
    </div>
  );
}

function MVDCard() {
  const [tasks, setTasks] = useState([
    { id: 1, title: "Hydrate", sub: "2 glasses left", done: false },
    { id: 2, title: "Meds · morning", sub: "Atomoxetine 40mg", done: true },
    { id: 3, title: "Walk outside", sub: "10 min, any pace", done: false },
    { id: 4, title: "One deep block", sub: "25 min reader", done: false },
  ]);
  const toggle = (id) => setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const doneCount = tasks.filter(t => t.done).length;

  return (
    <div style={{
      background: "var(--surface-low)",
      borderRadius: 28, padding: 28,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", color: "var(--outline)" }}>MODULE 1 · SCAFFOLD</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "4px 0 0", fontWeight: 600 }}>Minimum Viable Day</h3>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)" }}>
          {doneCount}/{tasks.length} · {tasks.length - doneCount} remaining
        </div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {tasks.map(t => (
          <div key={t.id} onClick={() => toggle(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "14px 16px",
              background: "var(--surface-container)",
              borderRadius: 16,
              border: "1px solid color-mix(in oklab, var(--outline-variant) 12%, transparent)",
              cursor: "pointer",
              opacity: t.done ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              border: t.done ? "none" : "2px solid color-mix(in oklab, var(--accent) 50%, transparent)",
              background: t.done ? "var(--accent)" : "transparent",
              display: "grid", placeItems: "center",
            }}>
              {t.done && <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--on-primary)" }}>check</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>{t.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnchorCard() {
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      borderRadius: 28, padding: 28,
      background: "color-mix(in oklab, var(--tertiary-container) 25%, var(--surface-container))",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", color: "var(--tertiary)", marginBottom: 6 }}>NEXT ANCHOR</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Lunch · 1:00 PM</div>
        <div style={{ fontSize: 12, color: "var(--on-surface-variant)", display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>
          In 45 minutes · then a 10 min walk
        </div>
      </div>
      <div style={{
        width: 56, height: 56, borderRadius: 18,
        background: "color-mix(in oklab, var(--tertiary) 20%, transparent)",
        display: "grid", placeItems: "center",
      }}>
        <span className="material-symbols-outlined msym-fill" style={{ color: "var(--tertiary)", fontSize: 28 }}>anchor</span>
      </div>
      <div style={{ position: "absolute", right: -20, bottom: -20, width: 160, height: 160, borderRadius: "50%", background: "var(--tertiary)", filter: "blur(60px)", opacity: 0.15 }} />
    </div>
  );
}

function Home({ setRoute, state, setState }) {
  return (
    <div style={{ padding: "8px 40px 60px", overflow: "auto", height: "100%" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 20 }}>

        {/* State-aware banner */}
        {state === "yellow" && (
          <div className="fade-up" style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "14px 18px", borderRadius: 16,
            background: "color-mix(in oklab, #ffcd6b 12%, var(--surface-container))",
            border: "1px solid color-mix(in oklab, #ffcd6b 30%, transparent)",
            fontSize: 14,
          }}>
            <span className="material-symbols-outlined" style={{ color: "#ffcd6b", fontSize: 20 }}>waving_hand</span>
            <div style={{ flex: 1 }}>
              You're in <b>yellow</b>. Want a 20-minute cocoon session with bigger type and slower TTS?
            </div>
            <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setRoute("reader")}>
              Start cocoon
            </button>
            <button onClick={() => setState("green")} style={{
              background: "transparent", border: "none", color: "var(--outline)", cursor: "pointer", fontSize: 12, fontFamily: "var(--font-mono)",
            }}>Dismiss</button>
          </div>
        )}

        <ResumeCard onOpen={() => setRoute("reader")} />

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 20 }}>
          <StateCheckIn state={state} setState={setState} />
          <div style={{ display: "grid", gap: 20, gridAutoRows: "min-content" }}>
            <AnchorCard />
            <MVDCard />
          </div>
        </div>

        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", color: "var(--outline)", padding: "20px 0 4px" }}>
          RECENT
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {LIBRARY_ITEMS.slice(0, 3).map(item => (
            <div key={item.id} onClick={() => setRoute("library")} style={{
              background: "var(--surface-low)",
              borderRadius: 18, padding: 18,
              cursor: "pointer",
              border: "1px solid color-mix(in oklab, var(--outline-variant) 12%, transparent)",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--on-surface-variant)", marginBottom: 8 }}>{item.kind.toUpperCase()}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, lineHeight: 1.25, marginBottom: 6, textWrap: "pretty" }}>{item.title}</div>
              <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginBottom: 12 }}>{item.authors}</div>
              <div style={{ height: 2, background: "color-mix(in oklab, var(--outline-variant) 30%, transparent)", borderRadius: 999 }}>
                <div style={{ height: "100%", width: `${item.progress * 100}%`, background: "var(--accent)", borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Home });
