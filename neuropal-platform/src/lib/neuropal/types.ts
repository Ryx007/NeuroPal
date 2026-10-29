// The server's JSON (docs/BRAIN.md §4), as the web app reads it. Mongo ids
// arrive as `_id` on lean documents; `docId()` reads either.

export type DocumentType = "pdf" | "epub" | "docx" | "pptx" | "md" | "txt" | "djvu" | "arxiv" | "web";
/** pending → parsing → chunking → embedding → ready | failed */
export type DocumentStatus = "pending" | "parsing" | "chunking" | "embedding" | "ready" | "failed";

export const PROCESSING: readonly DocumentStatus[] = ["pending", "parsing", "chunking", "embedding"];

export interface NPDocument {
  _id?: string;
  id?: string;
  title: string;
  subtitle?: string;
  type: DocumentType | string;
  status: DocumentStatus | string;
  /** INGEST progress 0–1 (not reading progress). */
  progress?: number;
  pageCount?: number;
  wordCount?: number;
  /** Reading progress 0–1, joined from ReadingSession by GET /api/documents. */
  readingProgress?: number;
  lastReadAt?: string | null;
  createdAt?: string;
  ingestError?: string;
}

export const docId = (d: { _id?: string; id?: string }): string => String(d._id ?? d.id ?? "");

export interface TocEntry {
  title: string;
  order?: number;
  /** Index into the paragraphs of DocumentText.text (split on blank lines). */
  startParagraph?: number | null;
  startPage?: number | null;
}

export interface DocumentText {
  id: string;
  title: string;
  text: string;
  pageCount?: number;
  wordCount?: number;
  toc: TocEntry[];
  pageMap: { page: number; startParagraph: number }[];
  source?: "chunks" | "raw-file";
}

export interface ReadingProgress {
  progress: number | null;
  lastWordIndex: number | null;
  lastPage: number | null;
  lastOpenedAt: string | null;
}

export interface Citation {
  chunkId?: string;
  page?: number;
  sectionHeading?: string;
  excerpt?: string;
}

export interface QueryAnswer {
  answer: string;
  citations: Citation[];
  threadId?: string;
  mode?: "rag" | "fallback";
  model?: string;
  provider?: string;
  chunksUsed?: number;
}

export interface ChatMessage {
  _id?: string;
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  threadId?: string;
  createdAt?: string;
}

export interface EpubManifest {
  id: string;
  title: string;
  spine: { index: number; href: string }[];
  toc: EpubTocNode[];
  pageList: { page: string | number; href: string; anchor?: string }[];
}

export interface EpubTocNode {
  title: string;
  href?: string;
  anchor?: string;
  children?: EpubTocNode[];
}

export interface PalBreakdown {
  steps: string[];
  provider?: string;
  model?: string;
  /** The task sounded like a crisis: no steps, the server's careful reply instead. */
  crisis?: boolean;
  reply?: string;
}

/** POST /api/pal/chat `context` — only what helps a short reply. */
export interface PalChatContext {
  state: "green" | "yellow" | "red" | null;
  /** "HH:MM" */
  localTime: string;
  nextAnchor: { title: string; at: string; inMinutes: number } | null;
  minimumDay: string[];
  palName?: string;
  talkStyle?: string;
  people?: boolean;
}

export interface PalChatReply {
  reply: string;
  /** The server answered with its fixed careful reply (a crisis-sounding message). */
  crisis: boolean;
  provider?: string;
  model?: string;
}

export interface AuthConfig {
  localMode: boolean;
  signup: "invite" | "open" | "closed";
}
