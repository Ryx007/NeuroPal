import { Platform } from "react-native";

// Handwritten-note export. The strokes ARE the document (vector data), so
// SVG is rebuilt from them rather than screenshotting the live view — the
// output is resolution-independent and identical on web and native.
//
//   PDF   expo-print (native: share sheet via expo-sharing; web: the
//         browser print dialog, which saves to PDF)
//   PNG   web: SVG → canvas rasterize → download
//         native: react-native-view-shot capture of the canvas view →
//         share sheet (viewShotRef is passed in from the editor)
//   SVG   web download / native share of the vector file itself

export function strokeToPath(points) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${x} ${y} L ${x + 0.1} ${y + 0.1}`;
  }
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    d += ` Q ${x1} ${y1} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Greedy soft-wrap for the SVG flatten — the canvas wraps text at the block
// width, the export approximates it with a monospace-ish char budget.
function wrapLines(content, maxChars) {
  const out = [];
  for (const hard of String(content).split("\n")) {
    let line = "";
    for (const word of hard.split(/\s+/)) {
      if (!word) continue;
      if (line && (line + " " + word).length > maxChars) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    out.push(line);
  }
  return out;
}

// Issue 2: the flatten renders BOTH layers — strokes as vector paths and
// text blocks as wrapped <text> lines (markdown/math kept verbatim; the
// export is a faithful page, not a re-typeset).
export function buildNoteSvg({ strokes, blocks = [], width, height, background, textColor = "#222" }) {
  const paths = strokes
    .map(
      (s) =>
        `<path d="${strokeToPath(s.points)}" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
    )
    .join("\n  ");
  const FONT = 14;
  const LINE = 20;
  const texts = blocks
    .filter((b) => b.type === "text" && String(b.content || "").trim())
    .map((b) => {
      const w = b.w === -1 ? width - b.x - 16 : b.w;
      const lines = wrapLines(b.content, Math.max(8, Math.floor(w / (FONT * 0.62))));
      const spans = lines
        .map(
          (line, i) =>
            `<tspan x="${b.x + 8}" y="${b.y + 8 + FONT + i * LINE}">${escapeXml(line)}</tspan>`
        )
        .join("");
      return `<text font-family="Helvetica, Arial, sans-serif" font-size="${FONT}" fill="${textColor}">${spans}</text>`;
    })
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${background}"/>
  ${paths}
  ${texts}
</svg>`;
}

// Issue 2: canvas → Markdown. Text blocks in reading order (top-to-bottom),
// with an "[ink drawing]" marker where each vertical CLUSTER of strokes
// sits — honest about what a text format can't carry.
export function canvasToMarkdown({ blocks = [], strokes = [] }) {
  const items = blocks
    .filter((b) => b.type === "text" && String(b.content || "").trim())
    .map((b) => ({ y: b.y, md: b.content.trim() }));

  const tops = strokes
    .map((s) => Math.min(...s.points.map((p) => p[1])))
    .sort((a, b) => a - b);
  let clusterStart = null;
  let prev = null;
  for (const y of tops) {
    if (clusterStart === null) {
      clusterStart = y;
    } else if (y - prev > 140) {
      items.push({ y: clusterStart, md: "[ink drawing]" });
      clusterStart = y;
    }
    prev = y;
  }
  if (clusterStart !== null) items.push({ y: clusterStart, md: "[ink drawing]" });

  return items
    .sort((a, b) => a.y - b.y)
    .map((i) => i.md)
    .join("\n\n");
}

function safeFilename(title) {
  return (title || "note").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60);
}

function downloadBlobWeb(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoke on a delay so the download has started
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportNotePdf({ svg, title }) {
  const Print = require("expo-print");
  const html = `<html><head><meta charset="utf-8"><title>${title || "Note"}</title></head>
<body style="margin:0">${svg}</body></html>`;

  if (Platform.OS === "web") {
    // The browser's print dialog is the PDF writer on web.
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const Sharing = require("expo-sharing");
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: title || "Note",
    UTI: "com.adobe.pdf",
  });
}

export async function exportNoteImage({ svg, width, height, title, viewShotRef }) {
  if (Platform.OS === "web") {
    const blob = await new Promise((resolve, reject) => {
      const img = new Image();
      const svgUrl = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml" })
      );
      img.onload = () => {
        URL.revokeObjectURL(svgUrl);
        const canvas = document.createElement("canvas");
        // 2x for crispness on hidpi screens
        canvas.width = width * 2;
        canvas.height = height * 2;
        const ctx = canvas.getContext("2d");
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("rasterize failed"))), "image/png");
      };
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        reject(new Error("could not rasterize the note"));
      };
      img.src = svgUrl;
    });
    downloadBlobWeb(blob, `${safeFilename(title)}.png`);
    return;
  }

  // Native: capture the already-rendered canvas view.
  const { captureRef } = require("react-native-view-shot");
  const uri = await captureRef(viewShotRef, { format: "png", quality: 1 });
  const Sharing = require("expo-sharing");
  await Sharing.shareAsync(uri, {
    mimeType: "image/png",
    dialogTitle: title || "Note",
  });
}

// ---- typed-note export (P6): canonical .md + stripped .txt ------------------

async function exportTextFile({ title, content, ext, mime }) {
  const filename = `${safeFilename(title)}.${ext}`;
  if (Platform.OS === "web") {
    downloadBlobWeb(new Blob([content], { type: `${mime};charset=utf-8` }), filename);
    return;
  }
  const FileSystem = require("expo-file-system/legacy");
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, content);
  const Sharing = require("expo-sharing");
  await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: title || "Note" });
}

export async function exportNoteMarkdown({ title, markdown }) {
  const body = `# ${title || "Note"}\n\n${markdown || ""}`.trim() + "\n";
  await exportTextFile({ title, content: body, ext: "md", mime: "text/markdown" });
}

// .txt = markdown syntax stripped, math kept verbatim ($…$ reads fine as text)
export function markdownToTxt(markdown) {
  return String(markdown || "")
    .replace(/^```[a-z]*\n?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function exportNoteTxt({ title, markdown }) {
  const body = `${title || "Note"}\n\n${markdownToTxt(markdown)}\n`;
  await exportTextFile({ title, content: body, ext: "txt", mime: "text/plain" });
}

export async function exportNoteSvg({ svg, title }) {
  if (Platform.OS === "web") {
    downloadBlobWeb(new Blob([svg], { type: "image/svg+xml" }), `${safeFilename(title)}.svg`);
    return;
  }
  const FileSystem = require("expo-file-system/legacy");
  const path = `${FileSystem.cacheDirectory}${safeFilename(title)}.svg`;
  await FileSystem.writeAsStringAsync(path, svg);
  const Sharing = require("expo-sharing");
  await Sharing.shareAsync(path, {
    mimeType: "image/svg+xml",
    dialogTitle: title || "Note",
  });
}
