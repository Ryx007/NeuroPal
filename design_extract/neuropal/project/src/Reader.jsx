// ─────────────────────────────────────────────────────────────────────
// Reader — the heart of NeuroPal
// Features: karaoke TTS, inline margin Q&A, minimap, tactile controls,
// 3 layouts (split / focus / paginated), citation graph, focus modes.
// ─────────────────────────────────────────────────────────────────────

// Split a paragraph into spans of words so we can karaoke-highlight
function tokenize(text) {
  // Split on whitespace but keep the whitespace attached to preceding word
  const parts = [];
  let cur = "";
  for (const ch of text) {
    cur += ch;
    if (ch === " ") { parts.push(cur); cur = ""; }
  }
  if (cur) parts.push(cur);
  return parts;
}

// Flatten sections → array of { paraId, word, wIdx, sectionIdx }
function flattenWords(paper) {
  const out = [];
  paper.sections.forEach((s, si) => {
    s.paragraphs.forEach(p => {
      const words = tokenize(p.text);
      words.forEach((w, wi) => out.push({ paraId: p.id, sectionIdx: si, word: w, wIdx: wi, paraWords: words.length }));
    });
  });
  return out;
}

// ─── Tactile playback controls ────────────────────────────────────────
function PlaybackBar({ playing, onPlay, wpm, setWpm, voice, setVoice, onSeekBack, onSeekFwd, progress, onFocusMode, focusMode, onChat, chatOpen, compact }) {
  return (
    <div className="glass" style={{
      display: "flex", alignItems: "center", gap: compact ? 10 : 18,
      padding: compact ? "10px 14px" : "14px 20px",
      borderRadius: 24,
      boxShadow: "0 -8px 40px -12px rgba(0,0,0,0.5)",
    }}>
      {/* Transport */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={onSeekBack} style={ctrlBtn()}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>fast_rewind</span>
        </button>
        <button onClick={onPlay} style={{
          width: 48, height: 48, borderRadius: 999,
          background: "linear-gradient(135deg, var(--primary), var(--primary-container))",
          border: "none", cursor: "pointer",
          display: "grid", placeItems: "center",
          boxShadow: "0 0 24px var(--accent-glow)",
          color: "var(--on-primary)",
        }}>
          <span className="material-symbols-outlined msym-fill" style={{ fontSize: 26 }}>
            {playing ? "pause" : "play_arrow"}
          </span>
        </button>
        <button onClick={onSeekFwd} style={ctrlBtn()}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>fast_forward</span>
        </button>
      </div>

      {/* EQ indicator */}
      {!compact && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22, width: 32 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="eq-bar" style={{
              height: "100%",
              animationDelay: `${i * 0.12}s`,
              animationPlayState: playing ? "running" : "paused",
              opacity: playing ? 1 : 0.3,
            }} />
          ))}
        </div>
      )}

      {/* WPM slider */}
      <div style={{ flex: 1, minWidth: compact ? 100 : 180, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--outline)" }}>WPM</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{wpm}</span>
        </div>
        <input
          type="range" className="np-range"
          min={120} max={380} step={5} value={wpm}
          onChange={(e) => setWpm(parseInt(e.target.value))}
          style={{ "--val": `${((wpm - 120) / (380 - 120)) * 100}%` }}
        />
      </div>

      {/* Voice chips */}
      {!compact && (
        <div style={{ display: "flex", gap: 2, background: "var(--surface-lowest)", borderRadius: 12, padding: 3 }}>
          {["Natural", "Soft", "Deep"].map(v => (
            <button key={v} onClick={() => setVoice(v.toLowerCase())}
              style={{
                padding: "6px 12px", borderRadius: 9,
                background: voice === v.toLowerCase() ? "color-mix(in oklab, var(--accent) 15%, transparent)" : "transparent",
                color: voice === v.toLowerCase() ? "var(--accent)" : "var(--on-surface-variant)",
                border: voice === v.toLowerCase() ? "1px solid color-mix(in oklab, var(--accent) 30%, transparent)" : "1px solid transparent",
                fontSize: 11, fontFamily: "var(--font-display)", fontWeight: 500, cursor: "pointer",
              }}>{v}</button>
          ))}
        </div>
      )}

      <div style={{ width: 1, height: 32, background: "color-mix(in oklab, var(--outline-variant) 30%, transparent)" }} />

      {/* Focus mode toggle */}
      <button onClick={onFocusMode} style={{
        ...ctrlBtn(),
        background: focusMode ? "color-mix(in oklab, var(--accent) 15%, transparent)" : "transparent",
        color: focusMode ? "var(--accent)" : "var(--on-surface-variant)",
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>center_focus_strong</span>
      </button>
      <button onClick={onChat} style={{
        ...ctrlBtn(),
        background: chatOpen ? "color-mix(in oklab, var(--accent) 15%, transparent)" : "transparent",
        color: chatOpen ? "var(--accent)" : "var(--on-surface-variant)",
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>forum</span>
      </button>
    </div>
  );
}

function ctrlBtn() {
  return {
    width: 40, height: 40, borderRadius: 12,
    background: "transparent", border: "none",
    color: "var(--on-surface-variant)", cursor: "pointer",
    display: "grid", placeItems: "center",
    transition: "background 0.2s, color 0.2s",
  };
}

// ─── Paragraph with karaoke words ─────────────────────────────────────
function ReadableParagraph({ p, state, anchored, onSelect }) {
  // state: { currentParaId, currentWord, progress (by word index inside paper) }
  const words = useMemo(() => tokenize(p.text), [p.text]);
  const isCurrent = state.currentParaId === p.id;
  const handleMouseUp = (e) => {
    const sel = window.getSelection().toString().trim();
    if (sel.length > 3) onSelect?.(sel, p.id, { x: e.clientX, y: e.clientY });
  };

  return (
    <p
      data-para={p.id}
      onMouseUp={handleMouseUp}
      className={anchored ? "para-anchored" : ""}
      style={{
        fontFamily: "var(--font-reader)",
        fontSize: "var(--reader-size)",
        lineHeight: "var(--reader-line)",
        letterSpacing: "var(--reader-letter)",
        textWrap: "pretty",
        margin: "0 0 1.2em",
        color: "var(--on-surface)",
      }}
    >
      {words.map((w, wi) => {
        let cls = "word-pending";
        if (isCurrent && wi < state.currentWord) cls = "word-read";
        else if (isCurrent && wi === state.currentWord) cls = "word-current";
        else if (!isCurrent && state.paraIdsRead.has(p.id)) cls = "word-read";
        return <span key={wi} className={cls}>{w}</span>;
      })}
    </p>
  );
}

// ─── Inline margin note (chat answer) ─────────────────────────────────
function MarginNote({ note }) {
  return (
    <div className="margin-note fade-up">
      <span className="nm-q">Q · {note.q}</span>
      <div>{note.a}</div>
      <div className="nm-cite">↪ {note.cite}</div>
    </div>
  );
}

// ─── Citation graph overlay ───────────────────────────────────────────
function CitationGraph({ onClose }) {
  const g = CITATION_GRAPH;
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 80,
      background: "color-mix(in oklab, var(--surface) 85%, transparent)",
      backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column", padding: 40,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", color: "var(--outline)" }}>
            <span className="data-pulse" style={{ marginRight: 8 }} />CITATION GRAPH
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>
            References & cross-paper links
          </div>
        </div>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={onClose}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: "-2px", marginRight: 4 }}>close</span>Close
        </button>
      </div>

      <div style={{ flex: 1, position: "relative", background: "var(--surface-low)", borderRadius: 20, overflow: "hidden" }}>
        {/* Edges */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {g.nodes.map((n, i) => (
            <line key={i} className="cite-edge"
              x1={`${g.center.x}%`} y1={`${g.center.y}%`}
              x2={`${n.x}%`} y2={`${n.y}%`}
              strokeDasharray={n.cat === "cross" ? "4 4" : "none"}
            />
          ))}
        </svg>

        {/* Center */}
        <div className="cite-node" style={{
          left: `${g.center.x}%`, top: `${g.center.y}%`,
          width: 140, height: 140, marginLeft: -70, marginTop: -70,
          background: "linear-gradient(135deg, var(--primary), var(--primary-container))",
          display: "grid", placeItems: "center",
          boxShadow: "0 0 40px var(--accent-glow)",
          color: "var(--on-primary)",
          padding: 10, textAlign: "center",
          fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, lineHeight: 1.2,
        }}>
          Neuroplasticity and the Architecture of Attention
        </div>

        {/* Nodes */}
        {g.nodes.map(n => {
          const colorByCat = {
            foundation: "var(--secondary)",
            direct: "var(--primary)",
            self: "var(--tertiary)",
            cross: "var(--warn)",
          };
          return (
            <div key={n.id} className="cite-node" style={{
              left: `${n.x}%`, top: `${n.y}%`,
              width: 70, height: 70, marginLeft: -35, marginTop: -35,
              background: `color-mix(in oklab, ${colorByCat[n.cat]} 18%, var(--surface-container))`,
              border: `1px solid ${colorByCat[n.cat]}`,
              color: colorByCat[n.cat],
              display: "grid", placeItems: "center", textAlign: "center",
              fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 10.5, lineHeight: 1.15,
              padding: 6,
            }}>
              {n.label}
            </div>
          );
        })}

        {/* Legend */}
        <div style={{
          position: "absolute", left: 20, bottom: 20,
          display: "flex", gap: 16, padding: "10px 16px",
          background: "var(--surface-container)", borderRadius: 14,
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)",
        }}>
          {[
            ["var(--secondary)", "Foundational"],
            ["var(--primary)", "Direct citation"],
            ["var(--tertiary)", "Self-citation"],
            ["var(--warn)", "Cross-paper · your library"],
          ].map(([c, l]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: c }} /> {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Minimap / progress rail ──────────────────────────────────────────
function Minimap({ paper, currentSection, progress, onJump }) {
  return (
    <div style={{
      width: 200, display: "flex", flexDirection: "column", gap: 14,
      padding: "20px 0",
      alignSelf: "stretch",
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--outline)", letterSpacing: "0.14em" }}>
        {Math.round(progress * 100)}% · §{currentSection + 1}/{paper.sections.length}
      </div>
      <div style={{ flex: 1, display: "flex", gap: 14, minHeight: 0 }}>
        {/* vertical track */}
        <div style={{
          width: 6, position: "relative",
          background: "color-mix(in oklab, var(--outline-variant) 30%, transparent)",
          borderRadius: 999,
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0,
            height: `${progress * 100}%`,
            background: "linear-gradient(180deg, var(--accent), color-mix(in oklab, var(--accent) 40%, transparent))",
            borderRadius: 999, boxShadow: "0 0 10px var(--accent-glow)",
          }} />
          {paper.sections.map((s, i) => {
            const y = (i / Math.max(paper.sections.length - 1, 1)) * 100;
            return (
              <div key={s.id} style={{
                position: "absolute", left: -6, right: -6,
                top: `${y}%`, height: 2,
                background: i === currentSection ? "var(--accent)" : "var(--on-surface-variant)",
                opacity: i === currentSection ? 1 : 0.3,
                boxShadow: i === currentSection ? "0 0 8px var(--accent-glow)" : "none",
              }} />
            );
          })}
        </div>
        {/* Labels as a natural flex column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "2px 0", minWidth: 0 }}>
          {paper.sections.map((s, i) => (
            <button key={s.id} onClick={() => onJump(i)}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                color: i === currentSection ? "var(--accent)" : "var(--on-surface-variant)",
                fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em",
                textAlign: "left", padding: 0, whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis",
                opacity: i === currentSection ? 1 : 0.55,
                lineHeight: 1.3,
              }}>
              {String(i + 1).padStart(2, "0")} · {s.heading}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Focus-mode cocoon (vignette overlay) ─────────────────────────────
function CocoonVignette() {
  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5,
      background: "radial-gradient(circle at 50% 50%, transparent 0%, transparent 40%, color-mix(in oklab, var(--surface) 85%, transparent) 100%)",
    }} />
  );
}

// ─── Main Reader component ────────────────────────────────────────────
function Reader({ activePaper, layout, chatBehavior, focusModeOn, setFocusModeOn }) {
  const paper = activePaper === "phys-1" ? PHYSICS_PAPER : NEURO_PAPER;
  const notes = activePaper === "phys-1" ? PHYSICS_NOTES : NEURO_NOTES;
  const seedChat = activePaper === "phys-1" ? SEED_CHAT_PHYSICS : SEED_CHAT_NEURO;

  // Build flat word stream
  const flat = useMemo(() => flattenWords(paper), [paper]);
  const totalWords = flat.length;

  // Playback state
  const [wpm, setWpm] = useState(window.__TWEAKS__.wpm || 225);
  const [voice, setVoice] = useState(window.__TWEAKS__.voice || "soft");
  const [playing, setPlaying] = useState(false);
  const [gIdx, setGIdx] = useState(14); // global word index into flat[]

  // Inline chat
  const [showNotes, setShowNotes] = useState(true);
  const [showGraph, setShowGraph] = useState(false);
  const [askChip, setAskChip] = useState(null); // {text, paraId, x, y}
  const [pendingNotes, setPendingNotes] = useState([...notes]); // which notes to render

  // Paginated page
  const [page, setPage] = useState(0);

  // Tick
  useEffect(() => {
    if (!playing) return;
    const ms = (60 / wpm) * 1000; // per word
    const t = setInterval(() => {
      setGIdx(i => Math.min(i + 1, totalWords - 1));
    }, ms);
    return () => clearInterval(t);
  }, [playing, wpm, totalWords]);

  // Stop at end
  useEffect(() => {
    if (gIdx >= totalWords - 1) setPlaying(false);
  }, [gIdx, totalWords]);

  // Derived: currentParaId, currentWord, paraIdsRead, sectionIdx, progress
  const cur = flat[gIdx] || flat[0];
  const paraIdsRead = useMemo(() => {
    const s = new Set();
    for (let i = 0; i < gIdx; i++) {
      const w = flat[i];
      if (w && w.paraId !== cur.paraId) s.add(w.paraId);
    }
    return s;
  }, [gIdx, flat, cur.paraId]);

  const progress = gIdx / Math.max(totalWords - 1, 1);
  const currentSection = cur.sectionIdx;

  const readState = { currentParaId: cur.paraId, currentWord: cur.wIdx, paraIdsRead };

  const onSelect = (text, paraId, pos) => {
    setAskChip({ text: text.slice(0, 60), paraId, x: pos.x, y: pos.y });
  };
  const commitAsk = () => {
    if (!askChip) return;
    const newNote = {
      anchorPara: askChip.paraId,
      q: `"${askChip.text}" — what does this mean?`,
      a: "This passage sits in the broader argument that attention is a multi-system orchestra; the term refers to the author's specific sub-claim that re-entry cost, not drift itself, is the right design target. See §4 for the full argument.",
      cite: "§derived · generated just now",
    };
    setPendingNotes(n => [...n, newNote]);
    setAskChip(null);
  };

  const togglePlay = () => setPlaying(p => !p);
  const seekBack = () => setGIdx(i => Math.max(i - 30, 0));
  const seekFwd = () => setGIdx(i => Math.min(i + 30, totalWords - 1));
  const jumpSection = (si) => {
    const first = flat.findIndex(w => w.sectionIdx === si);
    if (first >= 0) setGIdx(first);
  };

  // Render paper body (used by split & focus layouts)
  const renderBody = (withMargin) => (
    <article style={{
      maxWidth: withMargin ? "none" : 720,
      display: "grid",
      gridTemplateColumns: withMargin ? "minmax(0, 680px) 300px" : "1fr",
      columnGap: 40,
      rowGap: 0,
      margin: "0 auto",
    }}>
      {/* Header spans full width */}
      <header style={{ gridColumn: "1 / -1", marginBottom: 32 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--outline)", letterSpacing: "0.18em", marginBottom: 10 }}>
          {paper.journal} · {paper.year} · {paper.minutes} MIN
        </div>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(28px, 3.6vw, 46px)",
          fontWeight: 600, letterSpacing: "-0.03em",
          margin: "0 0 14px", lineHeight: 1.1, textWrap: "balance",
        }}>{paper.title}</h1>
        <div style={{ fontSize: 13, color: "var(--on-surface-variant)", display: "flex", gap: 14 }}>
          <span>{paper.authors.join(" · ")}</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>DOI {paper.doi}</span>
        </div>
        <div style={{ height: 1, background: "linear-gradient(90deg, var(--accent) 0%, transparent 40%)", marginTop: 22 }} />
      </header>

      {/* Sections → paragraphs interleaved with margin notes */}
      {paper.sections.map(s => (
        <React.Fragment key={s.id}>
          <h2 style={{
            gridColumn: "1",
            fontFamily: "var(--font-display)",
            fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em",
            margin: "28px 0 14px",
            color: "var(--accent)",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--outline)", letterSpacing: "0.14em", marginRight: 10 }}>§{paper.sections.indexOf(s) + 1}</span>
            {s.heading}
          </h2>
          {withMargin && <div />}
          {s.paragraphs.map(p => {
            const anchoredNotes = withMargin && showNotes ? pendingNotes.filter(n => n.anchorPara === p.id) : [];
            return (
              <React.Fragment key={p.id}>
                <div style={{ gridColumn: "1", position: "relative" }}>
                  <ReadableParagraph p={p}
                    state={readState}
                    anchored={anchoredNotes.length > 0}
                    onSelect={onSelect}
                  />
                </div>
                {withMargin && (
                  <div style={{ gridColumn: "2", paddingTop: 4, display: "grid", gap: 12, alignContent: "start" }}>
                    {anchoredNotes.map((n, i) => <MarginNote key={i} note={n} />)}
                  </div>
                )}
              </React.Fragment>
            );
          })}
          {s.pullquote && (
            <blockquote style={{
              gridColumn: "1",
              margin: "24px 0",
              padding: "20px 24px",
              borderRadius: 16,
              background: "var(--surface-low)",
              borderLeft: "3px solid var(--accent)",
              fontFamily: "var(--font-reader)",
              fontSize: "calc(var(--reader-size) * 0.95)",
              lineHeight: "var(--reader-line)",
              fontStyle: "italic",
              color: "var(--on-surface-variant)",
            }}>
              "{s.pullquote}"
            </blockquote>
          )}
          {withMargin && s.pullquote && <div />}
        </React.Fragment>
      ))}
    </article>
  );

  // ─── Paginated layout body ──
  const renderPaginated = () => {
    const paras = paper.sections.flatMap(s =>
      [{ type: "h", s }, ...s.paragraphs.map(p => ({ type: "p", p, s }))]
    );
    const perPage = 4;
    const pages = [];
    for (let i = 0; i < paras.length; i += perPage) pages.push(paras.slice(i, i + perPage));
    const pg = pages[Math.min(page, pages.length - 1)];

    return (
      <div style={{ maxWidth: 760, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 30 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--outline)", letterSpacing: "0.18em" }}>
            PAGE {page + 1} / {pages.length}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--on-surface-variant)" }}>
            {paper.title}
          </div>
        </div>
        {pg.map((item, i) => item.type === "h" ? (
          <h2 key={i} style={{
            fontFamily: "var(--font-display)",
            fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em",
            margin: i === 0 ? "0 0 14px" : "28px 0 14px",
            color: "var(--accent)",
          }}>{item.s.heading}</h2>
        ) : (
          <ReadableParagraph key={i} p={item.p} state={readState} anchored={false} onSelect={onSelect} />
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36 }}>
          <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setPage(p => Math.max(p - 1, 0))} disabled={page === 0}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: "-3px", marginRight: 4 }}>chevron_left</span>Previous page
          </button>
          <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setPage(p => Math.min(p + 1, pages.length - 1))} disabled={page >= pages.length - 1}>
            Next page<span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: "-3px", marginLeft: 4 }}>chevron_right</span>
          </button>
        </div>
      </div>
    );
  };

  // ─── Top progress ribbon ──
  const ProgressRibbon = (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 3,
      background: "color-mix(in oklab, var(--outline-variant) 20%, transparent)",
      zIndex: 20,
    }}>
      <div style={{
        height: "100%", width: `${progress * 100}%`,
        background: "linear-gradient(90deg, var(--accent), color-mix(in oklab, var(--accent) 50%, transparent))",
        boxShadow: "0 0 12px var(--accent-glow)",
      }} />
    </div>
  );

  return (
    <div style={{
      position: "relative", height: "100%",
      background: "var(--surface)",
      overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      {ProgressRibbon}

      {/* Header strip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "18px 40px 10px",
        fontSize: 12, color: "var(--on-surface-variant)",
      }}>
        <button style={ctrlBtn()} onClick={() => window.__setRoute?.("library")}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em" }}>
          {paper.kind} · READING IN {voice.toUpperCase()} VOICE
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowGraph(true)} className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "-3px", marginRight: 4 }}>hub</span>
          Citation graph
        </button>
        <button onClick={() => setShowNotes(s => !s)} className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "-3px", marginRight: 4 }}>{showNotes ? "chat_bubble" : "chat_bubble_outline"}</span>
          {showNotes ? "Hide" : "Show"} margin Q&amp;A
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {focusModeOn && <CocoonVignette />}

        {/* Minimap (not on paginated) */}
        {layout !== "paginated" && (
          <div style={{ width: 220, flexShrink: 0, paddingLeft: 28, paddingTop: 20 }}>
            <Minimap paper={paper} currentSection={currentSection} progress={progress} onJump={jumpSection} />
          </div>
        )}

        {/* Scroll region */}
        <div style={{ flex: 1, overflow: "auto", padding: "28px 40px 200px", position: "relative" }}>
          {layout === "paginated" ? renderPaginated() : renderBody(layout === "split" && showNotes)}

          {/* Ask chip (inline) */}
          {askChip && (
            <div className="chip-ask" style={{ top: askChip.y - 40, left: Math.min(askChip.x, window.innerWidth - 280) }} onClick={commitAsk}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
              Ask about "{askChip.text.slice(0, 28)}{askChip.text.length > 28 ? "…" : ""}"
            </div>
          )}
        </div>
      </div>

      {/* Playback dock */}
      <div style={{
        position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
        width: "min(720px, calc(100% - 80px))", zIndex: 30,
      }}>
        <PlaybackBar
          playing={playing}
          onPlay={togglePlay}
          wpm={wpm} setWpm={setWpm}
          voice={voice} setVoice={setVoice}
          onSeekBack={seekBack}
          onSeekFwd={seekFwd}
          progress={progress}
          focusMode={focusModeOn}
          onFocusMode={() => setFocusModeOn(f => !f)}
          chatOpen={showNotes}
          onChat={() => setShowNotes(s => !s)}
        />
      </div>

      {/* Citation graph overlay */}
      {showGraph && <CitationGraph onClose={() => setShowGraph(false)} />}

      {/* Ambient glow */}
      <div style={{
        position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0,
      }}>
        <div style={{ position: "absolute", top: "-10%", right: "-8%", width: "40%", height: "40%", background: "var(--accent)", filter: "blur(140px)", borderRadius: "50%", opacity: 0.05 }} />
        <div style={{ position: "absolute", bottom: "5%", left: "-10%", width: "50%", height: "50%", background: "var(--primary)", filter: "blur(160px)", borderRadius: "50%", opacity: 0.04 }} />
      </div>
    </div>
  );
}

Object.assign(window, { Reader });
