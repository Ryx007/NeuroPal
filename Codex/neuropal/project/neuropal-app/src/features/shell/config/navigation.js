import AnchorIcon from '@mui/icons-material/Anchor';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChromeReaderModeIcon from '@mui/icons-material/ChromeReaderMode';
import HomeIcon from '@mui/icons-material/Home';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';

export const PRIMARY_ROUTES = [
  { path: '/', label: 'Home', Icon: HomeIcon },
  { path: '/library', label: 'Library', Icon: LibraryBooksIcon },
  { path: '/reader', label: 'Reader', Icon: ChromeReaderModeIcon },
];

export const SCAFFOLD_ROUTES = [
  { path: '/anchors', label: 'Anchors', Icon: AnchorIcon, stub: true },
  { path: '/state', label: 'State', Icon: MonitorHeartIcon, stub: true },
  { path: '/chat', label: 'Companion', Icon: AutoAwesomeIcon, stub: true },
];

export const PAGE_COPY = {
  '/': {
    eyebrow: 'DASHBOARD',
    title: 'Good afternoon, Alex',
    sub: 'One step at a time.',
  },
  '/library': {
    eyebrow: 'DOCUMENT LIBRARY',
    title: 'Your reading',
    sub: 'Drop a PDF, EPUB, DOCX or arXiv link anywhere on this page.',
  },
};
