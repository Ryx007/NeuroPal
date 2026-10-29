import Foundation

/// The in-page half of the EPUB reader, ported from the Expo app's
/// epubRuntime.js. The chapter is the publisher's XHTML, shown as shipped;
/// the runtime walks its DOM once, tokenizes it and sends the token stream
/// to the app, which reads exactly that stream aloud and lights each word
/// back through `epubHighlight(i)`.
///
/// Security (the book is untrusted):
///   - the page's own JavaScript is off (`allowsContentJavaScript = false`);
///     this runtime runs in an isolated content world the book can't reach;
///   - a strict Content-Security-Policy (the same policy as Expo's
///     `buildChapterHtml`) comes before any of the book's markup — no
///     scripts, resources only from the book's own origin, no forms, frames
///     or fetches, no referrer — and is also sent as a response header;
///   - the book's scripts, handlers, javascript: URLs, meta refreshes and
///     <base> tags are stripped as a second layer;
///   - every file loads through the app's `npbook:` scheme handler, which
///     only serves paths inside the book (the document ticket never enters
///     the page).
enum EpubRuntime {
    static let scheme = "npbook"
    static let host = "book"

    /// The npbook: URL of a file inside the book (fragment kept apart).
    static func url(for href: String) -> URL? {
        let parts = href.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
        let path = parts.first.map(String.init) ?? href
        let encoded = path.split(separator: "/", omittingEmptySubsequences: false).map { segment -> String in
            let raw = String(segment).removingPercentEncoding ?? String(segment)
            var allowed = CharacterSet.urlPathAllowed
            allowed.remove(charactersIn: "/?#")
            return raw.addingPercentEncoding(withAllowedCharacters: allowed) ?? raw
        }.joined(separator: "/")
        return URL(string: "\(scheme)://\(host)/\(encoded)")
    }

    /// The book path of an npbook: URL ("OEBPS/ch1.xhtml", still percent-encoded).
    static func path(of url: URL) -> String {
        let p = url.path(percentEncoded: true)
        return p.hasPrefix("/") ? String(p.dropFirst()) : p
    }

    static let csp = [
        "default-src 'none'",
        "script-src 'none'",
        "style-src 'self' npbook: 'unsafe-inline'",
        "img-src 'self' npbook: data: blob:",
        "font-src 'self' npbook: data:",
        "media-src 'self' npbook: data: blob:",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'none'",
        "connect-src 'none'",
        "object-src 'none'",
    ].joined(separator: "; ")

    /// The chapter document: our policy and theme first, then the book's
    /// markup with its active content stripped.
    static func chapterHTML(_ xhtml: String, themeCSS: String) -> String {
        let inject = "<meta http-equiv=\"Content-Security-Policy\" content=\"\(csp)\">"
            + "<meta name=\"referrer\" content=\"no-referrer\">"
            + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            + "<style id=\"np-theme\">\(themeCSS)</style>"
        return "<!doctype html>" + inject + sanitize(xhtml)
    }

    static func sanitize(_ source: String) -> String {
        var html = source
        html = html.replacingOccurrences(of: #"^\s*<\?xml[^>]*\?>"#, with: "", options: [.regularExpression, .caseInsensitive])
        html = html.replacingOccurrences(of: #"^\s*<!doctype[^>]*>"#, with: "", options: [.regularExpression, .caseInsensitive])
        html = html.replacingOccurrences(of: #"<script\b[^<>]*>[\s\S]*?</script\s*>"#, with: "",
                                         options: [.regularExpression, .caseInsensitive])
        html = html.replacingOccurrences(of: #"<script\b[^<>]*/>"#, with: "", options: [.regularExpression, .caseInsensitive])
        html = html.replacingOccurrences(of: #"<base\b(?:[^<>"']|"[^"]*"|'[^']*')*>"#, with: "",
                                         options: [.regularExpression, .caseInsensitive])
        html = replace(#"<meta\b(?:[^<>"']|"[^"]*"|'[^']*')*>"#, in: html) { tag in
            tag.range(of: #"http-equiv|name\s*=\s*["']?\s*referrer"#, options: [.regularExpression, .caseInsensitive]) != nil
                ? "" : tag
        }
        // Attributes only inside tags — the chapter's text stays untouched.
        html = replace(#"<[a-zA-Z][^<>]*>"#, in: html) { tag in
            var t = tag.replacingOccurrences(of: #"[\s/]+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)"#, with: " ",
                                             options: [.regularExpression, .caseInsensitive])
            t = t.replacingOccurrences(of: #"((?:xlink:)?href|src)\s*=\s*(["'])\s*javascript:[^"']*\2"#, with: "$1=$2#$2",
                                       options: [.regularExpression, .caseInsensitive])
            return t
        }
        return html
    }

    private static func replace(_ pattern: String, in s: String, _ transform: (String) -> String) -> String {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return s }
        let ns = s as NSString
        var out = ""
        var last = 0
        for match in regex.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: last, length: match.range.location - last))
            out += transform(ns.substring(with: match.range))
            last = NSMaxRange(match.range)
        }
        out += ns.substring(from: last)
        return out
    }

    /// App CSS on top of the publisher's: page frame, palette, typography.
    static func themeCSS(page: ReaderPage, fontSize: CGFloat, lineSpacing: CGFloat, bottomPadding: CGFloat) -> String {
        let c = page.css
        let size = Int(fontSize.rounded())
        let lineHeight = String(format: "%.2f", (fontSize * 1.3 + lineSpacing) / max(1, fontSize))
        return """
        @font-face { font-family: "NPReader"; src: url("npbook://book/__np__/font/reader"); }
        html, body { background: \(c.surface) !important; color: \(c.text) !important; }
        html { -webkit-text-size-adjust: none; }
        body {
          font-size: \(size)px !important; line-height: \(lineHeight) !important;
          margin: 0 auto !important; max-width: 40em;
          padding: 20px 22px \(Int(bottomPadding))px !important;
          -webkit-tap-highlight-color: transparent;
          overflow-wrap: break-word;
        }
        body, body p, body div, body li, body td, body th, body blockquote, body span, body dd, body dt {
          color: \(c.text) !important; font-family: "NPReader", -apple-system, sans-serif !important;
          line-height: \(lineHeight) !important;
        }
        body h1, body h2, body h3, body h4, body h5, body h6 {
          color: \(c.text) !important; font-family: "NPReader", -apple-system, sans-serif !important; line-height: 1.25 !important;
        }
        a, a * { color: \(c.accentText) !important; }
        img, svg, video { max-width: 100% !important; height: auto !important; }
        ::selection { background: \(c.accent)44; }
        ::highlight(np-karaoke) { background-color: \(c.accent)55; color: inherit; text-decoration: underline 3px \(c.accentText); }
        .np-word-active { background-color: \(c.accent)55; border-radius: 3px; text-decoration: underline 3px \(c.accentText); }
        .np-eq-active { outline: 2px solid \(c.accentText); outline-offset: 2px; border-radius: 3px; }
        """
    }

    /// The runtime, with this chapter's print-page anchors.
    static func script(pageAnchorsJSON: String) -> String {
        "var __NP_PAGE_ANCHORS = \(pageAnchorsJSON);\n" + runtime
    }

    static let runtime = #"""
    (function () {
      'use strict';
      if (window.__npRuntime) return;
      window.__npRuntime = true;
      var TOKENS = [];
      var PIDS = [];
      var NODE_FIRST = new Map();
      var hasHighlightAPI = typeof window.Highlight === 'function' && window.CSS && CSS.highlights;
      var lastScrollAt = 0;
      var touchedAt = 0;

      function send(m) {
        try { window.webkit.messageHandlers.np.postMessage(m); } catch (e) {}
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
            TOKENS.push({ el: n }); PIDS.push(pid);
            words.push(isMath ? '[equation]' : '[image]');
            kinds.push(isMath ? 'eq' : 'img');
            continue;
          }
          NODE_FIRST.set(n, TOKENS.length);
          var re = /\S+/g, m;
          while ((m = re.exec(n.nodeValue))) {
            TOKENS.push({ node: n, start: m.index, end: m.index + m[0].length });
            PIDS.push(pid); words.push(m[0]); kinds.push('w');
          }
        }
        var pageAnchors = [];
        var list = (typeof __NP_PAGE_ANCHORS !== 'undefined' && __NP_PAGE_ANCHORS) || [];
        for (var i = 0; i < list.length; i++) {
          var el = list[i].anchor ? document.getElementById(list[i].anchor) : null;
          var idx = el ? firstTokenAtOrAfter(el) : 0;
          if (idx >= 0) pageAnchors.push({ page: String(list[i].page), index: idx });
        }
        send({ type: 'tokens', words: words, kinds: kinds, pids: PIDS, pageAnchors: pageAnchors });
      }

      function firstTokenAtOrAfter(el) {
        for (var i = 0; i < TOKENS.length; i++) {
          var t = TOKENS[i];
          var node = t.node || t.el || t.span;
          if (!node) continue;
          var rel = el.compareDocumentPosition(node);
          if (node === el || el.contains(node) || (rel & Node.DOCUMENT_POSITION_FOLLOWING)) return i;
        }
        return -1;
      }

      function rangeFor(i) {
        var t = TOKENS[i];
        if (!t || t.el || !t.node) return null;
        var r = document.createRange();
        try { r.setStart(t.node, t.start); r.setEnd(t.node, t.end); } catch (e) { return null; }
        return r;
      }

      var wrappedPid = -1;
      function wrapParagraph(pid) {
        if (wrappedPid === pid) return;
        wrappedPid = pid;
        for (var i = TOKENS.length - 1; i >= 0; i--) {
          if (PIDS[i] !== pid || TOKENS[i].el || TOKENS[i].span) continue;
          var r = rangeFor(i);
          if (!r) continue;
          var span = document.createElement('span');
          span.className = 'np-word';
          try { r.surroundContents(span); } catch (e) { continue; }
          TOKENS[i] = { span: span };
        }
      }

      window.epubHighlight = function (i, scroll) {
        var t = TOKENS[i];
        if (!t) return;
        var rect = null;
        var actives = document.querySelectorAll('.np-eq-active');
        for (var q = 0; q < actives.length; q++) actives[q].classList.remove('np-eq-active');
        if (t.el) {
          t.el.classList.add('np-eq-active');
          if (hasHighlightAPI) CSS.highlights.delete('np-karaoke');
          rect = t.el.getBoundingClientRect();
        } else if (hasHighlightAPI && t.node) {
          var r = rangeFor(i);
          if (r) { CSS.highlights.set('np-karaoke', new Highlight(r)); rect = r.getBoundingClientRect(); }
        } else {
          wrapParagraph(PIDS[i]);
          var prev = document.querySelector('.np-word-active');
          if (prev) prev.classList.remove('np-word-active');
          var t2 = TOKENS[i];
          if (t2 && t2.span) { t2.span.classList.add('np-word-active'); rect = t2.span.getBoundingClientRect(); }
        }
        if (rect && scroll !== false) {
          var vh = window.innerHeight, now = Date.now();
          if (now - touchedAt > 5000 && (rect.top < vh * 0.12 || rect.bottom > vh * 0.62) && now - lastScrollAt > 400) {
            lastScrollAt = now;
            window.scrollTo({ top: window.scrollY + rect.top - vh * 0.3, behavior: 'smooth' });
          }
        }
      };

      function tokenAtPoint(x, y) {
        var el = document.elementFromPoint(x, y);
        if (el && el.tagName === 'IMG') { for (var i = 0; i < TOKENS.length; i++) if (TOKENS[i].el === el) return i; }
        if (el && el.classList && el.classList.contains('np-word')) { for (var j = 0; j < TOKENS.length; j++) if (TOKENS[j].span === el) return j; }
        var pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
        if (!pos || !pos.startContainer || pos.startContainer.nodeType !== 3) return -1;
        return tokenForNodeOffset(pos.startContainer, pos.startOffset);
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
      document.addEventListener('touchmove', function () { touchedAt = Date.now(); }, { capture: true, passive: true });
      document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (a) { e.preventDefault(); send({ type: 'link', href: a.getAttribute('href') || '' }); return; }
        if (downAt && (Math.abs(e.clientX - downAt.x) > 10 || Math.abs(e.clientY - downAt.y) > 10)) return;
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        var idx = tokenAtPoint(e.clientX, e.clientY);
        if (idx >= 0) send({ type: 'tap', index: idx });
      }, true);

      var selTimer = null;
      document.addEventListener('selectionchange', function () {
        if (selTimer) clearTimeout(selTimer);
        selTimer = setTimeout(function () {
          var sel = window.getSelection();
          if (!sel || sel.isCollapsed || sel.rangeCount === 0) { send({ type: 'sel-clear' }); return; }
          send({ type: 'sel', text: sel.toString().slice(0, 600) });
        }, 250);
      });

      window.epubClearSelection = function () { var s = window.getSelection(); if (s) s.removeAllRanges(); };

      window.epubSeekAnchor = function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var idx = firstTokenAtOrAfter(el);
        if (idx < 0 && TOKENS.length > 0) idx = TOKENS.length - 1;
        try { el.scrollIntoView({ block: 'start' }); lastScrollAt = Date.now(); } catch (e) {}
        if (idx >= 0) send({ type: 'anchor', index: idx });
      };

      window.epubTheme = function (css) {
        var el = document.getElementById('np-theme');
        if (el) el.textContent = css;
      };

      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tokenize);
      else tokenize();
    })();
    """#
}
