import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';
import ConstructionIcon from '@mui/icons-material/Construction';
import AnchorIcon from '@mui/icons-material/Anchor';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const META = {
  '/anchors': { Icon: AnchorIcon,       title: 'Daily Anchors',              sub: 'Morning routine, meds, movement, wind-down.' },
  '/state':   { Icon: MonitorHeartIcon,  title: 'State log & protocols',     sub: 'TIPP · ACCEPTS · physiological sigh · grounding. Trend over 30 days.' },
  '/chat':    { Icon: AutoAwesomeIcon,   title: 'Claude Companion',          sub: 'Weekly pattern analysis across your framework, state log, and study history.' },
};

export default function StubRoutePage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const meta = META[pathname] || { Icon: ConstructionIcon, title: 'Coming soon', sub: '' };
  const { Icon } = meta;

  return (
    <Box className="app-page">
      <Box sx={{ maxWidth: 720, mx: 'auto', textAlign: 'center', pt: { xs: 6, md: 10 } }}>
        <Box sx={{
          width: 84, height: 84, borderRadius: '24px', mx: 'auto', mb: 2.5,
          bgcolor: 'rgba(177,197,255,0.15)', display: 'grid', placeItems: 'center',
          boxShadow: '0 0 32px rgba(177,197,255,0.25)',
        }}>
          <Icon sx={{ color: 'primary.main', fontSize: 40 }} />
        </Box>
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 0.75 }}>
          BUILDING · POST-MVP
        </Typography>
        <Typography variant="h2" sx={{ fontSize: 36, mb: 1.25 }}>{meta.title}</Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3 }}>{meta.sub}</Typography>
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/reader')}>
          Back to the Reader
        </Button>
      </Box>
    </Box>
  );
}
