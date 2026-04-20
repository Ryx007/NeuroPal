import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, Checkbox, LinearProgress,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SentimentSatisfiedIcon from '@mui/icons-material/SentimentSatisfied';
import SentimentNeutralIcon from '@mui/icons-material/SentimentNeutral';
import SentimentVeryDissatisfiedIcon from '@mui/icons-material/SentimentVeryDissatisfied';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AnchorIcon from '@mui/icons-material/Anchor';
import WavingHandIcon from '@mui/icons-material/WavingHand';
import { selectUserState } from '../ui/selectors';
import { setUserState } from '../ui/store/uiSlice';
import { LIBRARY_ITEMS } from '../../shared/data/papers';

// ─── State check-in ──────────────────────────────────────────────────
function StateCheckIn({ userState, onChange }) {
  const rows = [
    { id: 'green',  Icon: SentimentSatisfiedIcon,        label: 'I feel okay',           sub: 'Regulated and ready',               color: '#7ed4a8' },
    { id: 'yellow', Icon: SentimentNeutralIcon,          label: 'A bit off',             sub: 'Some friction, not overwhelmed',    color: '#ffcd6b' },
    { id: 'red',    Icon: SentimentVeryDissatisfiedIcon, label: 'Help, I\'m overwhelmed', sub: 'Route me to TIPP or grounding',    color: '#ffb4ab' },
  ];

  return (
    <Card sx={{ bgcolor: '#1b1c1c', borderRadius: '28px', p: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2.25 }}>
        <Box>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>MODULE 2 · STATE</Typography>
          <Typography variant="h5" sx={{ mt: 0.5 }}>How are you right now?</Typography>
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', alignSelf: 'center' }}>3-tap check-in · ~8 sec</Typography>
      </Box>
      <Box sx={{ display: 'grid', gap: 1.25 }}>
        {rows.map(({ id, Icon, label, sub, color }) => {
          const active = userState === id;
          return (
            <Box
              key={id}
              onClick={() => onChange(id)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 2,
                p: 2, borderRadius: '18px', cursor: 'pointer',
                bgcolor: active ? `color-mix(in oklab, ${color} 14%, #1f2020)` : '#1f2020',
                border: active ? `1px solid ${color}` : '1px solid rgba(67,70,83,0.15)',
                transition: 'all 0.2s',
                '&:hover': { bgcolor: active ? undefined : '#2a2a2a' },
              }}
            >
              <Box sx={{
                width: 44, height: 44, borderRadius: '12px',
                bgcolor: `color-mix(in oklab, ${color} 18%, transparent)`,
                display: 'grid', placeItems: 'center',
                boxShadow: active ? `0 0 20px color-mix(in oklab, ${color} 15%, transparent)` : 'none',
              }}>
                <Icon sx={{ color, fontSize: 24 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>{label}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{sub}</Typography>
              </Box>
              {active && <CheckCircleIcon sx={{ color, fontSize: 20 }} />}
            </Box>
          );
        })}
      </Box>
    </Card>
  );
}

// ─── Resume reading card ─────────────────────────────────────────────
function ResumeCard({ navigate }) {
  return (
    <Card
      onClick={() => navigate('/reader')}
      sx={{
        background: 'linear-gradient(135deg, color-mix(in oklab, #0051c3 40%, #1f2020) 0%, #1b1c1c 100%)',
        borderRadius: '28px', p: 3.5, cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <Box sx={{ position: 'absolute', right: -30, bottom: -30, width: 200, height: 200, borderRadius: '50%', bgcolor: '#b1c5ff', filter: 'blur(80px)', opacity: 0.15 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={{
          width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main',
          boxShadow: '0 0 8px rgba(177,197,255,0.25)',
          animation: 'pulse-dot 1.8s ease-in-out infinite',
        }} />
        <Typography variant="caption" sx={{ color: 'primary.main' }}>RESUME READING</Typography>
      </Box>
      <Typography variant="h4" sx={{ fontSize: 24, lineHeight: 1.2, mb: 1 }}>
        Neuroplasticity and the Architecture of Attention
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.25 }}>
        §2 Prefrontal Mediation · paragraph 1 · 45% through
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
        <LinearProgress variant="determinate" value={45} sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>6:30 left · 225 wpm</Typography>
        <Button variant="contained" size="small" startIcon={<PlayArrowIcon />} sx={{ fontSize: 13 }}>
          Continue
        </Button>
      </Box>
    </Card>
  );
}

// ─── MVD tasks ───────────────────────────────────────────────────────
function MVDCard() {
  const [tasks, setTasks] = useState([
    { id: 1, title: 'Hydrate', sub: '2 glasses left', done: false },
    { id: 2, title: 'Meds · morning', sub: 'Atomoxetine 40mg', done: true },
    { id: 3, title: 'Walk outside', sub: '10 min, any pace', done: false },
    { id: 4, title: 'One deep block', sub: '25 min reader', done: false },
  ]);
  const toggle = (id) => setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const doneCount = tasks.filter(t => t.done).length;

  return (
    <Card sx={{ bgcolor: '#1b1c1c', borderRadius: '28px', p: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2.25 }}>
        <Box>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>MODULE 1 · SCAFFOLD</Typography>
          <Typography variant="h5" sx={{ mt: 0.5 }}>Minimum Viable Day</Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'primary.main' }}>
          {doneCount}/{tasks.length} · {tasks.length - doneCount} remaining
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gap: 1 }}>
        {tasks.map(t => (
          <Box key={t.id} onClick={() => toggle(t.id)} sx={{
            display: 'flex', alignItems: 'center', gap: 1.75,
            p: '14px 16px', borderRadius: '16px',
            bgcolor: '#1f2020', border: '1px solid rgba(67,70,83,0.12)',
            cursor: 'pointer', opacity: t.done ? 0.5 : 1, transition: 'opacity 0.2s',
          }}>
            <Checkbox
              checked={t.done} size="small"
              sx={{
                p: 0, color: 'rgba(177,197,255,0.5)',
                '&.Mui-checked': { color: 'primary.main' },
              }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t.sub}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

// ─── Anchor card ─────────────────────────────────────────────────────
function AnchorCard() {
  return (
    <Card sx={{
      position: 'relative', overflow: 'hidden', borderRadius: '28px', p: 3.5,
      bgcolor: 'color-mix(in oklab, #722ccf 25%, #1f2020)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <Box>
        <Typography variant="caption" sx={{ color: '#d6baff' }}>NEXT ANCHOR</Typography>
        <Typography variant="h5" sx={{ mt: 0.75 }}>Lunch · 1:00 PM</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75 }}>
          <ScheduleIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>In 45 minutes · then a 10 min walk</Typography>
        </Box>
      </Box>
      <Box sx={{
        width: 56, height: 56, borderRadius: '18px',
        bgcolor: 'rgba(214,186,255,0.20)', display: 'grid', placeItems: 'center',
      }}>
        <AnchorIcon sx={{ color: '#d6baff', fontSize: 28 }} />
      </Box>
      <Box sx={{ position: 'absolute', right: -20, bottom: -20, width: 160, height: 160, borderRadius: '50%', bgcolor: '#d6baff', filter: 'blur(60px)', opacity: 0.15 }} />
    </Card>
  );
}

// ─── Recent items ────────────────────────────────────────────────────
function RecentItems({ navigate }) {
  return (
    <>
      <Typography variant="caption" sx={{ color: 'text.disabled', pt: 2.5 }}>RECENT</Typography>
      <Box className="grid gap-4 md:grid-cols-3">
        {LIBRARY_ITEMS.slice(0, 3).map(item => (
          <Card key={item.id} onClick={() => navigate('/library')} sx={{
            bgcolor: '#1b1c1c', borderRadius: '18px', p: 2.25, cursor: 'pointer',
            '&:hover': { bgcolor: '#1f2020' }, transition: 'background 0.2s',
          }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{item.kind.toUpperCase()}</Typography>
            <Typography variant="body2" sx={{
              fontFamily: "'Space Grotesk'", fontWeight: 600, lineHeight: 1.25,
              mt: 1, mb: 0.75, textWrap: 'pretty',
            }}>{item.title}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>{item.authors}</Typography>
            <LinearProgress variant="determinate" value={item.progress * 100} />
          </Card>
        ))}
      </Box>
    </>
  );
}

export default function HomePage() {
  const dispatch = useDispatch();
  const userState = useSelector(selectUserState);
  const navigate = useNavigate();

  return (
    <Box className="app-page">
      <Box className="app-max">

        {userState === 'yellow' && (
          <Box className="fade-up" sx={{
            display: 'flex', alignItems: 'center', gap: 1.75,
            p: '14px 18px', borderRadius: '16px',
            bgcolor: 'color-mix(in oklab, #ffcd6b 12%, #1f2020)',
            border: '1px solid color-mix(in oklab, #ffcd6b 30%, transparent)',
          }}>
            <WavingHandIcon sx={{ color: '#ffcd6b', fontSize: 20 }} />
            <Typography variant="body2" sx={{ flex: 1 }}>
              You're in <b>yellow</b>. Want a 20-minute cocoon session with bigger type and slower TTS?
            </Typography>
            <Button variant="outlined" size="small" onClick={() => navigate('/reader')} sx={{ fontSize: 12 }}>
              Start cocoon
            </Button>
            <Button
              size="small"
              onClick={() => dispatch(setUserState('green'))}
              sx={{ color: 'text.disabled', fontSize: 12, fontFamily: "'JetBrains Mono'" }}
            >
              Dismiss
            </Button>
          </Box>
        )}

        <ResumeCard navigate={navigate} />

        <Box className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
          <StateCheckIn userState={userState} onChange={(nextState) => dispatch(setUserState(nextState))} />
          <Box className="grid gap-6" sx={{ gridAutoRows: 'min-content' }}>
            <AnchorCard />
            <MVDCard />
          </Box>
        </Box>

        <RecentItems navigate={navigate} />
      </Box>
    </Box>
  );
}
