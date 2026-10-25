# NeuroPal API — production image (used by deploy/vps).
# Node 22 LTS (same as CI). The OS tools are what ingest shells out to:
#   poppler-utils  pdftoppm (page images, OCR rasterising)
#   tesseract-ocr  OCR for scanned PDFs
#   djvulibre-bin  djvutxt for DjVu books
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      poppler-utils tesseract-ocr tesseract-ocr-eng djvulibre-bin \
      ca-certificates tini \
 && apt-get clean \
 && find /var/lib/apt/lists -mindepth 1 -delete

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src

ENV NODE_ENV=production \
    PORT=4000 \
    STORAGE_ROOT=/data/storage
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
