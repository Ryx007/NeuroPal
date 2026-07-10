# neuropal-mathserve

Local math-aware PDF extraction for NeuroPal (P1 Tier B). Runs
**facebook/nougat-small** (neural PDF→Markdown, math preserved as LaTeX)
through the maintained `transformers` runtime on Apple-Silicon **MPS** —
the unmaintained `nougat-ocr` CLI pins deps that don't build on modern
Python, so we load the same model the supported way.

The Node backend (`neuropal-backend/src/services/mathserve.js`) submits jobs
here during ingest when a PDF's math-glyph density crosses
`MATH_DENSITY_MIN`; if this service is down, ingest silently falls back to
`pdf-parse`. Binds `127.0.0.1` only.

## Setup (once, on the Mini)

```bash
cd neuropal-mathserve
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

First job downloads the model (~1 GB) to `~/.cache/huggingface`.

## Run

```bash
.venv/bin/python server.py                      # foreground (port 8077)
pm2 start server.py --name neuropal-mathserve \
    --interpreter "$PWD/.venv/bin/python"        # under pm2 (recommended)
```

Health check: `curl localhost:8077/healthz`

## Env

| Var | Default | Meaning |
|---|---|---|
| `MATHSERVE_PORT` | `8077` | listen port (backend's `MATHSERVE_URL` must match) |
| `NOUGAT_MODEL` | `facebook/nougat-small` | HF model id (`facebook/nougat-base` = better/slower) |
| `NOUGAT_RENDER_SCALE` | `2.0` | page rasterisation scale |
| `NOUGAT_MAX_NEW_TOKENS` | `3584` | per-page generation cap |
