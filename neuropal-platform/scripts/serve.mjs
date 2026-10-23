#!/usr/bin/env node
// Tiny static server for the exported site (no dependencies).
//   node scripts/serve.mjs [dir]        default dir: out
//   PORT=4321 HOST=0.0.0.0 node scripts/serve.mjs
// Honours NEXT_PUBLIC_BASE_PATH the same way the build does.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] || "out");
const port = Number(process.env.PORT || 4321);
const host = process.env.HOST || "127.0.0.1";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

if (!existsSync(root)) {
  console.error(`Nothing to serve: ${root} does not exist. Run "npm run build" first.`);
  process.exit(1);
}

function send(res, status, file, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": TYPES[extname(file)] || "application/octet-stream",
    "Cache-Control": file.includes(`${sep}_next${sep}static${sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (basePath) {
    if (pathname === basePath) pathname = "/";
    else if (pathname.startsWith(`${basePath}/`)) pathname = pathname.slice(basePath.length);
  }
  const abs = normalize(join(root, pathname));
  if (abs !== root && !abs.startsWith(root + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  let st = null;
  try {
    st = statSync(abs);
  } catch {
    st = null;
  }
  if (st && st.isDirectory()) {
    if (!pathname.endsWith("/")) {
      res.writeHead(301, { Location: `${basePath}${pathname}/` }).end();
      return;
    }
    const index = join(abs, "index.html");
    if (existsSync(index)) return send(res, 200, index);
  } else if (st && st.isFile()) {
    return send(res, 200, abs);
  } else if (existsSync(`${abs}.html`)) {
    return send(res, 200, `${abs}.html`);
  }
  const notFound = join(root, "404.html");
  if (existsSync(notFound)) return send(res, 404, notFound);
  res.writeHead(404).end("Not found");
}).listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}${basePath}/`);
});
