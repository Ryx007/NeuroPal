// ─── TopBar: page header + tweaks toggle ─────────────────────────────
import React from 'react';
import { connect } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { setTweaksOpen } from '../../store/slices/uiSlice';

function TopBarBase({ tweaksOpen }) {
  const dispatch = useDispatch();
  const { pathname } = useLocation();

  const titleMap = {
    '/':        { eyebrow: 'DASHBOARD',         title: 'Good afternoon, Alex', sub: 'One step at a time.' },
    '/library': { eyebrow: 'DOCUMENT LIBRARY',  title: 'Your reading',         sub: 'Drop a PDF, EPUB, DOCX or arXiv link anywhere on this page.' },
  };
  const t = titleMap[pathname];
  if (!t) return null;

  return (
    <Box sx={{ px: 5, pt: 3.5, pb: 1.5, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2.5 }}>
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
        <Typography variant="h1" sx={{ fontSize: 44, mb: 0.75 }}>{t.title}</Typography>
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

const mapStateToProps = (state) => ({
  tweaksOpen: state.ui.tweaksOpen,
});

const TopBar = connect(mapStateToProps)(TopBarBase);
export default TopBar;
