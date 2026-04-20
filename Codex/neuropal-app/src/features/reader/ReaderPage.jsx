import React, { useState, useEffect, useMemo } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, IconButton, Slider, Chip, Tooltip,
  LinearProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FastRewindIcon from '@mui/icons-material/FastRewind';
import FastForwardIcon from '@mui/icons-material/FastForward';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import ForumIcon from '@mui/icons-material/Forum';
import HubIcon from '@mui/icons-material/Hub';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  setPlaying, advanceWord, seekBack, seekForward,
  toggleFocusMode, toggleNotes, setShowGraph, setGlobalWord,
} from './store/readerSlice';
import { setWpm, setVoice } from '../ui/store/uiSlice';
import { selectReaderPageState } from './selectors';
import {
  PAPERS, NEURO_NOTES, PHYSICS_NOTES, CITATION_GRAPH,
} from '../../shared/data/papers';

// ─── Helpers ─────────────────────────────────────────────────────────
function tokenize(text) {
  const parts = [];
  let cur = '';
  for (const ch of text) {
    cur += ch;
    if (ch === ' ') { parts.push(cur); cur = ''; }
  }
  if (cur) parts.push(cur);
  return parts;
}

function flattenWords(paper) {
  const out = [];
  paper.sections.forEach((s, si) => {
    s.paragraphs.forEach(p => {
      const words = tokenize(p.text);
      words.forEach((w, wi) => out.push({ paraId: p.id, sectionIdx: si, word: w, wIdx: wi }));
    });
  });
  return out;
}

// ─── Readable paragraph with karaoke ─────────────────────────────────
function ReadableParagraph({ p, state, anchored, readerFont, fontSize, lineSpacing, onSelect }) {
  const words = useMemo(() => tokenize(p.text), [p.text]);
  const isCurrent = state.currentParaId === p.id;

  const fontMap = {
    inter: "'Inter', system-ui, sans-serif",
    atkinson: "'Atkinson Hyperlegible', system-ui, sans-serif",
    dyslexic: "'Atkinson Hyperlegible', system-ui, sans-serif",
    serif: "'Lora', Georgia, serif",
    fraunces: "'Fraunces', Georgia, serif",
  };

  const handleMouseUp = (e) => {
    const sel = window.getSelection().toString().trim();
    if (sel.length > 3) onSelect?.(sel, p.id, { x: e.clientX, y: e.clientY });
  };

  return (
    <Box
      component="p"
      data-para={p.id}
      onMouseUp={handleMouseUp}
      className={anchored ? 'para-anchored' : ''}
      sx={{
        fontFamily: fontMap[readerFont] || fontMap.inter,
        fontSize: `${fontSize}px`,
        lineHeight: lineSpacing,
        letterSpacing: readerFont === 'dyslexic' ? '0.04em' : '0em',
        textWrap: 'pretty', m: '0 0 1.2em',
      }}
    >
      {words.map((w, wi) => {
        let cls = 'word-pending';
        if (isCurrent && wi < state.currentWord) cls = 'word-read';
        else if (isCurrent && wi === state.currentWord) cls = 'word-current';
        else if (!isCurrent && state.paraIdsRead.has(p.id)) cls = 'word-read';
        return <span key={wi} className={cls}>{w}</span>;
      })}
    </Box>
  );
}

// ─── Margin note ─────────────────────────────────────────────────────
function MarginNote({ note }) {
  return (
    <Box className="fade-up" sx={{
      bgcolor: 'color-mix(in oklab, #1f2020 90%, #b1c5ff)',
      borderLeft: '2px solid #b1c5ff', borderRadius: '10px',
      p: '14px 16px',
    }}>
      <Typography variant="caption" sx={{
        color: 'primary.main', fontFamily: "'Space Grotesk'",
        fontWeight: 600, letterSpacing: '0.08em', display: 'block', mb: 1,
      }}>
        Q · {note.q}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.55 }}>
        {note.a}
      </Typography>
      <Typography variant="caption" sx={{
        fontFamily: "'JetBrains Mono'", color: 'text.disabled',
        display: 'block', mt: 1.25, pt: 1.25,
        borderTop: '1px dashed rgba(67,70,83,0.40)',
      }}>
        ↪ {note.cite}
      </Typography>
    </Box>
  );
}

// ─── Citation graph overlay ──────────────────────────────────────────
function CitationGraphOverlay({ onClose }) {
  const g = CITATION_GRAPH;
  const catColors = {
    foundation: '#a6e6ff', direct: '#b1c5ff',
    self: '#d6baff', cross: '#ffd27a',
  };
  return (
    <Box sx={{
      position: 'absolute', inset: 0, zIndex: 80,
      bgcolor: 'rgba(19,19,19,0.85)',
      backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', p: 5,
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2.5 }}>
        <Box>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>CITATION GRAPH</Typography>
          <Typography variant="h4" sx={{ fontSize: 24, mt: 0.5 }}>References &amp; cross-paper links</Typography>
        </Box>
        <Button variant="outlined" size="small" startIcon={<CloseIcon sx={{ fontSize: 16 }} />} onClick={onClose}>
          Close
        </Button>
      </Box>
      <Box sx={{ flex: 1, position: 'relative', bgcolor: '#1b1c1c', borderRadius: '20px', overflow: 'hidden' }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {g.nodes.map((n, i) => (
            <line key={i}
              x1={`${g.center.x}%`} y1={`${g.center.y}%`}
              x2={`${n.x}%`} y2={`${n.y}%`}
              stroke={`color-mix(in oklab, ${catColors[n.cat]} 40%, transparent)`}
              strokeWidth="1" strokeDasharray={n.cat === 'cross' ? '4 4' : 'none'}
            />
          ))}
        </svg>
        {/* Center node */}
        <Box sx={{
          position: 'absolute', left: `${g.center.x}%`, top: `${g.center.y}%`,
          width: 140, height: 140, ml: '-70px', mt: '-70px',
          borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg, #b1c5ff, #0051c3)',
          boxShadow: '0 0 40px rgba(177,197,255,0.25)',
          color: '#002c71', p: 1.25, textAlign: 'center',
          fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: 13, lineHeight: 1.2,
        }}>
          Neuroplasticity and the Architecture of Attention
        </Box>
        {/* Satellite nodes */}
        {g.nodes.map(n => (
          <Tooltip key={n.id} title={n.label} arrow>
            <Box sx={{
              position: 'absolute', left: `${n.x}%`, top: `${n.y}%`,
              width: 70, height: 70, ml: '-35px', mt: '-35px',
              borderRadius: '50%', display: 'grid', placeItems: 'center', textAlign: 'center',
              bgcolor: `color-mix(in oklab, ${catColors[n.cat]} 18%, #1f2020)`,
              border: `1px solid ${catColors[n.cat]}`, color: catColors[n.cat],
              fontFamily: "'Space Grotesk'", fontWeight: 500, fontSize: 10.5, lineHeight: 1.15,
              p: 0.75, cursor: 'pointer',
              transition: 'transform 0.3s', '&:hover': { transform: 'scale(1.15)' },
            }}>
              {n.label}
            </Box>
          </Tooltip>
        ))}
        {/* Legend */}
        <Box sx={{
          position: 'absolute', left: 20, bottom: 20,
          display: 'flex', gap: 2, p: '10px 16px',
          bgcolor: '#1f2020', borderRadius: '14px',
        }}>
          {[
            ['#a6e6ff', 'Foundational'], ['#b1c5ff', 'Direct citation'],
            ['#d6baff', 'Self-citation'], ['#ffd27a', 'Cross-paper'],
          ].map(([c, l]) => (
            <Box key={l} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{l}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// ─── Minimap ─────────────────────────────────────────────────────────
function Minimap({ paper, currentSection, progress, onJump }) {
  return (
    <Box sx={{ width: 200, display: 'flex', flexDirection: 'column', gap: 1.75, py: 2.5, alignSelf: 'stretch' }}>
      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
        {Math.round(progress * 100)}% · §{currentSection + 1}/{paper.sections.length}
      </Typography>
      <Box sx={{ flex: 1, display: 'flex', gap: 1.75, minHeight: 0 }}>
        {/* Track */}
        <Box sx={{ width: 6, position: 'relative', bgcolor: 'rgba(67,70,83,0.30)', borderRadius: 999 }}>
          <Box sx={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: `${progress * 100}%`,
            background: 'linear-gradient(180deg, #b1c5ff, rgba(177,197,255,0.40))',
            borderRadius: 999, boxShadow: '0 0 10px rgba(177,197,255,0.25)',
          }} />
          {paper.sections.map((s, i) => {
            const y = (i / Math.max(paper.sections.length - 1, 1)) * 100;
            return (
              <Box key={s.id} sx={{
                position: 'absolute', left: -6, right: -6,
                top: `${y}%`, height: 2,
                bgcolor: i === currentSection ? 'primary.main' : 'text.secondary',
                opacity: i === currentSection ? 1 : 0.3,
                boxShadow: i === currentSection ? '0 0 8px rgba(177,197,255,0.25)' : 'none',
              }} />
            );
          })}
        </Box>
        {/* Labels */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', py: 0.25, minWidth: 0 }}>
          {paper.sections.map((s, i) => (
            <Typography key={s.id}
              variant="caption"
              onClick={() => onJump(i)}
              sx={{
                cursor: 'pointer', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
                color: i === currentSection ? 'primary.main' : 'text.secondary',
                opacity: i === currentSection ? 1 : 0.55,
                letterSpacing: '0.04em', lineHeight: 1.3,
                '&:hover': { opacity: 1 },
              }}
            >
              {String(i + 1).padStart(2, '0')} · {s.heading}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// ─── Cocoon vignette ─────────────────────────────────────────────────
function CocoonVignette() {
  return (
    <Box sx={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
      background: 'radial-gradient(circle at 50% 50%, transparent 0%, transparent 40%, rgba(19,19,19,0.85) 100%)',
    }} />
  );
}

// ─── Playback bar ────────────────────────────────────────────────────
function PlaybackBar({ playing, wpm, voice, focusMode, showNotes, dispatch, totalWords }) {
  return (
    <Box className="glass" sx={{
      display: 'flex', alignItems: 'center', gap: 2.25, flexWrap: 'wrap', justifyContent: 'center',
      px: 2.5, py: 1.75, borderRadius: '24px',
      boxShadow: '0 -8px 40px -12px rgba(0,0,0,0.5)',
    }}>
      {/* Transport */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <IconButton size="small" onClick={() => dispatch(seekBack())}>
          <FastRewindIcon sx={{ fontSize: 20 }} />
        </IconButton>
        <IconButton
          onClick={() => dispatch(setPlaying(!playing))}
          sx={{
            width: 48, height: 48,
            background: 'linear-gradient(135deg, #b1c5ff, #0051c3)',
            color: '#002c71',
            boxShadow: '0 0 24px rgba(177,197,255,0.25)',
            '&:hover': { background: 'linear-gradient(135deg, #c3d4ff, #0060e0)' },
          }}
        >
          {playing ? <PauseIcon sx={{ fontSize: 26 }} /> : <PlayArrowIcon sx={{ fontSize: 26 }} />}
        </IconButton>
        <IconButton size="small" onClick={() => dispatch(seekForward(totalWords))}>
          <FastForwardIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      {/* EQ bars */}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.25, height: 22, width: 32 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <Box key={i} sx={{
            width: 3, height: '100%', bgcolor: 'primary.main', borderRadius: '3px',
            transformOrigin: 'bottom',
            animation: 'eq 0.9s ease-in-out infinite',
            animationDelay: `${i * 0.12}s`,
            animationPlayState: playing ? 'running' : 'paused',
            opacity: playing ? 1 : 0.3,
            '@keyframes eq': {
              '0%, 100%': { transform: 'scaleY(0.3)' },
              '50%': { transform: 'scaleY(1)' },
            },
          }} />
        ))}
      </Box>

      {/* WPM slider */}
      <Box sx={{ flex: 1, minWidth: { xs: '100%', sm: 180 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>WPM</Typography>
          <Typography variant="caption" sx={{ color: 'primary.main', fontVariantNumeric: 'tabular-nums' }}>{wpm}</Typography>
        </Box>
        <Slider
          size="small" min={120} max={380} step={5} value={wpm}
          onChange={(_, v) => dispatch(setWpm(v))}
        />
      </Box>

      {/* Voice chips */}
      <Box sx={{ display: 'flex', gap: 0.5, bgcolor: '#0e0e0e', borderRadius: '12px', p: 0.375 }}>
        {['Natural', 'Soft', 'Deep'].map(v => (
          <Chip key={v} label={v} size="small"
            variant={voice === v.toLowerCase() ? 'filled' : 'outlined'}
            color={voice === v.toLowerCase() ? 'primary' : 'default'}
            onClick={() => dispatch(setVoice(v.toLowerCase()))}
            sx={{ fontSize: 11, height: 28 }}
          />
        ))}
      </Box>

      <Box sx={{ width: 1, height: 32, bgcolor: 'rgba(67,70,83,0.30)' }} />

      {/* Focus + Notes toggles */}
      <Tooltip title="Focus / cocoon mode">
        <IconButton size="small" onClick={() => dispatch(toggleFocusMode())}
          sx={{ bgcolor: focusMode ? 'rgba(177,197,255,0.15)' : 'transparent', color: focusMode ? 'primary.main' : 'text.secondary' }}>
          <CenterFocusStrongIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Toggle margin Q&A">
        <IconButton size="small" onClick={() => dispatch(toggleNotes())}
          sx={{ bgcolor: showNotes ? 'rgba(177,197,255,0.15)' : 'transparent', color: showNotes ? 'primary.main' : 'text.secondary' }}>
          <ForumIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default function ReaderPage() {
  const dispatch = useDispatch();
  const {
    activePaperId,
    playing,
    globalWordIndex,
    focusMode,
    showNotes,
    showGraph,
    wpm,
    voice,
    readerFont,
    readerLayout,
    fontSize,
    lineSpacing,
  } = useSelector(selectReaderPageState, shallowEqual);
  const navigate = useNavigate();

  const paper = PAPERS[activePaperId] || PAPERS['neuro-1'];
  const notes = activePaperId === 'phys-1' ? PHYSICS_NOTES : NEURO_NOTES;
  const flat = useMemo(() => flattenWords(paper), [paper]);
  const totalWords = flat.length;
  const gIdx = globalWordIndex;

  // Tick
  useEffect(() => {
    if (!playing) return;
    const ms = (60 / wpm) * 1000;
    const t = setInterval(() => dispatch(advanceWord(totalWords)), ms);
    return () => clearInterval(t);
  }, [playing, wpm, totalWords, dispatch]);

  // Stop at end
  useEffect(() => {
    if (gIdx >= totalWords - 1) dispatch(setPlaying(false));
  }, [gIdx, totalWords, dispatch]);

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

  const [askChip, setAskChip] = useState(null);
  const [extraNotes, setExtraNotes] = useState([]);
  const allNotes = [...notes, ...extraNotes];
  const [page, setPage] = useState(0);

  const onSelect = (text, paraId, pos) => setAskChip({ text: text.slice(0, 60), paraId, x: pos.x, y: pos.y });
  const commitAsk = () => {
    if (!askChip) return;
    setExtraNotes(n => [...n, {
      anchorPara: askChip.paraId,
      q: `"${askChip.text}" — what does this mean?`,
      a: "This passage sits in the broader argument that attention is a multi-system orchestra; the term refers to the author's specific sub-claim about re-entry cost. See §4.",
      cite: '§derived · generated just now',
    }]);
    setAskChip(null);
  };

  const jumpSection = (si) => {
    const first = flat.findIndex(w => w.sectionIdx === si);
    if (first >= 0) dispatch(setGlobalWord(first));
  };

  const layout = readerLayout;

  // ─── Render body (split / focus) ──
  const renderBody = (withMargin) => (
    <Box component="article" sx={{
      maxWidth: withMargin ? 'none' : 720,
      display: 'grid',
      gridTemplateColumns: withMargin ? 'minmax(0, 680px) 300px' : '1fr',
      columnGap: 5, mx: 'auto',
    }}>
      <Box component="header" sx={{ gridColumn: '1 / -1', mb: 4 }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', mb: 1.25, display: 'block' }}>
          {paper.journal} · {paper.year} · {paper.minutes} MIN
        </Typography>
        <Typography variant="h1" sx={{
          fontSize: 'clamp(28px, 3.6vw, 46px)', lineHeight: 1.1,
          textWrap: 'balance', mb: 1.75,
        }}>
          {paper.title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {paper.authors.join(' · ')} &nbsp;·&nbsp;
          <Box component="span" sx={{ fontFamily: "'JetBrains Mono'" }}>DOI {paper.doi}</Box>
        </Typography>
        <Box sx={{ height: 1, background: 'linear-gradient(90deg, #b1c5ff 0%, transparent 40%)', mt: 2.75 }} />
      </Box>

      {paper.sections.map(s => (
        <React.Fragment key={s.id}>
          <Typography variant="h5" sx={{
            gridColumn: '1', color: 'primary.main', mt: 3.5, mb: 1.75,
            display: 'flex', alignItems: 'center', gap: 1.25,
          }}>
            <Typography component="span" variant="caption" sx={{ color: 'text.disabled' }}>
              §{paper.sections.indexOf(s) + 1}
            </Typography>
            {s.heading}
          </Typography>
          {withMargin && <Box />}
          {s.paragraphs.map(p => {
            const anchoredNotes = withMargin && showNotes ? allNotes.filter(n => n.anchorPara === p.id) : [];
            return (
              <React.Fragment key={p.id}>
                <Box sx={{ gridColumn: '1', position: 'relative' }}>
                  <ReadableParagraph p={p} state={readState} anchored={anchoredNotes.length > 0}
                    readerFont={readerFont} fontSize={fontSize} lineSpacing={lineSpacing}
                    onSelect={onSelect} />
                </Box>
                {withMargin && (
                  <Box sx={{ gridColumn: '2', pt: 0.5, display: 'grid', gap: 1.5, alignContent: 'start' }}>
                    {anchoredNotes.map((n, i) => <MarginNote key={i} note={n} />)}
                  </Box>
                )}
              </React.Fragment>
            );
          })}
          {s.pullquote && (
            <Box component="blockquote" sx={{
              gridColumn: '1', m: '24px 0', p: '20px 24px',
              borderRadius: '16px', bgcolor: '#1b1c1c',
              borderLeft: '3px solid #b1c5ff',
              fontFamily: "'Lora', serif", fontStyle: 'italic',
              fontSize: `${fontSize * 0.95}px`, lineHeight: lineSpacing,
              color: 'text.secondary',
            }}>
              "{s.pullquote}"
            </Box>
          )}
          {withMargin && s.pullquote && <Box />}
        </React.Fragment>
      ))}
    </Box>
  );

  // ─── Paginated layout ──
  const renderPaginated = () => {
    const paras = paper.sections.flatMap(s => [{ type: 'h', s }, ...s.paragraphs.map(p => ({ type: 'p', p, s }))]);
    const perPage = 4;
    const pages = [];
    for (let i = 0; i < paras.length; i += perPage) pages.push(paras.slice(i, i + perPage));
    const pg = pages[Math.min(page, pages.length - 1)];

    return (
      <Box sx={{ maxWidth: 760, mx: 'auto', width: '100%' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3.75 }}>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>PAGE {page + 1} / {pages.length}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{paper.title}</Typography>
        </Box>
        {pg.map((item, i) => item.type === 'h' ? (
          <Typography key={i} variant="h5" sx={{ color: 'primary.main', mt: i === 0 ? 0 : 3.5, mb: 1.75 }}>
            {item.s.heading}
          </Typography>
        ) : (
          <ReadableParagraph key={i} p={item.p} state={readState} anchored={false}
            readerFont={readerFont} fontSize={fontSize} lineSpacing={lineSpacing}
            onSelect={onSelect} />
        ))}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4.5 }}>
          <Button variant="outlined" size="small" startIcon={<ChevronLeftIcon />}
            disabled={page === 0} onClick={() => setPage(p => Math.max(p - 1, 0))}>Previous</Button>
          <Button variant="outlined" size="small" endIcon={<ChevronRightIcon />}
            disabled={page >= pages.length - 1} onClick={() => setPage(p => Math.min(p + 1, pages.length - 1))}>Next</Button>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ position: 'relative', height: '100%', bgcolor: '#131313', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <LinearProgress variant="determinate" value={progress * 100}
        sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, height: 3 }} />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, px: { xs: 2, md: 5 }, pt: 2.25, pb: 1.25 }}>
        <IconButton size="small" onClick={() => navigate('/library')}>
          <ArrowBackIcon sx={{ fontSize: 20 }} />
        </IconButton>
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          {paper.kind} · READING IN {voice.toUpperCase()} VOICE
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" size="small" startIcon={<HubIcon sx={{ fontSize: 14 }} />}
          onClick={() => dispatch(setShowGraph(true))} sx={{ fontSize: 12 }}>
          Citation graph
        </Button>
        <Button variant="outlined" size="small"
          startIcon={showNotes ? <ChatBubbleIcon sx={{ fontSize: 14 }} /> : <ForumIcon sx={{ fontSize: 14 }} />}
          onClick={() => dispatch(toggleNotes())} sx={{ fontSize: 12 }}>
          {showNotes ? 'Hide' : 'Show'} margin Q&amp;A
        </Button>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {focusMode && <CocoonVignette />}

        {layout !== 'paginated' && (
          <Box sx={{ display: { xs: 'none', lg: 'block' }, width: 220, flexShrink: 0, pl: 3.5, pt: 2.5 }}>
            <Minimap paper={paper} currentSection={currentSection} progress={progress} onJump={jumpSection} />
          </Box>
        )}

        <Box sx={{ flex: 1, overflow: 'auto', px: { xs: 2, md: 5 }, pt: 3.5, pb: 25, position: 'relative' }}>
          {layout === 'paginated' ? renderPaginated() : renderBody(layout === 'split' && showNotes)}

          {askChip && (
            <Chip
              icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
              label={`Ask about "${askChip.text.slice(0, 28)}${askChip.text.length > 28 ? '…' : ''}"`}
              size="small" color="primary" variant="outlined"
              onClick={commitAsk}
              sx={{
                position: 'fixed', top: askChip.y - 40,
                left: Math.min(askChip.x, window.innerWidth - 280),
                zIndex: 50, boxShadow: '0 12px 40px -8px rgba(0,0,0,0.6)',
                cursor: 'pointer',
              }}
            />
          )}
        </Box>
      </Box>

      <Box sx={{
        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        width: 'min(720px, calc(100% - 24px))', zIndex: 30,
      }}>
        <PlaybackBar
          playing={playing} wpm={wpm} voice={voice}
          focusMode={focusMode} showNotes={showNotes}
          dispatch={dispatch} totalWords={totalWords}
        />
      </Box>

      {showGraph && <CitationGraphOverlay onClose={() => dispatch(setShowGraph(false))} />}

      <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: '-10%', right: '-8%', width: '40%', height: '40%', bgcolor: '#b1c5ff', filter: 'blur(140px)', borderRadius: '50%', opacity: 0.05 }} />
        <Box sx={{ position: 'absolute', bottom: '5%', left: '-10%', width: '50%', height: '50%', bgcolor: '#b1c5ff', filter: 'blur(160px)', borderRadius: '50%', opacity: 0.04 }} />
      </Box>
    </Box>
  );
}
