// ─── Tweaks panel ────────────────────────────────────────────────────
import React from 'react';
import { connect } from 'react-redux';
import { useDispatch } from 'react-redux';
import {
  Box, Typography, Slider, IconButton, Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {
  setTheme, setAccent, setReaderFont, setReaderLayout,
  setDensity, setFontSize, setLineSpacing, setWpm, setVoice,
  setTweaksOpen,
} from '../../store/slices/uiSlice';

function Row({ label, children }) {
  return (
    <Box sx={{ py: 1.75, borderBottom: '1px solid rgba(67,70,83,0.12)' }}>
      <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 1 }}>
        {label.toUpperCase()}
      </Typography>
      {children}
    </Box>
  );
}

function Pills({ value, options, onChange }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {options.map(o => (
        <Chip key={o.id} label={o.label} size="small"
          variant={value === o.id ? 'filled' : 'outlined'}
          color={value === o.id ? 'primary' : 'default'}
          onClick={() => onChange(o.id)}
          sx={{ fontSize: 12, height: 30 }}
        />
      ))}
    </Box>
  );
}

function TweaksPanelBase({
  theme, accent, readerFont, readerLayout, density,
  fontSize, lineSpacing, wpm, voice,
}) {
  const dispatch = useDispatch();

  return (
    <Box className="glass" sx={{
      position: 'fixed', bottom: 24, right: 24,
      width: 340, maxHeight: 'calc(100vh - 48px)',
      borderRadius: '20px', p: 2.5, zIndex: 200,
      overflow: 'auto',
      boxShadow: '0 20px 80px -20px rgba(0,0,0,0.6)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{
              width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main',
              boxShadow: '0 0 8px rgba(177,197,255,0.25)',
              animation: 'pulse-dot 1.8s ease-in-out infinite',
            }} />
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>TWEAKS</Typography>
          </Box>
          <Typography variant="h6" sx={{ fontSize: 18 }}>Reader controls</Typography>
        </Box>
        <IconButton size="small" onClick={() => dispatch(setTweaksOpen(false))}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Row label="Theme">
        <Pills value={theme} options={[
          { id: 'dark', label: 'Dark' },
          { id: 'sepia', label: 'Sepia' },
          { id: 'light', label: 'Light' },
          { id: 'contrast', label: 'High contrast' },
        ]} onChange={v => dispatch(setTheme(v))} />
      </Row>

      <Row label="Accent hue">
        <Box sx={{ display: 'flex', gap: 1 }}>
          {[
            ['blue', '#b1c5ff'],
            ['cyan', '#a6e6ff'],
            ['purple', '#d6baff'],
            ['green', '#b9e6a8'],
          ].map(([id, hex]) => (
            <Box key={id}
              onClick={() => dispatch(setAccent(id))}
              sx={{
                width: 36, height: 36, borderRadius: '12px', bgcolor: hex,
                border: accent === id ? '2px solid white' : '2px solid transparent',
                boxShadow: accent === id ? `0 0 16px ${hex}` : 'none',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            />
          ))}
        </Box>
      </Row>

      <Row label="Reader font">
        <Pills value={readerFont} options={[
          { id: 'inter', label: 'Inter' },
          { id: 'atkinson', label: 'Atkinson' },
          { id: 'dyslexic', label: 'Dyslexia-friendly' },
          { id: 'serif', label: 'Lora' },
          { id: 'fraunces', label: 'Fraunces' },
        ]} onChange={v => dispatch(setReaderFont(v))} />
      </Row>

      <Row label="Reader layout">
        <Pills value={readerLayout} options={[
          { id: 'split', label: 'Split · inline Q&A' },
          { id: 'focus', label: 'Focus · cocoon' },
          { id: 'paginated', label: 'Paginated' },
        ]} onChange={v => dispatch(setReaderLayout(v))} />
      </Row>

      <Row label="Density">
        <Pills value={density} options={[
          { id: 'calm', label: 'Calm · sparse' },
          { id: 'dense', label: 'Dense · info-rich' },
        ]} onChange={v => dispatch(setDensity(v))} />
      </Row>

      <Row label={`Font size · ${fontSize}px`}>
        <Slider size="small" min={14} max={28} step={1} value={fontSize}
          onChange={(_, v) => dispatch(setFontSize(v))} />
      </Row>

      <Row label={`Line spacing · ${lineSpacing.toFixed(2)}`}>
        <Slider size="small" min={1.3} max={2.2} step={0.05} value={lineSpacing}
          onChange={(_, v) => dispatch(setLineSpacing(v))} />
      </Row>

      <Row label={`TTS speed · ${wpm} wpm`}>
        <Slider size="small" min={120} max={380} step={5} value={wpm}
          onChange={(_, v) => dispatch(setWpm(v))} />
      </Row>

      <Row label="Voice">
        <Pills value={voice} options={[
          { id: 'natural', label: 'Natural' },
          { id: 'soft', label: 'Soft' },
          { id: 'deep', label: 'Deep' },
        ]} onChange={v => dispatch(setVoice(v))} />
      </Row>

      <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', pt: 1.5, lineHeight: 1.5 }}>
        Changes persist in localStorage and are applied immediately.
      </Typography>
    </Box>
  );
}

const mapStateToProps = (state) => ({
  theme: state.ui.theme,
  accent: state.ui.accent,
  readerFont: state.ui.readerFont,
  readerLayout: state.ui.readerLayout,
  density: state.ui.density,
  fontSize: state.ui.fontSize,
  lineSpacing: state.ui.lineSpacing,
  wpm: state.ui.wpm,
  voice: state.ui.voice,
});

const TweaksPanel = connect(mapStateToProps)(TweaksPanelBase);
export default TweaksPanel;
