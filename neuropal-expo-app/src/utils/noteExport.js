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

export function buildNoteSvg({ strokes, width, height, background }) {
  const paths = strokes
    .map(
      (s) =>
        `<path d="${strokeToPath(s.points)}" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
    )
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${background}"/>
  ${paths}
</svg>`;
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
