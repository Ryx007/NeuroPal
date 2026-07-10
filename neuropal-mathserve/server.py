"""neuropal-mathserve — local math-aware PDF extraction (P1 Tier B).

Runs facebook/nougat-small (the Nougat neural PDF->Markdown model, per the
owner's DECISION: local, Nougat only) through the maintained transformers
runtime on Apple-Silicon MPS. Sits beside the Node backend on the Mac Mini;
the Node ingest pipeline submits a job and polls it.

API (all requests need `x-mathserve-token` when MATHSERVE_TOKEN is set):
  GET  /healthz          -> {status:'ok', model, device}
  POST /extract          {path, start_page?, end_page?} -> {job_id}
  GET  /jobs/{job_id}    -> {status: queued|running|done|error,
                             done, total, markdown?, error?}

Security posture: binds 127.0.0.1, requires a shared-secret token, rejects
non-localhost Host headers (DNS-rebinding), and only reads PDFs under
MATHSERVE_ALLOWED_ROOT. This service can read files — it must not be an
open localhost oracle.

Jobs run on a single worker thread (one model instance, sequential pages).
Terminal jobs are evicted after a TTL so a weeks-running process doesn't
pin every extracted book in memory.
"""

import os
import queue
import threading
import time
import uuid
from pathlib import Path

import pypdfium2 as pdfium
import torch
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel


def _load_dotenv():
    """Tiny .env loader (no python-dotenv dep) — pm2 doesn't pass shell env."""
    env_file = Path(__file__).parent / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()

MODEL_ID = os.environ.get("NOUGAT_MODEL", "facebook/nougat-small")
PORT = int(os.environ.get("MATHSERVE_PORT", "8077"))
TOKEN = os.environ.get("MATHSERVE_TOKEN", "")
ALLOWED_ROOT = os.environ.get("MATHSERVE_ALLOWED_ROOT", "")
# Render scale for page rasterisation. Nougat's processor resizes to its own
# input size; ~2x (≈150dpi) keeps glyphs crisp without huge intermediates.
RENDER_SCALE = float(os.environ.get("NOUGAT_RENDER_SCALE", "2.0"))
MAX_RENDER_DIM = int(os.environ.get("NOUGAT_MAX_RENDER_DIM", "4500"))
MAX_NEW_TOKENS = int(os.environ.get("NOUGAT_MAX_NEW_TOKENS", "3584"))
# Give up on a job after this many CONSECUTIVE page failures (an MPS OOM
# cascade would otherwise grind for hours producing nothing).
MAX_CONSECUTIVE_PAGE_FAILURES = 5
JOB_TTL_SEC = 15 * 60  # terminal jobs evicted after this

app = FastAPI(title="neuropal-mathserve")

_model = None
_processor = None
_device = "cpu"
_model_lock = threading.Lock()

JOBS: dict = {}
JOBS_LOCK = threading.Lock()
JOB_QUEUE: "queue.Queue[str]" = queue.Queue()


def check_request(request: Request):
    """Shared-secret + Host validation on every data endpoint."""
    host = (request.headers.get("host") or "").split(":")[0]
    if host not in ("localhost", "127.0.0.1"):
        raise HTTPException(status_code=403, detail="forbidden host")
    if TOKEN and request.headers.get("x-mathserve-token") != TOKEN:
        raise HTTPException(status_code=401, detail="missing or bad token")


def sweep_jobs():
    """Evict terminal jobs past their TTL (called from request handlers)."""
    now = time.time()
    with JOBS_LOCK:
        stale = [
            jid
            for jid, j in JOBS.items()
            if j["status"] in ("done", "error") and now - j.get("ended_at", now) > JOB_TTL_SEC
        ]
        for jid in stale:
            del JOBS[jid]


def get_model():
    """Lazy-load so /healthz answers instantly on boot; first job pays the
    model load (and the one-time HF download)."""
    global _model, _processor, _device
    with _model_lock:
        if _model is None:
            from transformers import NougatProcessor, VisionEncoderDecoderModel

            _processor = NougatProcessor.from_pretrained(MODEL_ID)
            _model = VisionEncoderDecoderModel.from_pretrained(MODEL_ID)
            _device = "mps" if torch.backends.mps.is_available() else "cpu"
            _model.to(_device)
            _model.eval()
    return _model, _processor, _device


def extract_page(image):
    model, processor, device = get_model()
    pixel_values = processor(images=image, return_tensors="pt").pixel_values
    with torch.no_grad():
        outputs = model.generate(
            pixel_values.to(device),
            min_length=1,
            max_new_tokens=MAX_NEW_TOKENS,
            bad_words_ids=[[processor.tokenizer.unk_token_id]],
            # Nougat's classic failure mode is a phrase-repetition loop that
            # burns the whole token budget and injects gibberish. Long-window
            # n-gram blocking kills the loop without harming legit repeats.
            no_repeat_ngram_size=30,
        )
    page = processor.batch_decode(outputs, skip_special_tokens=True)[0]
    return processor.post_process_generation(page, fix_markdown=True)


def render_page(page):
    """Rasterise with a hard output-dimension cap — a 200-inch art-poster
    page at scale 2 would be a multi-GB allocation."""
    width, height = page.get_size()
    scale = RENDER_SCALE
    biggest = max(width, height) * scale
    if biggest > MAX_RENDER_DIM:
        scale = MAX_RENDER_DIM / max(width, height)
    bitmap = page.render(scale=scale)
    return bitmap.to_pil().convert("RGB")


def worker():
    while True:
        job_id = JOB_QUEUE.get()
        job = JOBS.get(job_id)
        if job is None:
            continue
        job["status"] = "running"
        try:
            pdf = pdfium.PdfDocument(job["path"])
            try:
                n_pages = len(pdf)
                start = max(0, job["start_page"] - 1) if job["start_page"] else 0
                end = min(n_pages, job["end_page"]) if job["end_page"] else n_pages
                job["total"] = end - start

                pages_md = []
                consecutive_failures = 0
                for i in range(start, end):
                    try:
                        pages_md.append(extract_page(render_page(pdf[i])))
                        consecutive_failures = 0
                    except Exception as page_err:  # noqa: BLE001
                        pages_md.append("")
                        consecutive_failures += 1
                        print(f"[mathserve] page {i + 1} failed: {page_err}")
                        # release the MPS caching allocator so one OOM does
                        # not cascade through every remaining page
                        if _device == "mps":
                            try:
                                torch.mps.empty_cache()
                            except Exception:  # noqa: BLE001
                                pass
                        if consecutive_failures >= MAX_CONSECUTIVE_PAGE_FAILURES:
                            raise RuntimeError(
                                f"aborted after {consecutive_failures} consecutive page failures"
                            ) from page_err
                    job["done"] = i - start + 1
                job["markdown"] = "\n\n".join(p for p in pages_md if p.strip())
                job["status"] = "done"
            finally:
                pdf.close()
        except Exception as err:  # noqa: BLE001
            job["status"] = "error"
            job["error"] = str(err)
        finally:
            job["ended_at"] = time.time()
            JOB_QUEUE.task_done()


threading.Thread(target=worker, daemon=True).start()


class ExtractRequest(BaseModel):
    path: str
    start_page: int | None = None
    end_page: int | None = None


@app.get("/healthz")
def healthz():
    return {
        "status": "ok",
        "model": MODEL_ID,
        "device": _device if _model is not None else "unloaded",
        "queued": JOB_QUEUE.qsize(),
    }


@app.post("/extract")
def extract(req: ExtractRequest, request: Request):
    check_request(request)
    sweep_jobs()

    p = Path(req.path)
    try:
        resolved = p.resolve(strict=True)
    except OSError:
        raise HTTPException(status_code=400, detail=f"no such file: {req.path}")
    if not resolved.is_file() or resolved.suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="only existing .pdf inputs are supported")
    if ALLOWED_ROOT:
        try:
            resolved.relative_to(Path(ALLOWED_ROOT).resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="path outside the allowed root")

    job_id = uuid.uuid4().hex
    with JOBS_LOCK:
        JOBS[job_id] = {
            "status": "queued",
            "path": str(resolved),
            "start_page": req.start_page,
            "end_page": req.end_page,
            "done": 0,
            "total": 0,
        }
    JOB_QUEUE.put(job_id)
    return {"job_id": job_id}


@app.get("/jobs/{job_id}")
def job_status(job_id: str, request: Request):
    check_request(request)
    sweep_jobs()

    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job")
    out = {
        "status": job["status"],
        "done": job["done"],
        "total": job["total"],
    }
    if job["status"] == "done":
        out["markdown"] = job.get("markdown", "")
    if job["status"] == "error":
        out["error"] = job.get("error", "unknown error")
    return out


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT)
