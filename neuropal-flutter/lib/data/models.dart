// Plain data classes for what the backend returns (BRAIN.md §4).
// Each `fromJson` is forgiving: missing fields get safe defaults, so an
// older or newer backend never crashes the app.

String? _str(Object? v) => v is String ? v : null;
double _num(Object? v, [double fallback = 0]) =>
    v is num ? v.toDouble() : fallback;
int? _int(Object? v) => v is num ? v.toInt() : null;
DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;

/// The ingest states a document moves through on the backend.
const List<String> kProcessingStatuses = [
  'pending',
  'parsing',
  'chunking',
  'embedding',
];

/// One row of the library (`GET /api/documents`).
class DocumentSummary {
  const DocumentSummary({
    required this.id,
    required this.title,
    required this.status,
    this.subtitle,
    this.type = 'txt',
    this.ingestProgress = 0,
    this.ingestError,
    this.readingProgress = 0,
    this.lastReadAt,
    this.pageCount,
    this.wordCount,
    this.createdAt,
    this.mathUpgrade,
  });

  factory DocumentSummary.fromJson(Map<String, Object?> json) {
    return DocumentSummary(
      id: _str(json['_id']) ?? _str(json['id']) ?? '',
      title: _str(json['title'])?.trim().isNotEmpty == true
          ? (json['title'] as String).trim()
          : 'Untitled',
      subtitle: _str(json['subtitle']),
      type: _str(json['type']) ?? 'txt',
      status: _str(json['status']) ?? 'pending',
      ingestProgress: _num(json['progress']).clamp(0, 1),
      ingestError: _str(json['ingestError']),
      readingProgress: _num(json['readingProgress']).clamp(0, 1),
      lastReadAt: _date(json['lastReadAt']),
      pageCount: _int(json['pageCount']),
      wordCount: _int(json['wordCount']),
      createdAt: _date(json['createdAt']),
      mathUpgrade: _str(json['mathUpgrade']),
    );
  }

  final String id;
  final String title;
  final String? subtitle;

  /// pdf | epub | docx | pptx | md | txt | djvu | arxiv | web.
  final String type;

  /// pending | parsing | chunking | embedding | ready | failed.
  final String status;

  /// INGEST progress 0–1 (how far the backend got processing the file).
  final double ingestProgress;
  final String? ingestError;

  /// READING progress 0–1 (how far the user has read/listened).
  final double readingProgress;
  final DateTime? lastReadAt;
  final int? pageCount;
  final int? wordCount;
  final DateTime? createdAt;

  /// "queued" | "running" | "done" | "failed" (background math upgrade).
  final String? mathUpgrade;

  bool get isReady => status == 'ready';
  bool get isFailed => status == 'failed';
  bool get isProcessing => kProcessingStatuses.contains(status);
}

/// A chapter anchor from the backend's real table of contents.
class TocEntry {
  const TocEntry({required this.title, this.startParagraph, this.startPage});

  factory TocEntry.fromJson(Map<String, Object?> json) => TocEntry(
    title: _str(json['title']) ?? '',
    startParagraph: _int(json['startParagraph']),
    startPage: _int(json['startPage']),
  );

  final String title;

  /// Index into the /text paragraph list (split on blank lines).
  final int? startParagraph;
  final int? startPage;
}

/// The reader/TTS source (`GET /api/documents/:id/text`).
class DocumentText {
  const DocumentText({
    required this.id,
    required this.title,
    required this.text,
    this.pageCount,
    this.wordCount,
    this.toc = const [],
    this.source = 'chunks',
  });

  factory DocumentText.fromJson(Map<String, Object?> json) {
    final toc = json['toc'];
    return DocumentText(
      id: _str(json['id']) ?? _str(json['_id']) ?? '',
      title: _str(json['title']) ?? 'Untitled',
      text: _str(json['text']) ?? '',
      pageCount: _int(json['pageCount']),
      wordCount: _int(json['wordCount']),
      toc: toc is List
          ? [
              for (final e in toc)
                if (e is Map) TocEntry.fromJson(e.cast<String, Object?>()),
            ]
          : const [],
      source: _str(json['source']) ?? 'chunks',
    );
  }

  final String id;
  final String title;
  final String text;
  final int? pageCount;
  final int? wordCount;
  final List<TocEntry> toc;

  /// "chunks" (clean, ingested) or "raw-file" (ingest not finished).
  final String source;
}

/// The resume point (`GET /api/documents/:id/progress`).
class ReadingProgress {
  const ReadingProgress({this.progress = 0, this.lastWordIndex = 0});

  factory ReadingProgress.fromJson(Map<String, Object?> json) =>
      ReadingProgress(
        progress: _num(json['progress']).clamp(0, 1),
        lastWordIndex: _int(json['lastWordIndex']) ?? 0,
      );

  final double progress;
  final int lastWordIndex;
}

/// A source passage an answer was built from.
class Citation {
  const Citation({required this.excerpt, this.page, this.chunkId});

  factory Citation.fromJson(Map<String, Object?> json) => Citation(
    excerpt: _str(json['excerpt'])?.trim() ?? '',
    page: _int(json['page']),
    chunkId: _str(json['chunkId']),
  );

  final String excerpt;

  /// Real page number, or null when the ingest knew no pages.
  final int? page;
  final String? chunkId;
}

/// `POST /api/documents/:id/query` → grounded answer + citations.
class AskAnswer {
  const AskAnswer({
    required this.answer,
    this.citations = const [],
    this.mode = 'rag',
    this.model,
    this.provider,
  });

  factory AskAnswer.fromJson(Map<String, Object?> json) {
    final cites = json['citations'];
    return AskAnswer(
      answer: _str(json['answer']) ?? '',
      citations: cites is List
          ? [
              for (final c in cites)
                if (c is Map) Citation.fromJson(c.cast<String, Object?>()),
            ]
          : const [],
      mode: _str(json['mode']) ?? _str(json['method']) ?? 'rag',
      model: _str(json['model']),
      provider: _str(json['provider']),
    );
  }

  /// Markdown.
  final String answer;
  final List<Citation> citations;

  /// "rag" (searched the document) or "fallback" (read the raw text).
  final String mode;
  final String? model;
  final String? provider;
}
