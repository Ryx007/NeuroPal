// A small, safe Markdown renderer for Ask answers. Server text is untrusted:
// everything becomes React elements (never innerHTML). Supported: paragraphs,
// headings (drawn as h3), **bold**, *italic*, `code`, fenced code, lists
// (nested by indent), quotes, simple tables, rules, $math$ (prettified), and
// links — only absolute http(s) ones, opened safely. "[1]"-style markers
// become buttons for the answer's sources when there are any.
import type { ReactNode } from "react";
import { latexToUnicode } from "./math";

export interface MarkdownProps {
  text: string;
  /** Source markers "[n]" → buttons calling this (1-based n). */
  onCitation?: (n: number) => void;
  citationCount?: number;
  citationLabel?: (n: number) => string;
  className?: string;
  mathClassName?: string;
  citeClassName?: string;
}

const MAX_CHARS = 60000;
const MAX_DEPTH = 4;

type Opts = Omit<MarkdownProps, "text" | "className">;

export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// ---- inline ---------------------------------------------------------------

function findClosing(text: string, from: number, marker: string): number {
  let i = from;
  while (i < text.length) {
    const j = text.indexOf(marker, i);
    if (j < 0) return -1;
    if (text[j - 1] !== "\\") return j;
    i = j + marker.length;
  }
  return -1;
}

function inline(text: string, opts: Opts, key: string, depth = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = "";
  let n = 0;
  const flush = () => {
    if (buf) out.push(buf);
    buf = "";
  };
  const k = () => `${key}.${n++}`;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\" && i + 1 < text.length && /[\\`*_{}[\]()#+\-.!$|>~]/.test(text[i + 1])) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    if (ch === "`") {
      let ticks = 1;
      while (text[i + ticks] === "`") ticks++;
      const fence = "`".repeat(ticks);
      const end = text.indexOf(fence, i + ticks);
      if (end > i) {
        flush();
        out.push(<code key={k()}>{text.slice(i + ticks, end).trim()}</code>);
        i = end + ticks;
        continue;
      }
    }

    if (ch === "$" && text[i + 1] !== "$" && text[i + 1] && !/\s/.test(text[i + 1])) {
      const end = text.indexOf("$", i + 1);
      if (end > i + 1 && !/\s/.test(text[end - 1]) && !/\d/.test(text[end + 1] || "") && !text.slice(i + 1, end).includes("\n")) {
        const latex = text.slice(i + 1, end);
        flush();
        out.push(
          <span key={k()} className={opts.mathClassName} title={latex}>
            {latexToUnicode(latex)}
          </span>,
        );
        i = end + 1;
        continue;
      }
    }

    if (depth < MAX_DEPTH && (text.startsWith("**", i) || text.startsWith("__", i))) {
      const marker = text.slice(i, i + 2);
      const end = findClosing(text, i + 2, marker);
      if (end > i + 2) {
        flush();
        out.push(<strong key={k()}>{inline(text.slice(i + 2, end), opts, k(), depth + 1)}</strong>);
        i = end + 2;
        continue;
      }
    }

    if (depth < MAX_DEPTH && (ch === "*" || ch === "_") && text[i + 1] && !/\s/.test(text[i + 1])) {
      const wordStart = ch === "*" || i === 0 || /[\s([{"'“‘]/.test(text[i - 1]);
      if (wordStart) {
        let end = i + 1;
        let found = -1;
        while (end < text.length) {
          const j = findClosing(text, end, ch);
          if (j < 0) break;
          const doubled = text[j + 1] === ch || text[j - 1] === ch;
          const okEnd = !/\s/.test(text[j - 1]) && (ch === "*" || j + 1 >= text.length || /[\s.,;:!?)\]}"'”’]/.test(text[j + 1]));
          if (!doubled && okEnd) {
            found = j;
            break;
          }
          end = j + 1;
        }
        if (found > i + 1) {
          flush();
          out.push(<em key={k()}>{inline(text.slice(i + 1, found), opts, k(), depth + 1)}</em>);
          i = found + 1;
          continue;
        }
      }
    }

    if (ch === "[") {
      const close = text.indexOf("]", i + 1);
      if (close > i) {
        const label = text.slice(i + 1, close);
        if (text[close + 1] === "(") {
          const end = text.indexOf(")", close + 2);
          if (end > close) {
            const href = safeHref(text.slice(close + 2, end));
            flush();
            const content = inline(label, opts, k(), depth + 1);
            out.push(
              href ? (
                <a key={k()} href={href} target="_blank" rel="noopener noreferrer">
                  {content}
                  <span className="np-sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <span key={k()}>{content}</span>
              ),
            );
            i = end + 1;
            continue;
          }
        }
        const num = /^\s*(\d{1,2})\s*$/.exec(label);
        if (num && opts.onCitation) {
          const c = Number(num[1]);
          if (c >= 1 && c <= (opts.citationCount ?? 0)) {
            flush();
            const onCitation = opts.onCitation;
            out.push(
              <button
                key={k()}
                type="button"
                className={opts.citeClassName}
                onClick={() => onCitation(c)}
                aria-label={opts.citationLabel ? `Source ${c}: ${opts.citationLabel(c)}` : `Source ${c}`}
              >
                {c}
              </button>,
            );
            i = close + 1;
            continue;
          }
        }
      }
    }

    if (ch === "<") {
      const end = text.indexOf(">", i + 1);
      if (end > i) {
        const href = safeHref(text.slice(i + 1, end));
        if (href) {
          flush();
          out.push(
            <a key={k()} href={href} target="_blank" rel="noopener noreferrer">
              {text.slice(i + 1, end)}
              <span className="np-sr-only"> (opens in a new tab)</span>
            </a>,
          );
          i = end + 1;
          continue;
        }
      }
    }

    if (ch === "\n") {
      flush();
      out.push(<br key={k()} />);
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

// ---- blocks ---------------------------------------------------------------

const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const FENCE_RE = /^\s*(```+|~~~+)\s*([\w+-]*)\s*$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

const indentOf = (line: string) => (/^\s*/.exec(line)?.[0].replace(/\t/g, "    ").length ?? 0);
const isOrdered = (marker: string) => /\d/.test(marker);

function startsBlock(line: string, next: string | undefined) {
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    QUOTE_RE.test(line) ||
    LIST_RE.test(line) ||
    /^\s*\$\$/.test(line) ||
    (line.includes("|") && next !== undefined && TABLE_SEP_RE.test(next))
  );
}

interface ListItem {
  text: string;
  children: ReactNode[];
}

function blocks(src: string, opts: Opts, key: string, depth = 0): ReactNode[] {
  const lines = src.split("\n");
  const out: ReactNode[] = [];
  let n = 0;
  const k = () => `${key}.${n++}`;
  let i = 0;

  const parseList = (start: number, baseIndent: number, d: number): { node: ReactNode; next: number } => {
    const items: ListItem[] = [];
    const first = LIST_RE.exec(lines[start]);
    const ordered = first ? isOrdered(first[2]) : false;
    const startNum = first && ordered ? parseInt(first[2], 10) : 1;
    let j = start;
    while (j < lines.length) {
      const line = lines[j];
      const m = LIST_RE.exec(line);
      if (!m) {
        if (/^\s*$/.test(line)) {
          const ahead = lines[j + 1];
          const am = ahead !== undefined ? LIST_RE.exec(ahead) : null;
          if (am && indentOf(ahead) >= baseIndent) {
            j += 1;
            continue;
          }
          break;
        }
        if (items.length && indentOf(line) > baseIndent) {
          items[items.length - 1].text += `\n${line.trim()}`;
          j += 1;
          continue;
        }
        break;
      }
      const indent = indentOf(line);
      if (indent < baseIndent) break;
      if (indent > baseIndent && items.length) {
        if (d < MAX_DEPTH) {
          const sub = parseList(j, indent, d + 1);
          items[items.length - 1].children.push(sub.node);
          j = sub.next;
        } else {
          items[items.length - 1].text += ` ${m[3]}`;
          j += 1;
        }
        continue;
      }
      if (isOrdered(m[2]) !== ordered) break;
      items.push({ text: m[3], children: [] });
      j += 1;
    }
    const lk = k();
    const lis = items.map((it, idx) => (
      <li key={`${lk}.${idx}`}>
        {inline(it.text, opts, `${lk}.${idx}`)}
        {it.children}
      </li>
    ));
    const node = ordered ? (
      <ol key={lk} start={startNum !== 1 ? startNum : undefined}>
        {lis}
      </ol>
    ) : (
      <ul key={lk}>{lis}</ul>
    );
    return { node, next: Math.max(j, start + 1) };
  };

  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !new RegExp(`^\\s*${fence[1][0] === "`" ? "`" : "~"}{${fence[1].length},}\\s*$`).test(lines[j])) {
        body.push(lines[j]);
        j += 1;
      }
      out.push(
        <pre key={k()}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      i = j + 1;
      continue;
    }

    if (/^\s*\$\$/.test(line)) {
      const body: string[] = [];
      let rest = line.replace(/^\s*\$\$/, "");
      let j = i;
      while (true) {
        const close = rest.indexOf("$$");
        if (close >= 0) {
          body.push(rest.slice(0, close));
          break;
        }
        body.push(rest);
        j += 1;
        if (j >= lines.length) break;
        rest = lines[j];
      }
      const latex = body.join(" ").trim();
      out.push(
        <p key={k()} className={opts.mathClassName} title={latex}>
          {latexToUnicode(latex)}
        </p>,
      );
      i = j + 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      out.push(<h3 key={k()}>{inline(heading[2], opts, k())}</h3>);
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      out.push(<hr key={k()} />);
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const body: string[] = [];
      let j = i;
      while (j < lines.length && QUOTE_RE.test(lines[j])) {
        body.push((QUOTE_RE.exec(lines[j]) as RegExpExecArray)[1]);
        j += 1;
      }
      out.push(
        <blockquote key={k()}>{depth < MAX_DEPTH ? blocks(body.join("\n"), opts, k(), depth + 1) : body.join(" ")}</blockquote>,
      );
      i = j;
      continue;
    }

    if (LIST_RE.test(line)) {
      const { node, next } = parseList(i, indentOf(line), 0);
      out.push(node);
      i = next;
      continue;
    }

    if (line.includes("|") && lines[i + 1] !== undefined && TABLE_SEP_RE.test(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|") && !/^\s*$/.test(lines[j])) {
        rows.push(cells(lines[j]));
        j += 1;
      }
      const tk = k();
      out.push(
        <div key={tk} className="np-md-table" role="region" aria-label="Table" tabIndex={0}>
          <table>
            <thead>
              <tr>
                {head.map((c, ci) => (
                  <th key={ci} scope="col">
                    {inline(c, opts, `${tk}.h${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {head.map((_, ci) => (
                    <td key={ci}>{inline(r[ci] ?? "", opts, `${tk}.${ri}.${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      i = j;
      continue;
    }

    // paragraph: lines until a blank line or another block
    const para: string[] = [line.trim()];
    let j = i + 1;
    while (j < lines.length && !/^\s*$/.test(lines[j]) && !startsBlock(lines[j], lines[j + 1])) {
      para.push(lines[j].trim());
      j += 1;
    }
    out.push(<p key={k()}>{inline(para.join(" "), opts, k())}</p>);
    i = j;
  }
  return out;
}

export function Markdown({ text, className, ...opts }: MarkdownProps) {
  const src = String(text ?? "")
    .slice(0, MAX_CHARS)
    .replace(/\r\n?/g, "\n");
  return <div className={className}>{blocks(src, opts, "md")}</div>;
}

/** The answer as plain text (for copying). */
export function markdownToPlain(text: string): string {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*```.*$/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])\*(\S.*?)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .trim();
}
