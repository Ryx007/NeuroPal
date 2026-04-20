import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { PAGE_COPY } from '../config/navigation';
import { selectTweaksOpen } from '../../ui/selectors';
import { setTweaksOpen } from '../../ui/store/uiSlice';

export default function TopBar() {
  const dispatch = useDispatch();
  const tweaksOpen = useSelector(selectTweaksOpen);
  const { pathname } = useLocation();
  const t = PAGE_COPY[pathname];
  if (!t) return null;

  return (
    <Box
      className="flex flex-wrap items-end justify-between gap-4 px-5 pt-6 pb-3 md:px-6 xl:px-10 xl:pt-8 xl:pb-4"
    >
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
          <Box sx={{
            width: 7, height: 7, borderRadius: '50%',
            bgcolor: 'primary.main',
            boxShadow: '0 0 8px rgba(177,197,255,0.25)',
            animation: 'pulse-dot 1.8s ease-in-out infinite',
            '@keyframes pulse-dot': {
              '0%, 100%': { opacity: 0.4, transform: 'scale(1)' },
              '50%': { opacity: 1, transform: 'scale(1.3)' },
            },
          }} />
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>{t.eyebrow}</Typography>
        </Box>
        <Typography variant="h1" sx={{ fontSize: { xs: 30, md: 38, xl: 44 }, mb: 0.75 }}>
          {t.title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t.sub}</Typography>
      </Box>
      <Button
        variant="outlined"
        size="small"
        startIcon={<TuneIcon sx={{ fontSize: 16 }} />}
        onClick={() => dispatch(setTweaksOpen(!tweaksOpen))}
        sx={{ fontSize: 13, py: 1.25 }}
      >
        Tweaks
      </Button>
    </Box>
  );
}
