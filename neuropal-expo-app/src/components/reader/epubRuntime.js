// Issue 1(B) — the in-page half of the EPUB dual-representation reader.
//
// The WebView/iframe shows the PUBLISHER'S chapter exactly as shipped; this
// runtime walks that live DOM once, tokenizes it, and exports the token
// stream to React Native. TTS reads that exact stream, so display and audio
// share ONE tokenization by construction. Karaoke comes back the other way:
// RN calls window.epubHighlight(i) per boundary event and the runtime lights
// the word via the CSS Custom Highlight API (Chromium ≥105 — S24 WebView and
// desktop Chrome both qualify); older engines get the span-wrap fallback,
// applied to the ACTIVE PARAGRAPH only so the DOM never churns wholesale.
//
// Messages OUT (to RN):
//   {type:'tokens', words[], kinds[], pids[], pageAnchors[{page,index}]}
//   {type:'tap', index}        — user tapped a word → seek there
//   {type:'chrome'}            — tapped empty space → toggle app chrome
//   {type:'sel', start, end, text} / {type:'sel-clear'}
// Calls IN (from RN, via injectJavaScript / contentWindow.__npExec):
//   epubHighlight(i)  epubTheme(css)  epubSetSaved(ranges)  epubSeekAnchor(id)
//   epubClearSelection()

// Serialized into the chapter <head>. Kept dependency-free ES5-ish so the
// oldest Android System WebView this app meets can still parse it.
export const EPUB_RUNTIME_JS = String.raw`
(function () {
  'use strict';
  var TOKENS = [];        // {node,start,end} for words | {el} for img tokens
  var PIDS = [];          // paragraph ordinal per token
  var NODE_FIRST = new Map(); // text node -> first token index in it
  var hasHighlightAPI = typeof window.Highlight === 'function' && window.CSS && CSS.highlights;
  var activeIndex = -1;
  var lastScrollAt = 0;

  function send(m) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(m));
      } else if (window.parent !== window) {
        window.parent.postMessage({ __epub: m }, '*');
      }
    } catch (e) {}
  }
  // Uniform command channel: RN-native uses injectJavaScript, web-iframe
  // calls this through contentWindow. Both eval strings WE authored.
  window.__npExec = function (js) { try { (0, eval)(js); } catch (e) {} };

  var BLOCK = /^(P|DIV|LI|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|FIGCAPTION|TD|TH|DT|DD|PRE|SECTION|ARTICLE|ASIDE)$/;
  function blockOf(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el && !BLOCK.test(el.tagName)) el = el.parentElement;
    return el || document.body;
  }

  function tokenize() {
    var words = [];
    var kinds = [];
    var lastBlock = null;
    var pid = -1;
    var walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: function (n) {
          if (n.nodeType === 1) {
            var t = n.tagName;
            if (t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
            if (t === 'IMG') return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_SKIP;
          }
          return /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      }
    );
    var n;
    while ((n = walker.nextNode())) {
      var block = blockOf(n);
      if (block !== lastBlock) { lastBlock = block; pid += 1; }
      if (n.nodeType === 1) {
        // one atomic token per image; publisher math EPUBs tag equations
        // with class*=math — the alt is a useless generic "image"
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

    // real print-page anchors present in THIS chapter (injected by RN as
    // window.__NP_PAGE_ANCHORS = [{page, anchor}]) → first token at/after
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
      var t = TOKENS[i];
      var node = t.node || t.el;
      var rel = el.compareDocumentPosition(node);
      if (node === el || el.contains(node) || (rel & Node.DOCUMENT_POSITION_FOLLOWING)) return i;
    }
    return -1;
  }

  function rangeFor(i) {
    var t = TOKENS[i];
    if (!t || t.el) return null;
    var r = document.createRange();
    try {
      r.setStart(t.node, t.start);
      r.setEnd(t.node, t.end);
    } catch (e) { return null; }
    return r;
  }

  // ---- karaoke ------------------------------------------------------------
  var wrappedPid = -1;
  var wrapSpans = {};
  function wrapParagraph(pid) {
    // span-wrap fallback: rewrite ONLY this paragraph's word tokens into
    // spans (token records are repointed, so later passes stay valid)
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
      wrapSpans[i] = span;
      // surrounding splits the text node — repoint the remaining tokens of
      // the SAME original node by re-walking: cheap because the next token
      // lookup falls back to fresh ranges only within this paragraph
      reindexAfterSplit(pid, i);
    }
  }
  function reindexAfterSplit(pid, wrappedIdx) {
    // After surroundContents, tokens later in the same paragraph that
    // referenced the old node/offsets are stale. Recompute them from the
    // span's following text sibling.
    var span = wrapSpans[wrappedIdx];
    if (!span) return;
    var after = span.nextSibling;
    if (!after || after.nodeType !== 3) return;
    var re = /\S+/g, m;
    var j = wrappedIdx + 1;
    while ((m = re.exec(after.nodeValue)) && j < TOKENS.length && PIDS[j] === pid) {
      if (!TOKENS[j].el && !TOKENS[j].span) {
        TOKENS[j] = { node: after, start: m.index, end: m.index + m[0].length };
      }
      j += 1;
    }
  }

  window.epubHighlight = function (i) {
    activeIndex = i;
    var t = TOKENS[i];
    if (!t) return;
    var rect = null;
    // equation/image token: outline the element itself
    var actives = document.querySelectorAll('.np-eq-active');
    for (var q = 0; q < actives.length; q++) actives[q].classList.remove('np-eq-active');
    if (t.el) {
      t.el.classList.add('np-eq-active');
      if (hasHighlightAPI) CSS.highlights.delete('np-karaoke');
      rect = t.el.getBoundingClientRect();
    } else if (hasHighlightAPI) {
      var r = rangeFor(i);
      if (r) {
        CSS.highlights.set('np-karaoke', new Highlight(r));
        rect = r.getBoundingClientRect();
      }
    } else {
      wrapParagraph(PIDS[i]);
      var prev = document.querySelector('.np-word-active');
      if (prev) prev.classList.remove('np-word-active');
      var t2 = TOKENS[i];
      if (t2 && t2.span) {
        t2.span.classList.add('np-word-active');
        rect = t2.span.getBoundingClientRect();
      }
    }
    // keep the voice inside the comfortable band of the viewport
    if (rect) {
      var vh = window.innerHeight;
      var now = Date.now();
      if ((rect.top < vh * 0.12 || rect.bottom > vh * 0.75) && now - lastScrollAt > 400) {
        lastScrollAt = now;
        window.scrollTo({ top: window.scrollY + rect.top - vh * 0.35, behavior: 'smooth' });
      }
    }
  };

  // ---- saved highlights (annotations) ------------------------------------
  window.epubSetSaved = function (ranges) {
    if (!hasHighlightAPI) return; // graceful: karaoke still works via spans
    for (var c = 0; c < 4; c++) CSS.highlights.delete('np-saved-' + c);
    var buckets = {};
    (ranges || []).forEach(function (g) {
      var rs = [];
      for (var i = g.start; i <= g.end && i < TOKENS.length; i++) {
        var r = rangeFor(i);
        if (r) rs.push(r);
      }
      var key = g.colorIndex || 0;
      buckets[key] = (buckets[key] || []).concat(rs);
    });
    Object.keys(buckets).forEach(function (k) {
      CSS.highlights.set('np-saved-' + k, new (Highlight.bind.apply(Highlight, [null].concat(buckets[k])))());
    });
  };

  // ---- taps / selection ---------------------------------------------------
  function tokenAtPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    if (el && el.tagName === 'IMG') {
      for (var i = 0; i < TOKENS.length; i++) if (TOKENS[i].el === el) return i;
    }
    if (el && el.classList && el.classList.contains('np-word')) {
      for (var j = 0; j < TOKENS.length; j++) if (TOKENS[j].span === el) return j;
    }
    var pos = document.caretRangeFromPoint
      ? document.caretRangeFromPoint(x, y)
      : null;
    if (!pos && document.caretPositionFromPoint) {
      var p = document.caretPositionFromPoint(x, y);
      if (p) { pos = { startContainer: p.offsetNode, startOffset: p.offset }; }
    }
    if (!pos || !pos.startContainer || pos.startContainer.nodeType !== 3) return -1;
    return tokenForNodeOffset(pos.startContainer, pos.startOffset);
  }
  function tokenForNodeOffset(node, offset) {
    var first = NODE_FIRST.get(node);
    if (first === undefined) {
      // node may be a post-wrap split; linear scan as fallback
      for (var i = 0; i < TOKENS.length; i++) {
        var t = TOKENS[i];
        if (t.node === node && offset >= t.start && offset <= t.end) return i;
      }
      return -1;
    }
    for (var k = first; k < TOKENS.length; k++) {
      var tk = TOKENS[k];
      if (!tk.node || tk.node !== node) {
        if (k > first) break;
        continue;
      }
      if (offset >= tk.start && offset <= tk.end) return k;
      if (offset < tk.start) return k; // gap before this word → snap forward
    }
    return -1;
  }

  var downAt = null;
  document.addEventListener('pointerdown', function (e) {
    downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, true);
  document.addEventListener('click', function (e) {
    // real link (footnote / cross-ref): let RN decide; suppress navigation
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a) { e.preventDefault(); }
    // a drag / long-press (selection gesture) is not a tap
    if (downAt && (Math.abs(e.clientX - downAt.x) > 10 || Math.abs(e.clientY - downAt.y) > 10)) return;
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // selection active → not a tap
    var idx = tokenAtPoint(e.clientX, e.clientY);
    if (idx >= 0) send({ type: 'tap', index: idx });
    else send({ type: 'chrome' });
  }, true);

  var selTimer = null;
  document.addEventListener('selectionchange', function () {
    if (selTimer) clearTimeout(selTimer);
    selTimer = setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { send({ type: 'sel-clear' }); return; }
      var r = sel.getRangeAt(0);
      var a = r.startContainer.nodeType === 3 ? tokenForNodeOffset(r.startContainer, r.startOffset) : -1;
      var b = r.endContainer.nodeType === 3 ? tokenForNodeOffset(r.endContainer, Math.max(0, r.endOffset - 1)) : -1;
      if (a < 0 || b < 0) return;
      var lo = Math.min(a, b), hi = Math.max(a, b);
      send({ type: 'sel', start: lo, end: hi, text: sel.toString().slice(0, 500) });
    }, 250);
  });
  window.epubClearSelection = function () {
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  };

  window.epubSeekAnchor = function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var idx = firstTokenAtOrAfter(el);
    // anchor past the last word (calibre split-file boundary markers sit at
    // the very end of a file): land on the last token instead of nowhere
    if (idx < 0 && TOKENS.length > 0) idx = TOKENS.length - 1;
    try {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      lastScrollAt = Date.now();
    } catch (e) {}
    if (idx >= 0) send({ type: 'tap', index: idx });
  };

  window.epubTheme = function (css) {
    var el = document.getElementById('np-theme');
    if (el) el.textContent = css;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tokenize);
  } else {
    tokenize();
  }
})();
`;

// App CSS injected ON TOP of the publisher stylesheet — publisher rules stay
// untouched; only page frame, palette and (optionally) typography override.
export function epubThemeCss({
  palette,
  fontKey,
  fontSize,
  lineSpacing,
  margin,
}) {
  // WebViews don't have the app's bundled expo fonts — map each reader font
  // to its closest system stack. 'publisher' overrides nothing.
  const stacks = {
    inter: '-apple-system, Roboto, "Segoe UI", Helvetica, Arial, sans-serif',
    atkinson: '"Atkinson Hyperlegible", Verdana, "Segoe UI", sans-serif',
    dyslexic: 'Verdana, "Comic Sans MS", sans-serif',
    lora: 'Lora, Georgia, "Times New Roman", serif',
    fraunces: 'Fraunces, Georgia, "Times New Roman", serif',
  };
  const fontRule =
    fontKey && fontKey !== 'publisher' && stacks[fontKey]
      ? `font-family: ${stacks[fontKey]} !important;`
      : '';
  const sizeRule = fontSize ? `font-size: ${fontSize}px !important;` : '';
  const lineRule = lineSpacing ? `line-height: ${lineSpacing} !important;` : '';

  return `
html, body {
  background: ${palette.surface} !important;
  color: ${palette.onSurface} !important;
  ${sizeRule}
  ${lineRule}
}
body {
  padding: ${Math.round(margin ?? 24)}px !important;
  margin: 0 auto !important;
  max-width: 44em;
  -webkit-tap-highlight-color: transparent;
}
body, body p, body div, body li, body td, body th, body blockquote, body span {
  color: ${palette.onSurface} !important;
  ${fontRule}
  ${lineRule}
}
body h1, body h2, body h3, body h4, body h5, body h6 {
  color: ${palette.onSurface} !important;
  ${fontRule}
}
a, a * { color: ${palette.accent} !important; }
img, svg, video { max-width: 100% !important; height: auto !important; }
::highlight(np-karaoke) {
  background-color: ${palette.accent}55;
  color: inherit;
}
::highlight(np-saved-0) { background-color: ${palette.tertiary}55; }
::highlight(np-saved-1) { background-color: ${palette.secondary}55; }
::highlight(np-saved-2) { background-color: ${palette.accent}55; }
::highlight(np-saved-3) { background-color: ${palette.warn}55; }
.np-word-active {
  background-color: ${palette.accent}55;
  border-radius: 3px;
}
.np-eq-active {
  outline: 2px solid ${palette.accent};
  outline-offset: 2px;
  border-radius: 3px;
}
`;
}

// Assemble the final chapter document. The chapter's own <head> (publisher
// CSS links, meta) is preserved; <base> makes every relative asset resolve
// against the backend's epub mount, and the runtime + theme land on top.
export function buildChapterHtml({ chapterXhtml, baseHref, themeCss, pageAnchors }) {
  const inject =
    `<base href="${baseHref}">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<style id="np-theme">${themeCss}</style>` +
    `<script>window.__NP_PAGE_ANCHORS=${JSON.stringify(pageAnchors || [])};</script>` +
    `<script>${EPUB_RUNTIME_JS}</script>`;

  let html = String(chapterXhtml);
  // XHTML served as text/html parses fine in every WebView; strip the XML
  // prolog so nothing renders it as a stray line.
  html = html.replace(/^\s*<\?xml[^>]*\?>/i, '');
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${inject}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${inject}</head>`);
  }
  return `<!doctype html><html><head>${inject}</head><body>${html}</body></html>`;
}
