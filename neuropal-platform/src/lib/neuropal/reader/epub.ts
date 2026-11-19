// The EPUB reader's chapter page: the publisher's own XHTML, shown in a
// sandboxed iframe, with a small runtime of ours for karaoke and taps.
// Ported from the Expo app (components/reader/epubRuntime.js, security-
// reviewed), with one change for the web: the parent never sends code. The
// old `__npExec` eval channel is gone; the parent sends plain commands
// ({type:"highlight", index}) and the runtime only accepts them from the
// parent window at the expected origin — so the chapter's policy needs no
// 'unsafe-eval'.
//
// The boundary is the Content-Security-Policy that comes before any of the
// book's markup:
//   - only our runtime runs (it carries this chapter's random nonce); the
//     book's scripts, inline handlers and javascript: URLs never do;
//   - the book's CSS, images, fonts and media load only from the API host
//     (and data:/blob:), so nothing can beacon a ticket elsewhere;
//   - no forms, frames, fetches, workers, objects or foreign <base>;
//   - no Referer at all.
// The frame is sandbox="allow-scripts" WITHOUT allow-same-origin: an opaque
// origin that can't reach the app, its storage or its session.
// The tag stripping below is a second layer, not the boundary.

export type TokenKind = "w" | "eq" | "img";

export interface EpubTokens {
  words: string[];
  kinds: TokenKind[];
  pids: number[];
  pageAnchors: { page: string | number; index: number }[];
}

/** Messages the chapter page sends to the reader. */
export type EpubMessage =
  | ({ type: "tokens" } & EpubTokens)
  | { type: "tap"; index: number }
  | { type: "key"; key: string; shift: boolean }
  | { type: "found"; ref: number; index: number }
  | { type: "link"; href: string; external: boolean }
  | { type: "userScroll" };

/** Commands the reader sends to the chapter page. */
export type EpubCommand =
  /** quiet: the voice isn't speaking (a mark, not a fill). */
  | { type: "highlight"; index: number; scroll: boolean; quiet?: boolean }
  | { type: "theme"; css: string }
  | { type: "anchor"; id: string }
  | { type: "scrollTo"; index: number }
  | { type: "find"; text: string; ref: number }
  | { type: "flash"; index: number }
  | { type: "follow"; on: boolean }
  | { type: "clear" };

// Kept ES5-ish and dependency-free. It must never contain a closing script tag.
const RUNTIME = String.raw`
(function () {
  'use strict';
  var PARENT = window.__NP_PARENT_ORIGIN;
  var TOKENS = [];
  var PIDS = [];
  var NODE_FIRST = new Map();
  var hasHL = typeof window.Highlight === 'function' && window.CSS && CSS.highlights;
  var follow = true;
  var userScrollAt = 0;
  var programmaticUntil = 0;
  var lastScrollAt = 0;

  function send(m) {
    try { window.parent.postMessage({ __epub: m }, PARENT); } catch (e) {}
  }

  var BLOCK = /^(P|DIV|LI|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|FIGCAPTION|TD|TH|DT|DD|PRE|SECTION|ARTICLE|ASIDE)$/;
  function blockOf(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el && !BLOCK.test(el.tagName)) el = el.parentElement;
    return el || document.body;
  }

  function tokenize() {
    var words = [], kinds = [], lastBlock = null, pid = -1;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          var t = n.tagName;
          if (t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
          if (t === 'IMG') return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
        return /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var n;
    while ((n = walker.nextNode())) {
      var block = blockOf(n);
      if (block !== lastBlock) { lastBlock = block; pid += 1; }
      if (n.nodeType === 1) {
        var isMath = /math/i.test(n.className || '');
        TOKENS.push({ el: n });
        PIDS.push(pid);
        words.push(isMath ? '[equation]' : '[image]');
        kinds.push(isMath ? 'eq' : 'img');
        continue;
      }
      NODE_FIRST.set(n, TOKENS.length);
      var re = /\S+/g, m;
      while ((m = re.exec(n.nodeValue))) {
        TOKENS.push({ node: n, start: m.index, end: m.index + m[0].length });
        PIDS.push(pid);
        words.push(m[0]);
        kinds.push('w');
      }
    }
    var pageAnchors = [];
    var list = window.__NP_PAGE_ANCHORS || [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i].anchor ? document.getElementById(list[i].anchor) : null;
      var idx = el ? firstTokenAtOrAfter(el) : 0;
      if (idx >= 0) pageAnchors.push({ page: list[i].page, index: idx });
    }
    send({ type: 'tokens', words: words, kinds: kinds, pids: PIDS, pageAnchors: pageAnchors });
  }

  function firstTokenAtOrAfter(el) {
    for (var i = 0; i < TOKENS.length; i++) {
      var node = TOKENS[i].node || TOKENS[i].el || TOKENS[i].span;
      if (!node) continue;
      if (node === el || el.contains(node) || (el.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) return i;
    }
    return -1;
  }

  function rangeFor(i) {
    var t = TOKENS[i];
    if (!t || t.el) return null;
    var r = document.createRange();
    try {
      if (t.span) { r.selectNodeContents(t.span); return r; }
      r.setStart(t.node, t.start);
      r.setEnd(t.node, t.end);
    } catch (e) { return null; }
    return r;
  }

  // Span-wrap fallback (no Highlight API): wrap ONE paragraph at a time.
  var wrappedPid = -1;
  function wrapParagraph(pid) {
    if (wrappedPid === pid) return;
    wrappedPid = pid;
    for (var i = 0; i < TOKENS.length; i++) {
      if (PIDS[i] !== pid || TOKENS[i].el || TOKENS[i].span) continue;
      var r = rangeFor(i);
      if (!r) continue;
      var span = document.createElement('span');
      span.className = 'np-word';
      try { r.surroundContents(span); } catch (e) { continue; }
      TOKENS[i] = { span: span };
      var after = span.nextSibling;
      if (after && after.nodeType === 3) {
        var re = /\S+/g, m, j = i + 1;
        while ((m = re.exec(after.nodeValue)) && j < TOKENS.length && PIDS[j] === pid) {
          if (!TOKENS[j].el && !TOKENS[j].span) TOKENS[j] = { node: after, start: m.index, end: m.index + m[0].length };
          j += 1;
        }
      }
    }
  }

  function elementOf(i) {
    var t = TOKENS[i];
    if (!t) return null;
    return t.el || t.span || (t.node && t.node.parentElement) || null;
  }

  function rectOf(i) {
    var t = TOKENS[i];
    if (!t) return null;
    if (t.el) return t.el.getBoundingClientRect();
    if (t.span) return t.span.getBoundingClientRect();
    var r = rangeFor(i);
    return r ? r.getBoundingClientRect() : null;
  }

  function scrollToY(y, smooth) {
    programmaticUntil = Date.now() + 800;
    lastScrollAt = Date.now();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, y), behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }

  function clearHighlight() {
    if (hasHL) {
      CSS.highlights.delete('np-karaoke');
      CSS.highlights.delete('np-mark');
    }
    var a = document.querySelectorAll('.np-eq-active, .np-word-active');
    for (var q = 0; q < a.length; q++) a[q].classList.remove('np-eq-active', 'np-word-active');
  }

  function highlight(i, scroll, quiet) {
    var t = TOKENS[i];
    if (!t) return;
    clearHighlight();
    document.documentElement.classList.toggle('np-quiet', !!quiet);
    if (t.el) {
      t.el.classList.add('np-eq-active');
    } else if (hasHL) {
      var r = rangeFor(i);
      // Speaking: the word is filled. Paused: only marked, in the book's own ink.
      if (r) CSS.highlights.set(quiet ? 'np-mark' : 'np-karaoke', new Highlight(r));
    } else {
      wrapParagraph(PIDS[i]);
      var t2 = TOKENS[i];
      if (t2 && t2.span) t2.span.classList.add('np-word-active');
    }
    var rect = rectOf(i);
    if (!rect) return;
    var vh = window.innerHeight;
    if (!scroll) {
      if (rect.top < 0 || rect.bottom > vh) scrollToY(window.scrollY + rect.top - vh * 0.3, false);
      return;
    }
    var now = Date.now();
    if (!follow || now - userScrollAt < 4000) return;
    if ((rect.top < vh * 0.12 || rect.bottom > vh * 0.78) && now - lastScrollAt > 350) {
      scrollToY(window.scrollY + rect.top - vh * 0.33, true);
    }
  }

  function scrollToToken(i) {
    var rect = rectOf(i);
    if (rect) scrollToY(window.scrollY + rect.top - window.innerHeight * 0.3, true);
  }

  function flash(i) {
    var el = elementOf(i);
    var block = el ? blockOf(el) : null;
    if (!block || block === document.body) return;
    block.classList.remove('np-flash');
    void block.offsetWidth;
    block.classList.add('np-flash');
    setTimeout(function () { block.classList.remove('np-flash'); }, 2600);
    scrollToToken(i);
  }

  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  function find(text, ref) {
    var needle = norm(text);
    var index = -1;
    if (needle.length >= 12) {
      var hay = '', starts = [];
      for (var i = 0; i < TOKENS.length; i++) {
        starts.push(hay.length);
        var tk = TOKENS[i];
        if (tk.el) continue;
        var word = tk.span ? tk.span.textContent : tk.node.nodeValue.slice(tk.start, tk.end);
        hay += norm(word);
      }
      var tries = [needle, needle.slice(0, 64), needle.slice(0, 32)];
      for (var k = 0; k < tries.length && index < 0; k++) {
        if (tries[k].length < 12) continue;
        var at = hay.indexOf(tries[k]);
        if (at >= 0) {
          var lo = 0, hi = starts.length - 1;
          while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (starts[mid] <= at) lo = mid; else hi = mid - 1; }
          index = lo;
        }
      }
    }
    send({ type: 'found', ref: ref, index: index });
  }

  function seekAnchor(id) {
    var el = id ? document.getElementById(id) : null;
    if (!el) return;
    var idx = firstTokenAtOrAfter(el);
    if (idx < 0 && TOKENS.length > 0) idx = TOKENS.length - 1;
    try { el.scrollIntoView({ block: 'start' }); programmaticUntil = Date.now() + 800; } catch (e) {}
    if (idx >= 0) send({ type: 'tap', index: idx });
  }

  function theme(css) {
    var el = document.getElementById('np-theme');
    if (el) el.textContent = css;
  }

  function tokenAtPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    if (el && el.tagName === 'IMG') {
      for (var i = 0; i < TOKENS.length; i++) if (TOKENS[i].el === el) return i;
    }
    if (el && el.classList && el.classList.contains('np-word')) {
      for (var j = 0; j < TOKENS.length; j++) if (TOKENS[j].span === el) return j;
    }
    var node = null, offset = 0;
    if (document.caretPositionFromPoint) {
      var p = document.caretPositionFromPoint(x, y);
      if (p) { node = p.offsetNode; offset = p.offset; }
    } else if (document.caretRangeFromPoint) {
      var r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; offset = r.startOffset; }
    }
    if (!node || node.nodeType !== 3) return -1;
    return tokenForNodeOffset(node, offset);
  }

  function tokenForNodeOffset(node, offset) {
    var first = NODE_FIRST.get(node);
    if (first === undefined) {
      for (var i = 0; i < TOKENS.length; i++) {
        var t = TOKENS[i];
        if (t.node === node && offset >= t.start && offset <= t.end) return i;
      }
      return -1;
    }
    for (var k = first; k < TOKENS.length; k++) {
      var tk = TOKENS[k];
      if (!tk.node || tk.node !== node) { if (k > first) break; continue; }
      if (offset >= tk.start && offset <= tk.end) return k;
      if (offset < tk.start) return k;
    }
    return -1;
  }

  var downAt = null;
  document.addEventListener('pointerdown', function (e) { downAt = { x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a) {
      e.preventDefault();
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) === '#') {
        var target = document.getElementById(decodeURIComponent(href.slice(1)));
        if (target) { try { target.scrollIntoView({ block: 'start' }); } catch (x) {} }
        return;
      }
      send({ type: 'link', href: a.href, external: /^https?:/i.test(href) && a.host !== location.host });
      return;
    }
    if (e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (downAt && (Math.abs(e.clientX - downAt.x) > 8 || Math.abs(e.clientY - downAt.y) > 8)) return;
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    var idx = tokenAtPoint(e.clientX, e.clientY);
    if (idx >= 0) send({ type: 'tap', index: idx });
  }, true);

  function markUserScroll() {
    userScrollAt = Date.now();
    send({ type: 'userScroll' });
  }
  window.addEventListener('wheel', markUserScroll, { passive: true });
  window.addEventListener('touchmove', markUserScroll, { passive: true });
  window.addEventListener('scroll', function () {
    if (Date.now() > programmaticUntil) markUserScroll();
  }, { passive: true });

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var k = e.key;
    if (k === ' ' || k === 'ArrowLeft' || k === 'ArrowRight' || ((k === 'ArrowUp' || k === 'ArrowDown') && e.shiftKey) || k === 'Escape') {
      if (k !== 'Escape') e.preventDefault();
      send({ type: 'key', key: k, shift: e.shiftKey });
    } else if (k === 'PageUp' || k === 'PageDown' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'Home' || k === 'End') {
      markUserScroll();
    }
  });

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || e.origin !== PARENT) return;
    var d = e.data && e.data.__np;
    if (!d || typeof d.type !== 'string') return;
    if (d.type === 'highlight') highlight(d.index | 0, !!d.scroll, !!d.quiet);
    else if (d.type === 'theme') theme(String(d.css || ''));
    else if (d.type === 'anchor') seekAnchor(String(d.id || ''));
    else if (d.type === 'scrollTo') scrollToToken(d.index | 0);
    else if (d.type === 'find') find(String(d.text || ''), d.ref | 0);
    else if (d.type === 'flash') flash(d.index | 0);
    else if (d.type === 'follow') follow = !!d.on;
    else if (d.type === 'clear') clearHighlight();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tokenize);
  else tokenize();
})();
`;

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

const META_TAG = /<meta\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;

/** JSON for a <script> body: no "<", U+2028 or U+2029 can end or break it. */
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const scriptJson = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .split(LS)
    .join("\\u2028")
    .split(PS)
    .join("\\u2029");

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function originOf(href: string): string | null {
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

export interface ChapterInput {
  chapterXhtml: string;
  /** Absolute URL of the chapter's directory (ticket in the path). */
  baseHref: string;
  themeCss: string;
  pageAnchors: { page: string | number; anchor?: string | null }[];
  /** The reader page's origin (the only window the runtime listens to). */
  parentOrigin: string;
  title: string;
}

/** The complete chapter document for the iframe's srcdoc. */
export function buildChapterHtml({ chapterXhtml, baseHref, themeCss, pageAnchors, parentOrigin, title }: ChapterInput): string {
  const origin = originOf(baseHref);
  if (!origin) throw new Error("The book’s address isn’t valid.");
  const nonce = randomNonce();
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src ${origin} 'unsafe-inline'`,
    `img-src ${origin} data: blob:`,
    `font-src ${origin} data:`,
    `media-src ${origin} data: blob:`,
    `base-uri ${origin}`,
    "form-action 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "connect-src 'none'",
    "object-src 'none'",
  ].join("; ");

  let html = String(chapterXhtml);
  const langMatch = /<html\b[^>]*?\s(?:xml:)?lang\s*=\s*["']([A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*)["']/i.exec(html);
  const lang = langMatch ? langMatch[1] : "en";

  html = html.replace(/^\s*<\?xml[^>]*\?>/i, "").replace(/^\s*<!doctype[^>]*>/i, "");
  html = html
    .replace(/<script\b[^<>]*>[\s\S]{0,1000000}?<\/script\s*>/gi, "")
    .replace(/<script\b[^<>]*\/>/gi, "")
    .replace(META_TAG, (tag) => (/http-equiv|name\s*=\s*["']?\s*referrer/i.test(tag) ? "" : tag))
    .replace(/<base\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi, "")
    // XHTML self-closing non-void tags (<title/>, <a id="p1"/>, <span/>) would
    // swallow what follows when parsed as HTML: give them an end tag.
    .replace(/<([a-zA-Z][\w:-]*)((?:\s(?:[^<>"']|"[^"]*"|'[^']*')*)?)\/>/g, (m, tag: string, attrs: string) =>
      VOID_TAGS.has(tag.toLowerCase()) ? m : `<${tag}${attrs}></${tag}>`,
    )
    .replace(/<[a-zA-Z][^<>]*>/g, (tag) =>
      tag
        .replace(/[\s/]+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, " ")
        .replace(/((?:xlink:)?href|src|action|formaction)\s*=\s*(["'])\s*(?:javascript:|vbscript:|data:text\/html)[^"']*\2/gi, "$1=$2#$2"),
    );

  const inject =
    `<html lang="${attr(lang)}"><head>` +
    `<meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
    `<meta name="referrer" content="no-referrer">` +
    `<base href="${attr(baseHref)}">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${text(title)}</title>` +
    `<style id="np-theme">${themeCss.replace(/<\/style/gi, "<\\/style")}</style>` +
    `<script nonce="${nonce}">window.__NP_PARENT_ORIGIN=${scriptJson(parentOrigin)};window.__NP_PAGE_ANCHORS=${scriptJson(
      pageAnchors.map((p) => ({ page: p.page, anchor: p.anchor || null })),
    )};</script>` +
    `<script nonce="${nonce}">${RUNTIME}</script>`;
  // Ours goes first: the parser files it into <head> before a single byte of
  // the book (whose own <html>/<head> tags then merge into ours).
  return `<!doctype html>${inject}${html}`;
}

export interface EpubTheme {
  background: string;
  text: string;
  link: string;
  highlight: string;
  highlightText: string;
  flash: string;
  /** CSS font-family, or null to keep the publisher's. */
  font: string | null;
  fontSize: number;
  lineHeight: number;
}

/** A CSS font-family a user picked, without var() and anything that isn't a name. */
export function safeFontFamily(family: string | null | undefined): string | null {
  if (!family) return null;
  const parts = family
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !/^var\(/i.test(p))
    .map((p) => p.replace(/[^A-Za-z0-9 "'_-]/g, ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

const cssColor = (c: string) => (/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|color\([\w\s.,%/-]+\)|[a-z]+)$/i.test(c.trim()) ? c.trim() : "inherit");

/** App CSS layered ON TOP of the publisher's: frame, palette, and the reader's type. */
export function epubThemeCss(t: EpubTheme): string {
  const font = safeFontFamily(t.font);
  const fontRule = font ? `font-family: ${font} !important;` : "";
  const size = Math.max(12, Math.min(48, Math.round(t.fontSize || 20)));
  const lh = Math.max(1, Math.min(3, Number(t.lineHeight) || 1.6));
  const bg = cssColor(t.background);
  const fg = cssColor(t.text);
  return `
html, body { background: ${bg} !important; color: ${fg} !important; font-size: ${size}px !important; line-height: ${lh} !important; }
body { padding: 28px clamp(16px, 5vw, 48px) 30vh !important; margin: 0 auto !important; max-width: 70ch; box-sizing: border-box; }
body, body p, body div, body li, body td, body th, body blockquote, body span, body dd, body dt { color: ${fg} !important; ${fontRule} line-height: ${lh} !important; }
body h1, body h2, body h3, body h4, body h5, body h6 { color: ${fg} !important; ${fontRule} line-height: 1.2 !important; }
a, a * { color: ${cssColor(t.link)} !important; }
img, svg, video { max-width: 100% !important; height: auto !important; }
::highlight(np-karaoke) { background-color: ${cssColor(t.highlight)}; color: ${cssColor(t.highlightText)}; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; }
.np-word-active { background-color: ${cssColor(t.highlight)}; color: ${cssColor(t.highlightText)} !important; border-radius: 3px; text-decoration: underline; }
.np-eq-active { outline: 3px solid ${cssColor(t.highlight)}; outline-offset: 3px; border-radius: 3px; }
::highlight(np-mark) { background-color: color-mix(in srgb, ${cssColor(t.highlight)} 22%, transparent); text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; }
html.np-quiet .np-word-active { background-color: color-mix(in srgb, ${cssColor(t.highlight)} 22%, transparent); color: inherit !important; }
.np-flash { outline: 3px solid ${cssColor(t.flash)}; outline-offset: 6px; border-radius: 4px; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: auto; } }
@media (forced-colors: active) { ::highlight(np-karaoke), ::highlight(np-mark) { background-color: Highlight; color: HighlightText; } .np-word-active { background-color: Highlight; color: HighlightText !important; } }
`;
}
