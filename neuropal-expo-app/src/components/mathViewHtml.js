// Shared HTML builder for the KaTeX equation views (native WebView + web
// iframe). Self-contained page; KaTeX css/js come from the backend's
// /katex static mount.

// Sanity ceiling on a reported height. Both hosts CLAMP to this rather than
// discarding the message: dropping it leaves the frame at its 64px default,
// which looks exactly like the clipping this measurement exists to prevent.
export const MAX_EQ_HEIGHT = 2000;

// Shared by MathView.js / MathView.web.js so native and web can never drift.
// Returns null for anything that isn't a usable measurement — notably 0,
// which is what a failed measurement reports.
export function clampEqHeight(h) {
  if (!Number.isFinite(h) || h <= 20) return null;
  return Math.min(h, MAX_EQ_HEIGHT) + 8;
}

export function buildEquationHtml(latex, color, fontSize, host) {
  const payload = JSON.stringify(String(latex || ""));
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="${host}/katex/katex.min.css">
<script src="${host}/katex/katex.min.js"></script>
<style>
  html,body{margin:0;padding:0;background:transparent;overflow-x:auto;overflow-y:hidden}
  #eq{color:${color};font-size:${fontSize}px;padding:10px 6px;text-align:center}
  #eq .katex{font-size:1.15em}
</style></head><body>
<div id="eq"></div>
<script>
  var src = ${payload};
  var el = document.getElementById('eq');
  var last = 0;
  // Measure #eq, not documentElement: #eq is a block box with auto height, so
  // its rect is purely CONTENT-driven. documentElement.scrollHeight reports
  // the VIEWPORT instead — i.e. whatever height the host just gave us — so
  // using it would ratchet the frame taller on every report, forever.
  // (body.scrollHeight is content-driven too, since body sets overflow here,
  // which is why it is the fallback.)
  function measure(){
    var h = Math.ceil(el.getBoundingClientRect().height);
    if (!h) h = Math.ceil(el.scrollHeight || document.body.scrollHeight || 0);
    return h;
  }
  function report(){
    var h = measure();
    if (!h || h === last) return;
    last = h;
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(String(h));
    else if (window.parent !== window) window.parent.postMessage({neuropalEqHeight: h}, '*');
  }
  try {
    if (window.katex) {
      katex.render(src, el, { displayMode: true, throwOnError: false });
    } else {
      el.textContent = src;
    }
  } catch (e) {
    el.textContent = src;
  }
  report();
  // Keep measuring. The old code measured exactly twice (60ms/300ms) and
  // never again, so any frame that had no layout yet at both of those
  // instants — a backgrounded tab, an offscreen/hidden container — reported 0
  // and stayed at the host's 64px default forever, clipping tall display
  // math. ResizeObserver is what actually rescues that case; fonts.ready
  // catches KaTeX's web fonts landing after first layout and changing the
  // metrics; the timeouts stay as belt-and-braces.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(report).catch(function(){});
  if (window.ResizeObserver) new ResizeObserver(report).observe(el);
  window.addEventListener('load', report);
  setTimeout(report, 60);
  setTimeout(report, 300);
</script></body></html>`;
}
