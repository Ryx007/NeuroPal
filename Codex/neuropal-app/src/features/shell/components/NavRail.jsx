import React from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { PRIMARY_ROUTES, SCAFFOLD_ROUTES } from '../config/navigation';
import { selectUserState } from '../../ui/selectors';

export default function NavRail() {
  const navigate = useNavigate();
  const userState = useSelector(selectUserState);
  const { pathname } = useLocation();

  const stateColors = { green: '#7ed4a8', yellow: '#ffcd6b', red: '#ffb4ab' };
  const stateLabels = { green: 'Green · regulated', yellow: 'Yellow · mild load', red: 'Red · dysregulated' };

  const NavItem = ({ path, label, Icon, stub }) => {
    const active = pathname === path;
    return (
      <Box
        onClick={() => navigate(path)}
        sx={{
          display: 'flex', alignItems: 'center', gap: { xs: 0.75, md: 1.75 },
          justifyContent: { xs: 'center', md: 'flex-start' },
          flex: { xs: 1, md: 'initial' },
          px: { xs: 1.25, md: 1.75 }, py: 1.5, borderRadius: '14px',
          cursor: 'pointer',
          color: active ? 'primary.main' : 'text.secondary',
          bgcolor: active ? 'rgba(177,197,255,0.12)' : 'transparent',
          '&:hover': { bgcolor: 'rgba(42,42,42,0.6)', color: 'text.primary' },
          transition: 'all 0.2s',
        }}
      >
        <Icon sx={{ fontSize: 20 }} />
        <Typography
          variant="body2"
          sx={{
            display: { xs: 'none', md: 'block' },
            fontWeight: active ? 600 : 400,
            flex: 1,
          }}
        >
          {label}
        </Typography>
        {stub && (
          <Typography variant="caption" sx={{ color: 'text.disabled', letterSpacing: '0.1em' }}>SOON</Typography>
        )}
      </Box>
    );
  };

  return (
    <Box
      sx={{
        position: { xs: 'fixed', md: 'relative' },
        left: 0,
        right: 0,
        bottom: { xs: 0, md: 'auto' },
        zIndex: 40,
        width: { xs: '100%', md: 244 },
        minWidth: { xs: 0, md: 244 },
        height: { xs: 76, md: '100%' },
        bgcolor: '#1b1c1c',
        borderTop: { xs: '1px solid rgba(67,70,83,0.15)', md: 'none' },
        borderRight: { xs: 'none', md: '1px solid rgba(67,70,83,0.15)' },
        display: 'flex',
        flexDirection: { xs: 'row', md: 'column' },
        alignItems: { xs: 'center', md: 'stretch' },
        px: { xs: 1.25, md: 2.25 },
        py: { xs: 1.25, md: 3.5 },
        gap: 0.75,
      }}
    >
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1.25, px: 1, pb: 3 }}>
        <Box sx={{
          width: 32, height: 32, borderRadius: '10px',
          background: 'linear-gradient(135deg, #b1c5ff 0%, #0051c3 100%)',
          display: 'grid', placeItems: 'center',
          boxShadow: '0 0 20px rgba(177,197,255,0.25)',
        }}>
          <Typography sx={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: '#002c71', fontSize: 16 }}>N</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>NeuroPal</Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>v0.3 · MVP</Typography>
        </Box>
      </Box>

      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', px: 1.25 }}>
          PRIMARY
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flex: 1, gap: 0.75, flexDirection: { xs: 'row', md: 'column' } }}>
        {PRIMARY_ROUTES.map((route) => (
          <NavItem key={route.path} {...route} />
        ))}
      </Box>

      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', px: 1.25, pt: 2.5 }}>
          SCAFFOLD
        </Typography>
        {SCAFFOLD_ROUTES.map((route) => (
          <NavItem key={route.path} {...route} />
        ))}
      </Box>

      <Box sx={{ display: { xs: 'none', md: 'block' }, mt: 'auto', pt: 1.75, borderTop: '1px solid rgba(67,70,83,0.15)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '12px',
            bgcolor: '#2a2a2a', display: 'grid', placeItems: 'center',
            fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: 13,
            color: 'primary.main',
          }}>AX</Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Alex</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%',
                bgcolor: stateColors[userState],
                boxShadow: `0 0 6px ${stateColors[userState]}`,
              }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {stateLabels[userState]}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
