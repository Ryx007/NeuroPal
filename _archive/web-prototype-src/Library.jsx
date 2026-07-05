// Document library with upload zone + grid of items

function Library({ setRoute, setActivePaper }) {
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState("all");

  const filtered = LIBRARY_ITEMS.filter(i =>
    filter === "all" ? true :
    filter === "active" ? i.progress > 0 && i.progress < 1 :
    filter === "unread" ? i.progress === 0 : true
  );

  const open = (id) => {
    if (id === "neuro-1" || id === "phys-1") { setActivePaper(id); setRoute("reader"); }
  };

  return (
    <div style={{ padding: "8px 40px 60px", overflow: "auto", height: "100%" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 24 }}>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); }}
          style={{
            padding: 28, borderRadius: 24,
            background: dragging ? "color-mix(in oklab, var(--accent) 12%, var(--surface-low))" : "var(--surface-low)",
            border: dragging ? "2px dashed var(--accent)" : "2px dashed color-mix(in oklab, var(--outline-variant) 30%, transparent)",
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 20, alignItems: "center",
            transition: "background 0.15s, border 0.15s",
          }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18,
            background: "color-mix(in oklab, var(--accent) 15%, transparent)",
            display: "grid", placeItems: "center",
          }}>
            <span className="material-symbols-outlined" style={{ color: "var(--accent)", fontSize: 28 }}>cloud_upload</span>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>Drop to add — PDF · EPUB · DOCX · TXT · arXiv link</div>
            <div style={{ fontSize: 13, color: "var(--on-surface-variant)", marginTop: 4 }}>
              Files are chunked, embedded locally, and indexed for Q&amp;A. Nothing is sent for model training.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "-2px", marginRight: 4 }}>link</span>
              Paste link
            </button>
            <button className="btn-primary" style={{ fontSize: 13, padding: "10px 16px" }}>Browse files</button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, borderBottom: "1px solid color-mix(in oklab, var(--outline-variant) 15%, transparent)" }}>
          {[
            ["all", "All · 4"],
            ["active", "In progress · 3"],
            ["unread", "Unread · 1"],
            ["starred", "Starred"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} style={{
              background: "transparent", border: "none",
              padding: "12px 16px", cursor: "pointer",
              color: filter === id ? "var(--accent)" : "var(--on-surface-variant)",
              fontSize: 13, fontFamily: "var(--font-display)", fontWeight: 500,
              borderBottom: filter === id ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
            }}>{label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 12px", borderRadius: 10,
            background: "var(--surface-low)",
            fontSize: 12, color: "var(--on-surface-variant)",
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
            <span>Search title, author, concept…</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--outline)", border: "1px solid var(--outline-variant)", padding: "1px 6px", borderRadius: 4 }}>⌘K</span>
          </div>
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 18 }}>
          {filtered.map(item => {
            const colorVar = item.color === "primary" ? "var(--primary)" : item.color === "secondary" ? "var(--secondary)" : "var(--tertiary)";
            return (
              <div key={item.id} onClick={() => open(item.id)} style={{
                background: "var(--surface-low)",
                borderRadius: 20, padding: 18,
                border: "1px solid color-mix(in oklab, var(--outline-variant) 12%, transparent)",
                cursor: "pointer",
                display: "flex", flexDirection: "column", gap: 14,
                transition: "transform 0.2s, background 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseLeave={e => e.currentTarget.style.transform = ""}
              >
                {/* Cover placeholder */}
                <div className="ph-image" style={{ aspectRatio: "4/3", fontSize: 10, padding: 10 }}>
                  <div>
                    <div style={{ color: colorVar, fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>
                      {item.title.split(" ").slice(0, 2).join(" ")}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>/cover-art</div>
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: colorVar }}>
                  {item.kind.toUpperCase()}
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, lineHeight: 1.3, textWrap: "pretty" }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>{item.authors}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
                  <div style={{ flex: 1, height: 3, background: "color-mix(in oklab, var(--outline-variant) 30%, transparent)", borderRadius: 999 }}>
                    <div style={{ height: "100%", width: `${item.progress * 100}%`, background: colorVar, borderRadius: 999 }} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
                    {Math.round(item.progress * 100)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Library });
