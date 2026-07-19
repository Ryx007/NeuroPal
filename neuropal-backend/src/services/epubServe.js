const path = require('path');

// Issue 1(A/C) — the EPUB DISPLAY layer. The reader renders the publisher's
// own XHTML (equations, figures, MathML and all), so the backend serves the
// book's internals straight out of the zip:
//   buildEpubManifest(docId, loadBuf)  → { spine, toc (nested), pageList }
//   readEpubEntry(docId, loadBuf, p)   → { data, contentType } | null
// Path safety is inherent: requests are looked up as ZIP ENTRY KEYS, never
// touched to the filesystem; anything containing '..' is rejected outright.

const CONTENT_TYPES = {
    '.xhtml': 'application/xhtml+xml',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.otf': 'font/otf',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.ncx': 'application/x-dtbncx+xml',
    '.opf': 'application/oebps-package+xml',
};

// Zips are expensive to reopen per asset request (a chapter pulls dozens of
// images/CSS) — keep the most recent few open, keyed by document id.
const zipCache = new Map(); // docId → { zip, at }
const ZIP_CACHE_MAX = 3;

// loadBuf is an async () => Buffer — only called on cache miss, so the epub
// file is read from disk once per cache lifetime, not once per asset request.
async function getZip(docId, loadBuf) {
    const hit = zipCache.get(docId);
    if (hit) {
        hit.at = Date.now();
        return hit.zip;
    }
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(await loadBuf());
    zipCache.set(docId, { zip, at: Date.now() });
    if (zipCache.size > ZIP_CACHE_MAX) {
        const oldest = [...zipCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        zipCache.delete(oldest[0]);
    }
    return zip;
}

function decodeSafe(p) {
    try {
        return decodeURIComponent(p);
    } catch (e) {
        return p;
    }
}

async function readEpubEntry(docId, loadBuf, requestPath) {
    const clean = decodeSafe(String(requestPath || '')).replace(/^\/+/, '');
    if (!clean || clean.includes('..')) return null;
    const zip = await getZip(docId, loadBuf);
    const entry =
        zip.getEntry(clean) || zip.getEntry(String(requestPath || '').replace(/^\/+/, ''));
    if (!entry) return null;
    const ext = path.extname(clean).toLowerCase();
    return {
        data: entry.getData(),
        contentType: CONTENT_TYPES[ext] || 'application/octet-stream',
    };
}

// ---- manifest --------------------------------------------------------------

function attr(tag, name) {
    return (tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`)) || [])[1];
}

function decodeEntities(s) {
    return String(s || '')
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function stripTags(s) {
    return decodeEntities(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

// Resolve an href from a source document's directory to a zip-absolute path.
function resolveHref(baseDir, href) {
    const clean = decodeSafe(String(href).split('#')[0]);
    const joined = baseDir ? `${baseDir}${clean}` : clean;
    // normalize a/../b without touching the filesystem
    const parts = [];
    for (const seg of joined.split('/')) {
        if (seg === '..') parts.pop();
        else if (seg && seg !== '.') parts.push(seg);
    }
    return parts.join('/');
}

// Recursively parse an <ol> of nav <li>s into a nested TOC tree.
function parseNavList(html, baseDir) {
    const items = [];
    // split top-level <li>…</li> by depth counting
    let depth = 0;
    let start = -1;
    const tagRe = /<\/?li\b[^>]*>/gi;
    let m;
    while ((m = tagRe.exec(html))) {
        if (m[0][1] !== '/') {
            if (depth === 0) start = m.index + m[0].length;
            depth += 1;
        } else {
            depth -= 1;
            if (depth === 0 && start >= 0) {
                const inner = html.slice(start, m.index);
                const aTag = inner.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
                const href = aTag ? attr(aTag[0], 'href') : null;
                const label = aTag
                    ? stripTags(aTag[1])
                    : stripTags((inner.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
                const sub = inner.match(/<ol\b[^>]*>([\s\S]*)<\/ol>/i);
                const node = {
                    title: label || 'Untitled',
                    href: href ? resolveHref(baseDir, href) : null,
                    anchor: href && href.includes('#') ? href.split('#')[1] : null,
                    children: sub ? parseNavList(sub[1], baseDir) : [],
                };
                items.push(node);
            }
        }
    }
    return items;
}

function navBlock(navHtml, type) {
    // <nav epub:type="toc"> … </nav> (attribute order/quotes vary)
    const re = new RegExp(
        `<nav\\b[^>]*epub:type=["']${type}["'][^>]*>([\\s\\S]*?)<\\/nav>`,
        'i',
    );
    return (navHtml.match(re) || [])[1] || null;
}

async function buildEpubManifest(docId, loadBuf) {
    const zip = await getZip(docId, loadBuf);
    const readText = (p) => {
        const e = zip.getEntry(String(p).replace(/^\/+/, ''));
        return e ? zip.readAsText(e) : null;
    };

    const container = readText('META-INF/container.xml');
    if (!container) throw new Error('EPUB: container.xml missing');
    const opfPath = (container.match(/full-path=["']([^"']+)["']/) || [])[1];
    const opf = readText(opfPath);
    if (!opf) throw new Error('EPUB: package file missing');
    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

    const manifest = {}; // id → { href, properties }
    for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
        const id = attr(m[0], 'id');
        const href = attr(m[0], 'href');
        if (id && href) {
            manifest[id] = { href, properties: attr(m[0], 'properties') || '' };
        }
    }

    const spine = [];
    for (const m of opf.matchAll(/<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/g)) {
        const item = manifest[m[1]];
        if (!item) continue;
        if (/\blinear=["']no["']/.test(m[0])) continue;
        spine.push({ index: spine.length, href: resolveHref(opfDir, item.href) });
    }

    // EPUB3 nav document
    let toc = [];
    let pageList = [];
    const navItem = Object.values(manifest).find((i) => /\bnav\b/.test(i.properties));
    if (navItem) {
        const navPath = resolveHref(opfDir, navItem.href);
        const navDir = navPath.includes('/') ? navPath.slice(0, navPath.lastIndexOf('/') + 1) : '';
        const navHtml = readText(navPath);
        if (navHtml) {
            const tocHtml = navBlock(navHtml, 'toc');
            if (tocHtml) toc = parseNavList(tocHtml, navDir);
            const pageHtml = navBlock(navHtml, 'page-list');
            if (pageHtml) {
                pageList = parseNavList(pageHtml, navDir)
                    .flatMap(function flat(n) {
                        return [n, ...n.children.flatMap(flat)];
                    })
                    .filter((n) => n.href)
                    .map((n) => ({
                        page: n.title,
                        href: n.href,
                        anchor: n.anchor,
                    }));
            }
        }
    }

    // EPUB2 fallback: toc.ncx navMap (flat-nested via navPoint recursion)
    if (toc.length === 0) {
        const ncxItem = Object.values(manifest).find((i) => /\.ncx$/i.test(i.href));
        const ncx = ncxItem ? readText(resolveHref(opfDir, ncxItem.href)) : null;
        if (ncx) {
            const ncxDir = (() => {
                const p = resolveHref(opfDir, ncxItem.href);
                return p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
            })();
            const parsePoints = (xml) => {
                const out = [];
                let depth = 0;
                let start = -1;
                const t = /<\/?navPoint\b[^>]*>/gi;
                let mm;
                while ((mm = t.exec(xml))) {
                    if (mm[0][1] !== '/') {
                        if (depth === 0) start = mm.index + mm[0].length;
                        depth += 1;
                    } else {
                        depth -= 1;
                        if (depth === 0 && start >= 0) {
                            const inner = xml.slice(start, mm.index);
                            const label = stripTags(
                                (inner.match(/<text>([\s\S]*?)<\/text>/i) || [])[1] || '',
                            );
                            const src = (inner.match(/<content\b[^>]*\bsrc=["']([^"']+)["']/i) || [])[1];
                            out.push({
                                title: label || 'Untitled',
                                href: src ? resolveHref(ncxDir, src) : null,
                                anchor: src && src.includes('#') ? src.split('#')[1] : null,
                                children: parsePoints(inner),
                            });
                        }
                    }
                }
                return out;
            };
            const navMap = (ncx.match(/<navMap\b[^>]*>([\s\S]*)<\/navMap>/i) || [])[1];
            if (navMap) toc = parsePoints(navMap);
        }
    }

    return { spine, toc, pageList };
}

module.exports = { buildEpubManifest, readEpubEntry };
