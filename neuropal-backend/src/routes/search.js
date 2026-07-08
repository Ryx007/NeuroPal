const path = require('path');
const fs = require('fs/promises');
const { Router } = require('express');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const { Document } = require('../models');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { ingestDocument } = require('../services/ingestPipeline');

const STORAGE_ROOT = process.env.STORAGE_ROOT || './storage';

// Academic paper search — two providers behind one endpoint:
//
//   arxiv    export.arxiv.org Atom API (no key, physics/math/CS preprints)
//   scholar  Semantic Scholar Graph API (no key at low volume) — Google
//            Scholar itself has no public API, and Semantic Scholar indexes
//            the same scholarly corpus with clean metadata + OA pdf links
//
// Both normalize to one result shape:
//   { source, id, title, authors[], year, venue, abstract, pdfUrl, url,
//     citationCount }
// pdfUrl===null means "no open-access PDF" — the client shows the result
// but disables one-tap import for it.

const ARXIV_API = 'http://export.arxiv.org/api/query';
const S2_API = 'https://api.semanticscholar.org/graph/v1/paper/search';
const RESULTS_PER_SOURCE = 15;

async function searchArxiv(q) {
    const { data } = await axios.get(ARXIV_API, {
        params: {
            search_query: `all:${q}`,
            start: 0,
            max_results: RESULTS_PER_SOURCE,
            sortBy: 'relevance',
        },
        timeout: 15000,
    });

    const parsed = new XMLParser({ ignoreAttributes: false }).parse(data);
    let entries = parsed?.feed?.entry || [];
    if (!Array.isArray(entries)) entries = [entries];

    return entries.map((e) => {
        const authors = (Array.isArray(e.author) ? e.author : [e.author])
            .filter(Boolean)
            .map((a) => a.name);
        let links = e.link || [];
        if (!Array.isArray(links)) links = [links];
        const pdfLink = links.find((l) => l['@_title'] === 'pdf')?.['@_href'];
        const absId = String(e.id || '');
        return {
            source: 'arxiv',
            id: absId.replace(/^https?:\/\/arxiv\.org\/abs\//, ''),
            title: String(e.title || '').replace(/\s+/g, ' ').trim(),
            authors,
            year: e.published ? new Date(e.published).getFullYear() : null,
            venue: 'arXiv',
            abstract: String(e.summary || '').replace(/\s+/g, ' ').trim(),
            // http:// pdf links redirect; normalize to https
            pdfUrl: pdfLink ? pdfLink.replace(/^http:/, 'https:') : null,
            url: absId,
            citationCount: null,
        };
    });
}

async function searchScholar(q, attempt = 0) {
    let data;
    try {
        ({ data } = await axios.get(S2_API, {
            params: {
                query: q,
                limit: RESULTS_PER_SOURCE,
                fields:
                    'title,authors,year,venue,abstract,openAccessPdf,externalIds,url,citationCount',
            },
            // Unauthenticated requests share a global rate pool and 429
            // often; an api key (free, semanticscholar.org/product/api)
            // gets a dedicated quota.
            headers: process.env.SEMANTIC_SCHOLAR_API_KEY
                ? { 'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY }
                : {},
            timeout: 15000,
        }));
    } catch (err) {
        if (err.response?.status === 429 && attempt < 1) {
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            return searchScholar(q, attempt + 1);
        }
        if (err.response?.status === 429) {
            throw new Error(
                'rate-limited by Semantic Scholar — wait a few seconds and search again',
            );
        }
        throw err;
    }

    return (data?.data || []).map((p) => ({
        source: 'scholar',
        id: p.paperId,
        title: p.title || 'Untitled',
        authors: (p.authors || []).map((a) => a.name),
        year: p.year || null,
        venue: p.venue || null,
        abstract: p.abstract || '',
        pdfUrl: p.openAccessPdf?.url || null,
        url: p.url,
        citationCount: p.citationCount ?? null,
    }));
}

// OpenAlex — keyless, generous rate limits. The Scholar fallback when
// Semantic Scholar's shared anonymous pool is saturated (it usually is).
const OPENALEX_API = 'https://api.openalex.org/works';

// OpenAlex ships abstracts as {word: [positions]} to dodge full-text
// licensing; flatten back to prose.
function deinvertAbstract(inv) {
    if (!inv) return '';
    const words = [];
    for (const [word, positions] of Object.entries(inv)) {
        for (const pos of positions) words[pos] = word;
    }
    return words.join(' ');
}

async function searchOpenAlex(q) {
    const { data } = await axios.get(OPENALEX_API, {
        params: {
            search: q,
            'per-page': RESULTS_PER_SOURCE,
            select: 'id,doi,display_name,publication_year,cited_by_count,authorships,primary_location,open_access,abstract_inverted_index',
        },
        timeout: 15000,
    });

    return (data?.results || []).map((w) => ({
        source: 'scholar',
        id: String(w.id || '').replace('https://openalex.org/', ''),
        title: w.display_name || 'Untitled',
        authors: (w.authorships || [])
            .map((a) => a.author?.display_name)
            .filter(Boolean),
        year: w.publication_year || null,
        venue: w.primary_location?.source?.display_name || null,
        abstract: deinvertAbstract(w.abstract_inverted_index).slice(0, 1200),
        pdfUrl: w.open_access?.oa_url || null,
        url: w.doi || w.id,
        citationCount: w.cited_by_count ?? null,
    }));
}

async function searchScholarWithFallback(q) {
    try {
        return await searchScholar(q);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[search] Semantic Scholar failed, trying OpenAlex:', err.message);
        return searchOpenAlex(q);
    }
}

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/search/papers?q=…&source=arxiv|scholar|all
// A provider failing (rate limit, network) degrades to the other's results
// plus a warnings[] entry — never a whole-request 500.
// ---------------------------------------------------------------------------
router.get(
    '/papers',
    requireAuth,
    asyncHandler(async (req, res) => {
        const q = String(req.query.q || '').trim();
        if (!q) return res.status(400).json({ error: 'q is required' });
        const source = String(req.query.source || 'all');

        const jobs = [];
        if (source === 'arxiv' || source === 'all') {
            jobs.push(searchArxiv(q).then(
                (results) => ({ results }),
                (err) => ({ warning: `arXiv search failed: ${err.message}` }),
            ));
        }
        if (source === 'scholar' || source === 'all') {
            jobs.push(searchScholarWithFallback(q).then(
                (results) => ({ results }),
                (err) => ({ warning: `Scholar search failed: ${err.message}` }),
            ));
        }
        if (jobs.length === 0) {
            return res.status(400).json({ error: 'source must be arxiv, scholar, or all' });
        }

        const settled = await Promise.all(jobs);
        const results = settled.flatMap((s) => s.results || []);
        const warnings = settled.map((s) => s.warning).filter(Boolean);
        if (results.length === 0 && warnings.length === jobs.length) {
            return res.status(502).json({ error: warnings.join('; ') });
        }
        res.json({ query: q, results, warnings });
    }),
);

// ---------------------------------------------------------------------------
// POST /api/search/papers/import
// body: { title, pdfUrl, source?, authors?, year?, id? }
// Downloads the PDF into the user's storage and runs the standard ingest —
// after this the paper is a normal library Document.
// ---------------------------------------------------------------------------
const IMPORT_MAX_BYTES = 150 * 1024 * 1024;

router.post(
    '/papers/import',
    requireAuth,
    asyncHandler(async (req, res) => {
        const { title, pdfUrl, source, authors, year, id } = req.body || {};
        if (!title || !pdfUrl) {
            return res.status(400).json({ error: 'title and pdfUrl are required' });
        }
        if (!/^https:\/\//.test(pdfUrl)) {
            return res.status(400).json({ error: 'pdfUrl must be https' });
        }

        let response;
        try {
            response = await axios.get(pdfUrl, {
                responseType: 'arraybuffer',
                timeout: 120000,
                maxContentLength: IMPORT_MAX_BYTES,
                maxRedirects: 5,
            });
        } catch (err) {
            return res.status(502).json({
                error: `could not download the PDF: ${err.message}`,
            });
        }

        const buf = Buffer.from(response.data);
        // Publishers sometimes serve an HTML interstitial at the "pdf" URL.
        if (buf.slice(0, 5).toString('latin1') !== '%PDF-') {
            return res.status(502).json({
                error: 'the link did not return a PDF (probably a paywall or landing page) — open the paper page instead',
            });
        }

        const dir = path.resolve(STORAGE_ROOT, 'documents', String(req.userId));
        await fs.mkdir(dir, { recursive: true });
        const safe = String(id || title)
            .replace(/[^A-Za-z0-9._-]/g, '_')
            .slice(0, 120);
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}.pdf`;
        await fs.writeFile(path.join(dir, filename), buf);

        const doc = await Document.create({
            userId: req.userId,
            title: String(title).slice(0, 500),
            subtitle: [
                Array.isArray(authors) ? authors.slice(0, 4).join(', ') : null,
                year,
            ]
                .filter(Boolean)
                .join(' · ') || undefined,
            type: source === 'arxiv' ? 'arxiv' : 'pdf',
            file: {
                relativePath: path.posix.join('documents', String(req.userId), filename),
                sizeBytes: buf.length,
                mimeType: 'application/pdf',
            },
            status: 'pending',
        });

        ingestDocument(doc._id).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[paper-import] ingest kickoff failed:', err);
        });

        res.status(201).json(doc);
    }),
);

module.exports = router;
