// ─────────────────────────────────────────────────────────────────────
// App shell: left nav rail + routed content area + optional state banner
// ─────────────────────────────────────────────────────────────────────

const { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } = React;

const ROUTES = [
  { id: "home",    label: "Home",     icon: "home" },
  { id: "library", label: "Library",  icon: "book_5" },
  { id: "reader",  label: "Reader",   icon: "chrome_reader_mode" },
  { id: "anchors", label: "Anchors",  icon: "anchor",   stub: true },
  { id: "state",   label: "State",    icon: "monitor_heart", stub: true },
  { id: "chat",    label: "Companion",icon: "auto_awesome", stub: true },
];

function NavRail({ route, setRoute }) {
  return (
    <aside style={{
      width: 244, minWidth: 244,
      background: "var(--surface-low)",
      borderRight: "1px solid color-mix(in oklab, var(--outline-variant) 15%, transparent)",
      display: "flex", flexDirection: "column",
      padding: "28px 18px",
      gap: 6,
      height: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 24px" }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-container) 100%)",
          display: "grid", placeItems: "center",
          boxShadow: "0 0 20px var(--accent-glow)",
        }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--on-primary)", fontSize: 16 }}>N</span>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>NeuroPal</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--outline)", letterSpacing: "0.1em" }}>v0.3 · MVP</div>
        </div>
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--outline)", letterSpacing: "0.14em", padding: "8px 10px" }}>
        PRIMARY
      </div>
      {ROUTES.slice(0, 3).map(r => (
        <div key={r.id}
          className={"nav-item" + (route === r.id ? " active" : "")}
          onClick={() => setRoute(r.id)}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{r.icon}</span>
          <span>{r.label}</span>
        </div>
      ))}

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--outline)", letterSpacing: "0.14em", padding: "20px 10px 8px" }}>
        SCAFFOLD
      </div>
      {ROUTES.slice(3).map(r => (
        <div key={r.id}
          className={"nav-item" + (route === r.id ? " active" : "")}
          onClick={() => setRoute(r.id)}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{r.icon}</span>
          <span>{r.label}</span>
          {r.stub && <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--outline)", letterSpacing: "0.1em" }}>SOON</span>}
        </div>
      ))}

      <div style={{ marginTop: "auto", padding: "14px 10px", borderTop: "1px solid color-mix(in oklab, var(--outline-variant) 15%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: "var(--surface-high)",
            display: "grid", placeItems: "center",
            fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
            color: "var(--accent)",
          }}>AX</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Alex</div>
            <div style={{ fontSize: 11, color: "var(--on-surface-variant)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#ffcd6b", boxShadow: "0 0 6px rgba(255,205,107,0.6)" }} />
              Yellow · mild load
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ route, onTweak, tweaksOn }) {
  const titleMap = {
    home: { eyebrow: "DASHBOARD", title: `Good afternoon, Alex`, sub: "One step at a time." },
    library: { eyebrow: "DOCUMENT LIBRARY", title: "Your reading", sub: "Drop a PDF, EPUB, DOCX or arXiv link anywhere on this page." },
    reader: null,
  };
  const t = titleMap[route];
  if (!t) return null;
  return (
    <div style={{
      padding: "28px 40px 12px",
      display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20,
    }}>
      <div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11,
          color: "var(--outline)", letterSpacing: "0.18em",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span className="data-pulse" /> {t.eyebrow}
        </div>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: 44, letterSpacing: "-0.03em",
          fontWeight: 600, margin: "10px 0 6px",
        }}>{t.title}</h1>
        <div style={{ color: "var(--on-surface-variant)", fontSize: 15 }}>{t.sub}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="btn-ghost" style={{ fontSize: 13, padding: "10px 14px" }}
          onClick={() => onTweak(!tweaksOn)}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: "-3px", marginRight: 6 }}>tune</span>
          Tweaks
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { ROUTES, NavRail, TopBar });
