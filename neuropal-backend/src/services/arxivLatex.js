const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');

const execFileP = promisify(execFile);

// P1 Tier A — the cleanest equation path: for arXiv papers, skip PDF text
// extraction entirely and fetch the AUTHOR'S LaTeX SOURCE from
// https://arxiv.org/e-print/<id>. The result is perfect native math — no
// OCR, no glyph soup. This module downloads the source, finds the main
// .tex, resolves \input/\include, and converts LaTeX to reading text with
// math preserved as $…$ / $$…$$ islands (the contract MathView + the
// math-atomic chunker consume).
//
// e-print responses come in three shapes:
//   gzipped tar   — the common case (multi-file source)
//   gzipped .tex  — single-file submissions
//   raw PDF       — pdf-only submissions (no source) → caller falls back

const ARXIV_EPRINT = 'https://arxiv.org/e-print/';
const MAX_INPUT_DEPTH = 6;

// ---------------------------------------------------------------------------
// Public: extractArxivLatex(arxivId) → { text, wordCount } | null
// null = no usable LaTeX source (pdf-only submission, network failure, or
// a source tree we couldn't make sense of). Callers treat null as "use the
// next extraction tier", never as an error.
// ---------------------------------------------------------------------------
async function extractArxivLatex(arxivId) {
    try {
        return await extractArxivLatexInner(arxivId);
    } catch (err) {
        // Contract: null = "use the next tier", NEVER an error — an
        // unexpected throw here must not fail an ingest whose PDF sits
        // perfectly extractable on disk.
        // eslint-disable-next-line no-console
        console.warn('[arxiv-latex] unexpected failure — falling back:', err.message);
        return null;
    }
}

async function extractArxivLatexInner(arxivId) {
    const id = String(arxivId || '').trim();
    if (!id) return null;

    let buf;
    try {
        const { data } = await axios.get(`${ARXIV_EPRINT}${encodeURIComponent(id)}`, {
            responseType: 'arraybuffer',
            timeout: 60000,
            maxContentLength: 200 * 1024 * 1024,
        });
        buf = Buffer.from(data);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[arxiv-latex] e-print fetch failed for ${id}:`, err.message);
        return null;
    }

    // pdf-only submission — no LaTeX to be had.
    if (buf.slice(0, 5).toString('latin1') === '%PDF-') return null;
    // Not gzip either → unknown payload; bail to the next tier.
    if (!(buf[0] === 0x1f && buf[1] === 0x8b)) return null;

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arxiv-src-'));
    try {
        const archive = path.join(workDir, 'src.gz');
        await fs.writeFile(archive, buf);

        // tar.gz or single gzipped file? `tar -tzf` succeeds only for tar.
        let files = [];
        try {
            await execFileP('tar', ['-xzf', archive, '-C', workDir]);
            files = await listTexFiles(workDir);
        } catch (e) {
            // single gzipped .tex
            try {
                const { stdout } = await execFileP('gunzip', ['-c', archive], {
                    maxBuffer: 64 * 1024 * 1024,
                });
                await fs.writeFile(path.join(workDir, 'main.tex'), stdout);
                files = [path.join(workDir, 'main.tex')];
            } catch (e2) {
                return null;
            }
        }
        if (files.length === 0) return null;

        const mainFile = await findMainTex(files);
        if (!mainFile) return null;

        let tex = await fs.readFile(mainFile, 'utf-8');
        tex = await resolveInputs(tex, path.dirname(mainFile), workDir, 0);

        const converted = latexToText(tex);
        const text = converted.text;
        if (!text || text.trim().length < 200) return null; // too thin to trust

        return { text, wordCount: countWords(text), sections: converted.sections };
    } finally {
        fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
}

async function listTexFiles(dir) {
    const out = [];
    const walk = async (d) => {
        for (const entry of await fs.readdir(d, { withFileTypes: true })) {
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) await walk(full);
            // regular files only: a symlink in the tarball (e.g. to
            // /proc/self/environ) must never be read as the main .tex
            else if (entry.isFile() && entry.name.toLowerCase().endsWith('.tex')) out.push(full);
        }
    };
    await walk(dir);
    return out;
}

// The main file is the one that declares the document. Multiple candidates →
// the largest one wins (review responses etc. are usually smaller).
async function findMainTex(files) {
    const candidates = [];
    for (const f of files) {
        try {
            const s = await fs.readFile(f, 'utf-8');
            if (/\\documentclass/.test(s) && /\\begin\{document\}/.test(s)) {
                candidates.push({ f, size: s.length });
            }
        } catch (e) {
            // unreadable candidate — skip
        }
    }
    if (candidates.length === 0) return files.length === 1 ? files[0] : null;
    candidates.sort((a, b) => b.size - a.size);
    return candidates[0].f;
}

// Inline \input{f} / \include{f} recursively (depth-capped, cycle-safe).
// Escape containment is anchored to the SOURCE ROOT (workDir), not the
// current file's directory — legit ../common/macros.tex includes work —
// and validated on the REALPATH, so a symlink inside the tarball pointing
// at /etc/passwd or ~/.ssh can't smuggle host files into the document text.
async function resolveInputs(tex, dir, rootDir, depth, seen = new Set()) {
    if (depth > MAX_INPUT_DEPTH) return tex;
    const re = /\\(?:input|include)\{([^}]+)\}/g;
    const root = path.resolve(rootDir);
    const parts = [];
    let last = 0;
    let m;
    while ((m = re.exec(tex)) !== null) {
        parts.push(tex.slice(last, m.index));
        last = m.index + m[0].length;
        let rel = m[1].trim();
        if (!/\.\w+$/.test(rel)) rel += '.tex';
        const full = path.resolve(dir, rel);
        if (path.relative(root, full).startsWith('..')) continue;
        if (seen.has(full)) continue;
        seen.add(full);
        try {
            const real = await fs.realpath(full);
            if (path.relative(root, real).startsWith('..')) continue; // symlink escape
            const child = await fs.readFile(real, 'utf-8');
            parts.push(await resolveInputs(child, path.dirname(full), rootDir, depth + 1, seen));
        } catch (e) {
            // missing include — drop it
        }
    }
    parts.push(tex.slice(last));
    return parts.join('');
}

// ---------------------------------------------------------------------------
// LaTeX → reading text with math islands.
//
// Strategy: protect every math span behind a placeholder FIRST (so text-level
// rewriting can't corrupt equations), transform the prose, then restore the
// math as $…$ / $$…$$.
// ---------------------------------------------------------------------------
// Control-char delimited so placeholders survive ANY whitespace collapse
// and can sit adjacent ("$a$$b$" titles) — the old space-delimited form
// broke when cleanup merged the boundary spaces.
const PH = (i) => `\u0012${i}\u0012`;
const PH_RE = /\u0012(\d+)\u0012/g;

const ESCAPED_DOLLAR = '\u0011'; // control char — cannot occur in .tex

function latexToText(source) {
    let tex = source;

    // 0) literal \$ must never be mistaken for a math delimiter
    tex = tex.replace(/\\\$/g, ESCAPED_DOLLAR);

    // 1) strip comments (a % not preceded by a backslash, to end of line)
    tex = tex.replace(/(^|[^\\])%[^\n]*/g, '$1');

    // 2) body only
    const body = tex.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    let title = '';
    let abstract = '';
    const tm = tex.match(/\\title\s*(?:\[[^\]]*\])?\s*\{/);
    if (tm) title = readBalanced(tex, tm.index + tm[0].length - 1);
    if (body) tex = body[1];

    // 3) pull math spans out into placeholders — BEFORE the abstract is
    // extracted, so abstract math survives the prose cleanup passes
    const math = [];
    const stash = (latex, display) => {
        math.push({ latex: latex.trim(), display });
        return display ? `\n\n${PH(math.length - 1)}\n\n` : ` ${PH(math.length - 1)} `;
    };

    // display environments (incl. starred) — keep alignment structure for KaTeX
    const DISPLAY_ENVS = [
        'equation', 'align', 'gather', 'multline', 'eqnarray', 'displaymath', 'flalign',
    ];
    for (const env of DISPLAY_ENVS) {
        const re = new RegExp(
            `\\\\begin\\{${env}\\*?\\}([\\s\\S]*?)\\\\end\\{${env}\\*?\\}`,
            'g'
        );
        tex = tex.replace(re, (_, inner) => {
            let cleaned = inner
                .replace(/\\label\{[^}]*\}/g, '')
                .replace(/\\nonumber/g, '')
                .trim();
            // multi-line alignment → KaTeX's {aligned}
            if (/\\\\/.test(cleaned) && env !== 'equation' && env !== 'displaymath') {
                cleaned = `\\begin{aligned}${cleaned}\\end{aligned}`;
            }
            return stash(cleaned, true);
        });
    }
    tex = tex.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => stash(inner, true));
    tex = tex.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => stash(inner, true));
    // inline math — $…$ (no nested $), \( … \)
    tex = tex.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => stash(inner, false));
    // inline $…$: hand-wrapped sources put line breaks INSIDE spans, so
    // single newlines are allowed; blank lines (paragraph breaks) end the
    // candidate — LaTeX itself forbids them in math mode.
    tex = tex.replace(/\$((?:[^$\n]|\n(?!\s*\n))+)\$/g, (_, inner) =>
        stash(inner.replace(/\s+/g, ' '), false),
    );
    // titles carry inline math too ("Dynamics of $\\Lambda$-systems")
    title = title.replace(/\$((?:[^$\n]|\n(?!\s*\n))+)\$/g, (_, inner) =>
        stash(inner.replace(/\s+/g, ' '), false),
    );

    // 3b) abstract — its math is already placeholder-protected
    const am = tex.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
    if (am) {
        abstract = am[1].trim();
        tex = tex.replace(am[0], '\n\n');
    }

    // 4) structural elements → readable text. TOP-LEVEL headings (chapter/
    // section) become TOC entries (P2); subsections stay plain heading
    // lines — a paper's TOC at subsection depth is noise.
    // Balanced-brace scan (NOT [^}]*) so nested commands in titles —
    // \texorpdfstring{...}{...}, \textbf{...} — don't truncate; handles the
    // \section[short-title]{Long Title} optional-arg form too.
    const sections = [];
    const headingRe = /\\(chapter|section|subsection|subsubsection)\*?\s*(?:\[[^\]]*\])?\s*\{/g;
    {
        let out = '';
        let last = 0;
        let hm;
        while ((hm = headingRe.exec(tex)) !== null) {
            const openIdx = headingRe.lastIndex - 1;
            const title = readBalanced(tex, openIdx);
            const clean = title.trim();
            out += tex.slice(last, hm.index) + `\n\n${clean}\n\n`;
            if (clean && (hm[1] === 'chapter' || hm[1] === 'section')) {
                sections.push(clean);
            }
            last = openIdx + 1 + title.length + 1; // past the closing brace
            headingRe.lastIndex = last;
        }
        out += tex.slice(last);
        tex = out;
    }

    // environments whose bodies we keep
    tex = tex
        .replace(/\\begin\{(itemize|enumerate|description)\}/g, '\n')
        .replace(/\\end\{(itemize|enumerate|description)\}/g, '\n')
        .replace(/\\item\s*(\[[^\]]*\])?/g, '\n• ');

    // figures/tables: keep the caption, drop the machinery
    tex = tex.replace(/\\begin\{(figure|table)\*?\}([\s\S]*?)\\end\{\1\*?\}/g, (_, env, inner) => {
        const cap = inner.match(/\\caption\s*\{/);
        if (!cap) return '\n\n';
        const text = readBalanced(inner, cap.index + cap[0].length - 1);
        return `\n\n${env === 'figure' ? 'Figure' : 'Table'}: ${text}\n\n`;
    });

    // environments we drop wholesale
    for (const env of ['tikzpicture', 'thebibliography', 'filecontents', 'lstlisting', 'verbatim', 'tabular', 'tabular\\*', 'array']) {
        const re = new RegExp(`\\\\begin\\{${env}\\}[\\s\\S]*?\\\\end\\{${env}\\}`, 'g');
        tex = tex.replace(re, '\n\n');
    }
    // acknowledgthe theorem-ish wrappers but keep their bodies
    tex = tex.replace(/\\begin\{(theorem|lemma|proof|corollary|definition|remark|example|proposition|abstract|quote|center|widetext)\*?\}/g, '\n\n')
        .replace(/\\end\{(theorem|lemma|proof|corollary|definition|remark|example|proposition|abstract|quote|center|widetext)\*?\}/g, '\n\n');

    // 5) text-level commands
    tex = tex
        .replace(/\\(?:textbf|textit|emph|textsc|texttt|textrm|underline|mbox|text)\s*\{([^{}]*)\}/g, '$1')
        .replace(/\\(?:cite|citep|citet|onlinecite)\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, '[citation]')
        .replace(/\\(?:ref|eqref|autoref|cref|Cref)\s*\{[^}]*\}/g, '(ref)')
        .replace(/\\footnote\s*\{([^{}]*)\}/g, ' ($1)')
        .replace(/\\(?:label|bibliography|bibliographystyle|pagestyle|thispagestyle|setcounter|vspace|hspace|includegraphics)\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, '')
        .replace(/\\(?:maketitle|tableofcontents|newpage|clearpage|appendix|noindent|centering|par|smallskip|medskip|bigskip|hline|toprule|midrule|bottomrule|and)\b/g, ' ')
        .replace(/\\author\s*\{([^{}]*)\}/g, '$1')
        .replace(/\\(?:affiliation|email|thanks|date|acknowledgments|acknowledgements)\s*\{[^}]*\}/g, '');

    // escapes + spacing glyphs
    tex = tex
        .replace(/~/g, ' ')
        .replace(/\\%/g, '%')
        .replace(/\\&/g, '&')
        .replace(/\\_/g, '_')
        .replace(/\\#/g, '#')
        .replace(/\\\\/g, '\n')
        .replace(/``|''/g, '"')
        .replace(/`/g, "'");

    // 6) leftover commands: keep braced content, drop bare commands (repeat
    // to unwrap nesting)
    for (let i = 0; i < 3; i++) {
        tex = tex.replace(/\\[a-zA-Z@]+\s*\{([^{}]*)\}/g, '$1');
    }
    tex = tex.replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ');
    tex = tex.replace(/[{}]/g, '');

    // 7) restore math islands
    tex = tex.replace(PH_RE, (_, i) => {
        const m = math[Number(i)];
        if (!m) return '';
        return m.display ? `$$${m.latex}$$` : `$${m.latex}$`;
    });

    // 8) assemble + normalise whitespace. Order matters: cleanupInline runs
    // while math is still placeholder-protected (a restore-then-clean would
    // strip the restored \commands right back out), THEN placeholders become
    // $…$ again.
    const restorePH = (str) =>
        ` ${str} `
            .replace(PH_RE, (_, i) => {
                const m = math[Number(i)];
                return m ? (m.display ? `$$${m.latex}$$` : `$${m.latex}$`) : '';
            })
            .trim();
    const parts = [];
    if (title) parts.push(restorePH(cleanupInline(title)));
    if (abstract) parts.push(`Abstract. ${restorePH(cleanupInline(abstract))}`);
    parts.push(tex);

    const text = parts
        .join('\n\n')
        .replace(new RegExp(ESCAPED_DOLLAR, 'g'), '$')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    // section titles for the TOC (P2) — same restore+cleanup as their
    // in-text paragraphs, so anchor matching is exact
    const cleanSections = sections
        .map((t) =>
            restorePH(cleanupInline(t)).replace(new RegExp(ESCAPED_DOLLAR, 'g'), '$'),
        )
        .filter(Boolean);
    return { text, sections: cleanSections };
}

// Read a {balanced} group starting at the index of its opening brace.
function readBalanced(s, openIdx) {
    if (s[openIdx] !== '{') return '';
    let depth = 0;
    for (let i = openIdx; i < s.length; i++) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') {
            depth--;
            if (depth === 0) return s.slice(openIdx + 1, i);
        }
    }
    return s.slice(openIdx + 1);
}

function cleanupInline(s) {
    return s
        .replace(/\\(?:textbf|textit|emph|text)\s*\{([^{}]*)\}/g, '$1')
        .replace(/\\[a-zA-Z@]+\s*/g, ' ')
        .replace(/[{}~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function countWords(text) {
    return (text.match(/\S+/g) || []).length;
}

// Best-effort arXiv id from a stored filename/path — legacy imports encoded
// the id into the filename (`…-2301.12345.pdf`, `…-quant-ph_0101012.pdf`).
function arxivIdFromPath(relativePath) {
    if (!relativePath) return null;
    const base = path.basename(relativePath);
    const modern = base.match(/(\d{4}\.\d{4,5})(v\d+)?/);
    if (modern) return modern[1] + (modern[2] || '');
    const legacy = base.match(/([a-z-]+(?:\.[A-Z]{2})?)_(\d{7})(v\d+)?/);
    if (legacy) return `${legacy[1]}/${legacy[2]}${legacy[3] || ''}`;
    return null;
}

module.exports = { extractArxivLatex, latexToText, arxivIdFromPath };
