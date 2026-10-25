"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useAppearance } from "@/components/AppearanceProvider";
import { FieldCanvas } from "@/components/FieldCanvas";
import { ArrowRight, ChevronDown, Play, Undo } from "@/components/icons";
import {
  accentName,
  applyLook,
  cap,
  CLASSIC_ACCENT_NAMES,
  CLASSIC_THEME_NAMES,
  contrastBadge,
  describeAppearance,
  diffAppearance,
  fieldSettings,
  hslToHex,
  hueOf,
  interpretAppearance,
  lookDescription,
  LOOKS,
  matchLook,
  matchPreset,
  normalizeAppearance,
  paletteVars,
  resolveClassicPalette,
  resolvePalette,
  resolveSignalPalette,
  SIGNAL_ACCENTS,
  SIGNAL_BASES,
  SIGNAL_OPTIONS,
  SIGNAL_PRESETS,
  skinAttributes,
  type Appearance,
  type DiffRow,
  type SignalSettings,
} from "@/lib/appearance";
import { appearanceStore } from "@/lib/appearanceStore";
import {
  apiBaseStore,
  getAppearance,
  hostOf,
  mixedContentProblem,
  putAppearance,
  sessionStore,
  type ApiResult,
} from "@/lib/api";
import { useStored } from "@/lib/store";
import styles from "./studio.module.css";

interface Proposal {
  title: string;
  message: string;
  next: Appearance;
  rows: DiffRow[];
  origin: "ask" | `look:${string}`;
}

const CORNER_PX = { Sharp: 3, Soft: 14, Round: 26 } as const;

const FINE_ROWS: { key: Exclude<keyof SignalSettings, "acc">; label: string; options: readonly (string | number)[] }[] = [
  { key: "base", label: "Base", options: SIGNAL_OPTIONS.base },
  { key: "motion", label: "Motion", options: SIGNAL_OPTIONS.motion },
  { key: "field", label: "Background", options: SIGNAL_OPTIONS.field },
  { key: "brutality", label: "Brutality", options: SIGNAL_OPTIONS.brutality },
  { key: "corners", label: "Corners", options: SIGNAL_OPTIONS.corners },
  { key: "texture", label: "Texture", options: SIGNAL_OPTIONS.texture },
  { key: "type", label: "Type", options: SIGNAL_OPTIONS.type },
];

const EXAMPLES = {
  signal: ["Calm it down", "More contrast", "Try orange"],
  classic: ["Warmer", "More contrast", "Make it funky"],
};

const lookButtonId = (name: string) => `look-${name.toLowerCase().replace(/\s+/g, "-")}`;

export function AppearanceStudio() {
  const { appearance, palette, reducedMotion, canUndo, edit, commit, undo } = useAppearance();
  const apiBase = useStored(apiBaseStore);
  const session = useStored(sessionStore);
  const [fineOpen, setFineOpen] = useState(false);
  const [ask, setAsk] = useState("");
  const [askNote, setAskNote] = useState("");
  const [looksNote, setLooksNote] = useState("");
  const [status, setStatus] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [moving, setMoving] = useState(false);
  const [pulseId, setPulseId] = useState(0);
  const [sync, setSync] = useState<{ busy: boolean; message: string; conflict: Appearance | null }>({
    busy: false,
    message: "",
    conflict: null,
  });
  const proposalRef = useRef<HTMLElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLInputElement>(null);

  const isSignal = appearance.skin === "signal";
  const sig = appearance.signal;
  const cls = appearance.classic;

  // The preview's background field moves for five seconds after a change
  // (or on request), then holds still: no endless motion on this page.
  useEffect(() => {
    if (!moving) return;
    const t = window.setTimeout(() => setMoving(false), 5000);
    return () => window.clearTimeout(t);
  }, [moving, pulseId]);

  useEffect(() => {
    if (proposal) proposalRef.current?.focus();
  }, [proposal]);

  const pulse = () => {
    setMoving(true);
    setPulseId((n) => n + 1);
  };

  const change = (mutate: (a: Appearance) => Appearance, coalesce?: string) => {
    if (edit(mutate, { coalesce })) {
      setProposal(null);
      setStatus("");
      pulse();
    }
  };

  const setSignal = (patch: Partial<SignalSettings>, coalesce?: string) =>
    change((a) => ({ ...a, skin: "signal", signal: { ...a.signal, ...patch } }), coalesce);

  const propose = (next: Appearance, title: string, message: string, origin: Proposal["origin"]) => {
    const rows = diffAppearance(appearanceStore.get(), next);
    setStatus("");
    setProposal({ title, message, next, rows, origin });
    pulse();
  };

  const runAsk = (text: string) => {
    const t = text.trim();
    if (!t) {
      setAskNote("Type a change first, or pick one of the examples.");
      return;
    }
    const r = interpretAppearance(t, appearanceStore.get());
    if ("error" in r) {
      setProposal(null);
      setAskNote(`Pal: ${r.error}`);
      return;
    }
    setAskNote("");
    propose(r.next, "Pal suggests", `Here’s how I read “${t}”. Nothing changes until you apply it.`, "ask");
  };

  const onAsk = (e: FormEvent) => {
    e.preventDefault();
    runAsk(ask);
  };

  const proposeLook = (name: string) => {
    const current = appearanceStore.get();
    const next = applyLook(current, name);
    if (!diffAppearance(current, next).length) {
      setLooksNote(`${name} is already your look.`);
      return;
    }
    setLooksNote("");
    propose(next, `Switch to ${name}?`, `${name}: ${lookDescription(current.skin, name)} Check the preview, then apply.`, `look:${name}`);
  };

  const applyProposal = () => {
    if (!proposal) return;
    commit(proposal.next);
    setProposal(null);
    setAsk("");
    setStatus("Applied to the whole site. Undo is right here if you change your mind.");
    pulse();
    undoRef.current?.focus();
  };

  const dismissProposal = () => {
    const origin = proposal?.origin;
    setProposal(null);
    setStatus("Kept your current look.");
    if (origin === "ask") askRef.current?.focus();
    else if (origin) document.getElementById(lookButtonId(origin.slice(5)))?.focus();
  };

  const doUndo = () => {
    if (!canUndo) {
      setStatus("Nothing to undo yet.");
      return;
    }
    undo();
    setProposal(null);
    setStatus("Undone.");
    pulse();
  };

  // ---- the preview shows the proposal when there is one -----------------
  const shown = proposal ? proposal.next : appearance;
  const shownPalette = useMemo(() => resolvePalette(shown), [shown]);
  const shownField = fieldSettings(shown, shownPalette, reducedMotion);
  const previewStyle = paletteVars(shownPalette) as CSSProperties;
  const previewAttrs = skinAttributes(shown, shownPalette, reducedMotion);
  const previewLabel = `${proposal ? "Proposed look, not applied yet" : "Your current look"}: ${describeAppearance(shown)}. Contrast ${contrastBadge(shownPalette)}.`;
  const canReplay = Boolean(shownField && shownField.speed > 0);

  // ---- signal fine-tune ---------------------------------------------------
  const matchedPreset = isSignal ? matchPreset(sig) : null;
  const sigPalette = isSignal ? palette : resolveSignalPalette(sig);
  const hue = hueOf(sig.acc);
  const autoTinted = sigPalette.accentText.toUpperCase() !== sig.acc.toUpperCase();
  const onLook = matchLook(appearance);
  const looks = Object.keys(LOOKS[appearance.skin]);

  // ---- sync ---------------------------------------------------------------
  const host = apiBase ? hostOf(apiBase) : "";
  const token = session && session.base === apiBase ? session.token : null;
  const syncError = (r: ApiResult<unknown>) =>
    r.status === 404
      ? `${host} doesn’t offer /api/me/appearance yet. Update the NeuroPal backend, then try again.`
      : r.status === 401
        ? `${host} asked you to sign in first. Sign in, then try again.`
        : `Couldn’t save: ${r.error}`;

  // Save this look to the visitor's NeuroPal. The web never edits Pal or the
  // Home layout, so those parts are kept from the server's copy. A newer copy
  // on the server (409) is never overwritten without asking.
  const saveRemote = async (force: boolean) => {
    if (!apiBase || sync.busy) return;
    const mixed = mixedContentProblem(apiBase);
    if (mixed) {
      setSync({ busy: false, message: mixed, conflict: null });
      return;
    }
    setSync({ busy: true, message: `Saving to ${host}…`, conflict: null });
    const current = await getAppearance(apiBase, token);
    if (!current.ok) {
      setSync({ busy: false, message: syncError(current), conflict: null });
      return;
    }
    const remote = current.data?.appearance ? normalizeAppearance(current.data.appearance) : null;
    const local = appearanceStore.get();
    const merged: Appearance = {
      ...local,
      pal: remote ? remote.pal : local.pal,
      home: remote ? remote.home : local.home,
      updatedAt: force || !local.updatedAt ? new Date().toISOString() : local.updatedAt,
    };
    const r = await putAppearance(apiBase, token, merged);
    if (r.ok) {
      setSync({ busy: false, message: `Saved to your NeuroPal at ${host}.`, conflict: null });
    } else if (r.status === 409 && r.data?.appearance) {
      const stored = normalizeAppearance(r.data.appearance);
      const when = stored.updatedAt ? ` from ${new Date(stored.updatedAt).toLocaleString()}` : "";
      setSync({
        busy: false,
        message: `Your NeuroPal has a newer look${when}. Nothing was overwritten.`,
        conflict: stored,
      });
    } else {
      setSync({ busy: false, message: syncError(r), conflict: null });
    }
  };

  const adoptServerLook = () => {
    if (!sync.conflict) return;
    commit(sync.conflict);
    setProposal(null);
    setSync({ busy: false, message: "Now using the look from your NeuroPal. Undo can take it back.", conflict: null });
    pulse();
  };

  return (
    <div className={`np-container ${styles.page}`}>
      <header className={styles.head}>
        <p className="np-label">Appearance</p>
        <h1 className="np-display np-h1">Make it yours</h1>
        <p className="np-lead">
          Two skins, one system. Start from a vibe, fine-tune if you like, or describe what you want and Pal proposes it.
          Direct choices apply at once; Pal’s proposals wait for your Apply; Undo is always one tap away. Your look is
          saved in this browser and dresses the whole site.
        </p>
      </header>

      <div className={styles.studio}>
        <section className={styles.skinBlock} aria-labelledby="skin-title">
          <h2 id="skin-title" className="np-label">
            Skin
          </h2>
          <div role="group" aria-labelledby="skin-title" className={styles.skins}>
            <button
              type="button"
              className={styles.skinButton}
              aria-pressed={!isSignal}
              onClick={() => change((a) => ({ ...a, skin: "classic" }))}
            >
              <span className={styles.skinName}>Classic</span>
              <span className={styles.skinDesc}>Calm glass · the original look</span>
            </button>
            <button
              type="button"
              className={styles.skinButton}
              aria-pressed={isSignal}
              onClick={() => change((a) => ({ ...a, skin: "signal" }))}
            >
              <span className={styles.skinName}>Signal</span>
              <span className={styles.skinDesc}>Brutal glass · every setting yours</span>
            </button>
          </div>
        </section>

        <div className={styles.previewCol}>
          <div className={styles.previewBar}>
            <h2 className="np-label">Live preview</h2>
            <div className={styles.previewTools}>
              {canReplay ? (
                <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={pulse}>
                  <Play />
                  Show motion
                </button>
              ) : null}
              <button
                ref={undoRef}
                type="button"
                className="np-btn np-btn--ghost np-btn--small"
                aria-disabled={!canUndo}
                onClick={doUndo}
              >
                <Undo />
                Undo
              </button>
            </div>
          </div>
          <p className={styles.status} role="status">
            {status}
          </p>

          <div className={styles.preview} role="img" aria-label={previewLabel} style={previewStyle} {...previewAttrs}>
            {shownField ? (
              <FieldCanvas
                layout="card"
                className={styles.previewCanvas}
                mode={shownField.mode}
                speed={moving ? shownField.speed : 0}
                accent={shownField.accent}
                base={shownField.base}
                amp={shownField.amp}
              />
            ) : null}
            <div className={`np-grid-layer ${styles.previewGrid}`} />
            <div className={styles.previewGlow} />
            <svg className={styles.previewGrain} width="100%" height="100%" focusable="false">
              <rect width="100%" height="100%" filter="url(#np-grain-fx)" />
            </svg>
            <div className={styles.previewScan} />
            <div className={styles.previewBody} aria-hidden="true">
              <div className={styles.previewTags}>
                <span className="np-tag">Preview</span>
                {proposal ? <span className="np-tag np-tag--accent">Proposed</span> : null}
                <span className={`np-tag ${styles.previewBadge}`}>{contrastBadge(shownPalette)}</span>
              </div>
              <p className={`np-display ${styles.previewHello}`}>Hello.</p>
              <div className={`np-panel ${styles.previewPanel}`}>
                <p>
                  The correlation term <span className={styles.previewMark}>survives</span> even when each arm is
                  incoherent.
                </p>
                <span className={`np-btn ${styles.previewPlay}`}>
                  <Play />
                </span>
              </div>
              <div className={styles.previewChips}>
                <span className="np-chip is-on">Chosen</span>
                <span className="np-chip">Option</span>
                <span className="np-pal" />
              </div>
            </div>
          </div>

          {proposal ? (
            <section
              ref={proposalRef}
              tabIndex={-1}
              className={`np-panel ${styles.proposal}`}
              aria-labelledby="proposal-title"
              aria-describedby="proposal-message"
            >
              <div className={styles.proposalHead}>
                <span className="np-pal" aria-hidden="true" />
                <div>
                  <h2 id="proposal-title" className={`np-display ${styles.proposalTitle}`}>
                    {proposal.title}
                  </h2>
                  <p id="proposal-message" className={styles.proposalMessage}>
                    {proposal.message}
                  </p>
                </div>
              </div>
              <ul className={styles.rows} aria-label="What will change">
                {proposal.rows.map((r) => (
                  <li key={r.k} className={styles.row}>
                    <span className="np-label">{r.k}</span>
                    <span className="np-mono">
                      <span className="np-sr-only">from </span>
                      <s className={styles.rowFrom}>{r.from}</s>
                      <span aria-hidden="true"> → </span>
                      <span className="np-sr-only"> to </span>
                      <b>{r.to}</b>
                    </span>
                  </li>
                ))}
              </ul>
              <div className={styles.proposalActions}>
                <button type="button" className="np-btn" onClick={applyProposal}>
                  Apply
                </button>
                <button type="button" className="np-btn np-btn--ghost" onClick={dismissProposal}>
                  Not now
                </button>
              </div>
              <p className={styles.why}>
                The preview shows it first, and Undo can reverse it (Sreedhar, Kaul &amp; Chilton, 2026).
              </p>
            </section>
          ) : null}

          <section className={`np-panel ${styles.block}`} aria-labelledby="sync-title">
            <h2 id="sync-title" className="np-label">
              Your NeuroPal
            </h2>
            {apiBase ? (
              <>
                <p className={styles.blockText}>
                  This look is saved in this browser. To use it in the app as well, save it to your NeuroPal at{" "}
                  <span className="np-mono">{host}</span>.
                </p>
                <div>
                  <button
                    type="button"
                    className="np-btn np-btn--ghost np-btn--small"
                    onClick={() => saveRemote(false)}
                    aria-disabled={sync.busy}
                  >
                    Save to my NeuroPal
                  </button>
                </div>
                <p className={styles.status} role="status">
                  {sync.message}
                </p>
                {sync.conflict ? (
                  <div className={styles.conflict}>
                    <button type="button" className="np-btn np-btn--small" onClick={adoptServerLook}>
                      Use that look here
                    </button>
                    <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => saveRemote(true)}>
                      Save this look anyway
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className={styles.blockText}>
                Saved in this browser only. <Link href="/sign-in/">Connect your NeuroPal</Link> to save it to the app as
                well.
              </p>
            )}
          </section>
        </div>

        {isSignal ? (
          <>
            <section className={`np-panel ${styles.block}`} aria-labelledby="vibe-title">
              <div className={styles.blockHead}>
                <h2 id="vibe-title" className="np-label">
                  Start from a vibe
                </h2>
                <span className={`np-mono ${styles.blockMeta}`}>{matchedPreset ? `On: ${matchedPreset}` : "Custom"}</span>
              </div>
              <div role="group" aria-labelledby="vibe-title" className={styles.vibes}>
                {Object.entries(SIGNAL_PRESETS).map(([name, s]) => {
                  const b = SIGNAL_BASES[s.base];
                  const r = CORNER_PX[s.corners];
                  const sh = [0, 2, 3, 4][s.brutality];
                  return (
                    <button
                      key={name}
                      type="button"
                      className={styles.vibe}
                      aria-pressed={matchedPreset === name}
                      aria-label={`${name}: ${s.base} base, ${accentName(s.acc)} accent, ${s.motion} motion`}
                      onClick={() => change((a) => ({ ...a, skin: "signal", signal: { ...s } }))}
                    >
                      <span
                        className={styles.vibeSwatch}
                        aria-hidden="true"
                        style={{ background: b.surface, borderColor: b.line, borderRadius: `${Math.round(r * 0.45)}px` }}
                      >
                        <span
                          className={styles.vibePanel}
                          style={{
                            background: b.surfaceContainer,
                            borderColor: b.line,
                            borderRadius: `${Math.round(r * 0.25)}px`,
                            boxShadow: `${sh}px ${sh}px 0 ${b.shadow}`,
                          }}
                        />
                        <span className={styles.vibeBar} style={{ background: s.acc }} />
                      </span>
                      <span className={styles.vibeName} aria-hidden="true">
                        {name}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className={styles.why}>Presets first, details later (Chernev, Böckenholt &amp; Goodman, 2015).</p>
            </section>

            <div className={styles.fineWrap}>
              <button
                type="button"
                className={`np-btn np-btn--ghost ${styles.disclosure}`}
                aria-expanded={fineOpen}
                aria-controls="fine-tune"
                onClick={() => setFineOpen((o) => !o)}
              >
                <span>Fine-tune · 8 settings</span>
                <ChevronDown className={`np-icon ${fineOpen ? styles.chevronOpen : ""}`} />
              </button>
              <section id="fine-tune" className={`np-panel ${styles.block} ${styles.fine}`} aria-label="Fine-tune Signal" hidden={!fineOpen}>
                <div role="group" aria-labelledby="accent-title">
                  <div className={styles.blockHead}>
                    <h3 id="accent-title" className="np-label">
                      Accent
                    </h3>
                    <span className={`np-mono ${styles.blockMeta}`}>
                      {accentName(sig.acc)} · {contrastBadge(sigPalette)}
                    </span>
                  </div>
                  <div className={styles.swatches}>
                    {SIGNAL_ACCENTS.map((a) => (
                      <button
                        key={a.hex}
                        type="button"
                        className={styles.swatch}
                        aria-pressed={sig.acc.toUpperCase() === a.hex}
                        aria-label={`Accent: ${a.name}`}
                        onClick={() => setSignal({ acc: a.hex })}
                      >
                        <span className={styles.dot} style={{ background: a.hex }} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <label htmlFor="hue" className={styles.hueLabel}>
                    Any hue <span className="np-mono">{sig.acc.toUpperCase()}</span>
                  </label>
                  <input
                    id="hue"
                    className={`np-range ${styles.hue}`}
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={hue}
                    aria-valuetext={`Hue ${hue} degrees, ${accentName(sig.acc)}`}
                    onChange={(e) => setSignal({ acc: hslToHex(Number(e.target.value), 1, 0.56) }, "hue")}
                  />
                  <p className={styles.why}>
                    {autoTinted
                      ? "Auto-contrast: text in this colour is tinted lighter or darker so it stays at 4.6:1 or more."
                      : "Auto-contrast: this colour already reads at 4.6:1 or more as text."}
                  </p>
                </div>

                {FINE_ROWS.map((row) => (
                  <div key={row.key} role="group" aria-labelledby={`fine-${row.key}`}>
                    <h3 id={`fine-${row.key}`} className="np-label">
                      {row.label}
                    </h3>
                    <div className={styles.chips}>
                      {row.options.map((o) => (
                        <button
                          key={String(o)}
                          type="button"
                          className="np-chip"
                          aria-pressed={String(sig[row.key]) === String(o)}
                          onClick={() => setSignal({ [row.key]: o } as Partial<SignalSettings>)}
                        >
                          {String(o)}
                        </button>
                      ))}
                    </div>
                    {row.key === "motion" && reducedMotion ? (
                      <p className={styles.why}>Your device asks for reduced motion, so everything stays still whatever you pick here.</p>
                    ) : null}
                  </div>
                ))}
                <p className={styles.why}>Motion stays in the frame. Reading text, equations and lessons never animate.</p>
              </section>
            </div>
          </>
        ) : (
          <section className={`np-panel ${styles.block}`} aria-labelledby="theme-title">
            <h2 id="theme-title" className="np-label">
              Theme
            </h2>
            <div role="group" aria-labelledby="theme-title" className={styles.themes}>
              {CLASSIC_THEME_NAMES.map((t) => {
                const p = resolveClassicPalette({ theme: t, accent: cls.accent });
                return (
                  <button
                    key={t}
                    type="button"
                    className={styles.themeTile}
                    aria-pressed={cls.theme === t}
                    onClick={() => change((a) => ({ ...a, skin: "classic", classic: { ...a.classic, theme: t } }))}
                  >
                    <span
                      className={styles.themeSample}
                      aria-hidden="true"
                      style={{ background: p.surface, color: p.onSurface, borderColor: p.outlineVariant }}
                    >
                      Aa
                      <span className={styles.themeDot} style={{ background: p.accentFill }} />
                    </span>
                    <span className={styles.themeName}>{cap(t)}</span>
                  </button>
                );
              })}
            </div>
            <h2 id="caccent-title" className="np-label">
              Accent
            </h2>
            <div role="group" aria-labelledby="caccent-title" className={styles.classicAccents}>
              {CLASSIC_ACCENT_NAMES.map((a) => {
                const off = cls.theme === "contrast";
                const p = resolveClassicPalette({ theme: off ? "dark" : cls.theme, accent: a });
                return (
                  <button
                    key={a}
                    type="button"
                    className={styles.classicAccent}
                    aria-pressed={!off && cls.accent === a}
                    aria-disabled={off}
                    aria-label={off ? `${cap(a)} accent, not available in Contrast` : `${cap(a)} accent`}
                    onClick={() => {
                      if (!off) change((x) => ({ ...x, skin: "classic", classic: { ...x.classic, accent: a } }));
                    }}
                  >
                    <span className={styles.dot} style={{ background: p.accentFill }} aria-hidden="true" />
                    <span aria-hidden="true">{cap(a)}</span>
                  </button>
                );
              })}
            </div>
            <p className={styles.why}>
              {cls.theme === "contrast"
                ? "Contrast uses fixed black, white and yellow, so accents are off."
                : "Classic keeps the original four themes and four accents, unchanged."}
            </p>
          </section>
        )}

        <section className={`np-panel ${styles.block}`} aria-labelledby="ask-title">
          <div className={styles.askHead}>
            <span className="np-pal" aria-hidden="true" />
            <h2 id="ask-title" className={`np-display ${styles.askTitle}`}>
              Ask Pal
            </h2>
            <span className={`np-mono ${styles.blockMeta}`}>Preview · Apply · Undo</span>
          </div>
          <form className={styles.askForm} onSubmit={onAsk}>
            <label htmlFor="ask-input" className={styles.askLabel}>
              Describe a change in your own words
            </label>
            <div className={styles.askRow}>
              <input
                id="ask-input"
                ref={askRef}
                className="np-input"
                type="text"
                autoComplete="off"
                placeholder={isSignal ? "less busy, warmer, round corners" : "warmer, or more contrast"}
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
              />
              <button type="submit" className={`np-btn ${styles.askSend}`} aria-label="Ask Pal">
                <ArrowRight />
              </button>
            </div>
          </form>
          <div role="group" aria-label="Examples" className={styles.chips}>
            {EXAMPLES[appearance.skin].map((x) => (
              <button
                key={x}
                type="button"
                className="np-chip np-chip--plain"
                onClick={() => {
                  setAsk(x);
                  runAsk(x);
                }}
              >
                {x}
              </button>
            ))}
          </div>
          <p className={styles.status} role="status">
            {askNote}
          </p>
        </section>

        <section className={`np-panel ${styles.block}`} aria-labelledby="looks-title">
          <div className={styles.blockHead}>
            <h2 id="looks-title" className="np-label">
              Saved looks
            </h2>
            <span className={`np-mono ${styles.blockMeta}`}>{onLook ? `On: ${onLook}` : "Custom"}</span>
          </div>
          <div role="group" aria-labelledby="looks-title" className={styles.chips}>
            {looks.map((name) => (
              <button
                key={name}
                id={lookButtonId(name)}
                type="button"
                className="np-chip"
                aria-pressed={onLook === name}
                onClick={() => proposeLook(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <p className={styles.status} role="status">
            {looksNote}
          </p>
          <div className={styles.suggest}>
            <p id="suggest-label" className={styles.blockText}>
              In the app, Pal may suggest one of these looks when your state changes. It always asks first.
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={appearance.suggestLooks}
              aria-labelledby="suggest-label"
              className={styles.switch}
              onClick={() => change((a) => ({ ...a, suggestLooks: !a.suggestLooks }))}
            >
              <span className={styles.switchTrack} aria-hidden="true">
                <span className={styles.switchKnob} />
              </span>
              <span className={styles.switchText} aria-hidden="true">
                {appearance.suggestLooks ? "On" : "Off"}
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
