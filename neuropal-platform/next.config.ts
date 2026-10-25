import type { NextConfig } from "next";

// Optional sub-path when the site is not served from the domain root,
// e.g. NEXT_PUBLIC_BASE_PATH=/platform for http://host/platform/.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Fully static: `next build` writes plain HTML/CSS/JS to out/.
  output: "export",
  // /learn/ → out/learn/index.html, which any static host serves without rewrites.
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
