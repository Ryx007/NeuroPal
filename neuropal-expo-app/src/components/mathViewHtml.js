// Shared HTML builder for the KaTeX equation views (native WebView + web
// iframe). Self-contained page; KaTeX css/js come from the backend's
// /katex static mount.

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
  function report(){
    var h = document.body.scrollHeight;
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
  setTimeout(report, 60);
  setTimeout(report, 300);
</script></body></html>`;
}
