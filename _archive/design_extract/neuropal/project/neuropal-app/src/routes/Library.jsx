// ─── Library page ────────────────────────────────────────────────────
import React from 'react';
import { connect } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, Tab, Tabs, LinearProgress,
  InputAdornment, TextField,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import LinkIcon from '@mui/icons-material/Link';
import SearchIcon from '@mui/icons-material/Search';
import { setFilter } from '../../store/slices/librarySlice';
import { setActivePaper } from '../../store/slices/readerSlice';
import { LIBRARY_ITEMS } from '../../data/papers';
import { toast } from 'react-toastify';

// ─── Drop zone ───────────────────────────────────────────────────────
function DropZone() {
  const [dragging, setDragging] = React.useState(false);

  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false);
        toast.info('Document upload will be available in the full build.', { autoClose: 3000 });
      }}
      sx={{
        p: 3.5, borderRadius: '24px',
        bgcolor: dragging ? 'rgba(177,197,255,0.08)' : '#1b1c1c',
        border: dragging ? '2px dashed #b1c5ff' : '2px dashed rgba(67,70,83,0.30)',
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 2.5, alignItems: 'center',
        transition: 'all 0.15s', cursor: 'pointer',
      }}
    >
      <Box sx={{
        width: 60, height: 60, borderRadius: '18px',
        bgcolor: 'rgba(177,197,255,0.15)',
        display: 'grid', placeItems: 'center',
      }}>
        <CloudUploadIcon sx={{ color: 'primary.main', fontSize: 28 }} />
      </Box>
      <Box>
        <Typography variant="h6" sx={{ fontSize: 18 }}>
          Drop to add — PDF · EPUB · DOCX · TXT · arXiv link
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Files are chunked, embedded locally, and indexed for Q&amp;A. Nothing is sent for model training.
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" size="small" startIcon={<LinkIcon sx={{ fontSize: 14 }} />} sx={{ fontSize: 12 }}>
          Paste link
        </Button>
        <Button variant="contained" size="small" sx={{ fontSize: 13 }}>
          Browse files
        </Button>
      </Box>
    </Box>
  );
}

// ─── Library card ────────────────────────────────────────────────────
function LibraryCard({ item, onClick }) {
  const colorMap = {
    primary: '#b1c5ff',
    secondary: '#a6e6ff',
    info: '#d6baff',
  };
  const c = colorMap[item.color] || '#b1c5ff';

  return (
    <Card
      onClick={onClick}
      sx={{
        bgcolor: '#1b1c1c', borderRadius: '20px', p: 2.25,
        cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 1.75,
        transition: 'transform 0.2s, background 0.2s',
        '&:hover': { transform: 'translateY(-2px)', bgcolor: '#1f2020' },
      }}
    >
      {/* Cover placeholder */}
      <Box sx={{
        aspectRatio: '4/3', borderRadius: '12px', overflow: 'hidden',
        background: `linear-gradient(135deg, color-mix(in oklab, ${c} 28%, #2a2a2a), #2a2a2a)`,
        backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, ${c} 18%, transparent) 0 6px, transparent 6px 14px)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{
            color: c, fontFamily: "'Space Grotesk'", fontSize: 20,
            fontWeight: 700, letterSpacing: '-0.02em', mb: 0.5,
          }}>
            {item.title.split(' ').slice(0, 2).join(' ')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>/cover-art</Typography>
        </Box>
      </Box>

      <Typography variant="caption" sx={{ color: c, letterSpacing: '0.14em' }}>
        {item.kind.toUpperCase()}
      </Typography>
      <Typography sx={{
        fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600,
        lineHeight: 1.3, textWrap: 'pretty',
      }}>
        {item.title}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{item.authors}</Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 'auto' }}>
        <LinearProgress
          variant="determinate"
          value={item.progress * 100}
          sx={{ flex: 1, '& .MuiLinearProgress-bar': { bgcolor: c } }}
        />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {item.progress > 0 ? `${Math.round(item.progress * 100)}%` : 'new'}
        </Typography>
      </Box>
    </Card>
  );
}

// ─── Library page assembled ──────────────────────────────────────────
function LibraryBase({ filter }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const filtered = LIBRARY_ITEMS.filter(i =>
    filter === 'all' ? true :
    filter === 'active' ? i.progress > 0 && i.progress < 1 :
    filter === 'unread' ? i.progress === 0 : true
  );

  const open = (id) => {
    if (id === 'neuro-1' || id === 'phys-1') {
      dispatch(setActivePaper(id));
      navigate('/reader');
    } else {
      toast.info('Only the two demo papers are interactive for now.');
    }
  };

  return (
    <Box sx={{ px: 5, pb: 7.5, overflow: 'auto', height: '100%' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', display: 'grid', gap: 3 }}>
        <DropZone />

        {/* Filter tabs + search */}
        <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(67,70,83,0.15)' }}>
          <Tabs
            value={filter}
            onChange={(_, v) => dispatch(setFilter(v))}
            sx={{
              minHeight: 'auto',
              '& .MuiTab-root': { minHeight: 42, py: 1.5, px: 2 },
            }}
          >
            <Tab label="All · 4" value="all" />
            <Tab label="In progress · 3" value="active" />
            <Tab label="Unread · 1" value="unread" />
            <Tab label="Starred" value="starred" />
          </Tabs>
          <Box sx={{ flex: 1 }} />
          <TextField
            size="small"
            placeholder="Search title, author, concept…"
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
              sx: { fontSize: 13, bgcolor: '#1b1c1c', borderRadius: '10px' },
            }}
            sx={{ width: 280, '& fieldset': { borderColor: 'rgba(67,70,83,0.15)' } }}
          />
        </Box>

        {/* Grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2.25 }}>
          {filtered.map(item => (
            <LibraryCard key={item.id} item={item} onClick={() => open(item.id)} />
          ))}
        </Box>

        {/* Collections */}
        <Box>
          <Typography variant="caption" sx={{ color: 'text.disabled', mb: 1.5, display: 'block' }}>COLLECTIONS</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.75 }}>
            {[
              { title: 'PhD · Frustrated Magnetism', count: 18, color: '#d6baff' },
              { title: 'ADHD & Attention Research', count: 11, color: '#b1c5ff' },
              { title: 'Somatic Therapy Reading', count: 7, color: '#a6e6ff' },
            ].map(c => (
              <Card key={c.title} sx={{
                bgcolor: '#1b1c1c', borderRadius: '18px', p: 2.25,
                display: 'flex', alignItems: 'center', gap: 1.75, cursor: 'pointer',
                '&:hover': { bgcolor: '#1f2020' },
              }}>
                <Box sx={{ width: 8, height: 40, borderRadius: 999, bgcolor: c.color, boxShadow: `0 0 10px ${c.color}` }} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{c.title}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{c.count} documents</Typography>
                </Box>
              </Card>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const mapStateToProps = (state) => ({
  filter: state.library.filter,
});

const Library = connect(mapStateToProps)(LibraryBase);
export default Library;
