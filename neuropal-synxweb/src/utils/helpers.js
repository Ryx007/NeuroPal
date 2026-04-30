// Tiny, dependency-free helpers that more than one page reaches for.

export const formatTime12 = (t) => {
    const h = t.hour % 12 === 0 ? 12 : t.hour % 12;
    const m = String(t.minute).padStart(2, '0');
    return `${h}:${m} ${t.hour >= 12 ? 'PM' : 'AM'}`;
};

export const withAlpha = (hex, alpha) => {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    if (hex.startsWith('rgba')) return hex;
    if (hex.startsWith('#')) {
        const h = hex.replace('#', '');
        const expanded = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
        const i = parseInt(expanded, 16);
        return `rgba(${(i >> 16) & 255},${(i >> 8) & 255},${i & 255},${alpha})`;
    }
    return hex;
};

export const typeFromExt = (name) => {
    const ext = (name || '').split('.').pop()?.toLowerCase();
    if (['pdf', 'epub', 'docx', 'txt'].includes(ext)) return ext;
    return 'pdf';
};
