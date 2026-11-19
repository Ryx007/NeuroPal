// Adding a document to the library, from this phone. One file at a time:
//
//   pick → check → uploading (progress, Cancel) → done: the new document
//   joins the library at once, where its processing status takes over
//          ↘ failed / cancelled: the row stays, says why in one plain
//            sentence, and offers Try again
//
// The kinds the server reads and its 300 MB limit are checked on the phone
// first (neuropal-backend/src/routes/documents.js), so a wrong file never
// starts uploading. Every failure is a sentence a person can act on.
//
// An upload belongs to the account that started it: when the session ends
// (or another one begins) LibraryController.clear() calls [reset], which
// stops it and forgets the list, file names included. The demo library is
// bundled with the app, so nothing can be uploaded to it.

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../data/backend.dart';
import '../data/document_source.dart';
import '../data/models.dart';
import 'document_picker.dart';

/// The file kinds the server reads, by extension (documents.js
/// typeFromUpload; the web app's uploads.ts).
const List<String> kUploadExtensions = [
  'pdf', 'epub', 'docx', 'pptx', 'md', 'markdown', 'txt', 'djvu', 'djv', //
];

const String kUploadKindsWords =
    'PDF, EPUB, Word (.docx), PowerPoint (.pptx), Markdown, plain text and DjVu';

/// The server's limit (multer `fileSize`).
const int kUploadMaxBytes = 300 * 1024 * 1024;

enum UploadPhase { uploading, failed, cancelled }

@immutable
class UploadItem {
  const UploadItem({
    required this.key,
    required this.name,
    required this.size,
    required this.phase,
    this.sent = 0,
    this.error,
    this.canRetry = false,
  });

  final String key;
  final String name;

  /// Bytes (0 when unknown).
  final int size;
  final UploadPhase phase;

  /// Bytes handed to the connection so far.
  final int sent;

  /// Why it didn't go up, in one sentence.
  final String? error;
  final bool canRetry;

  double get fraction => size <= 0 ? 0 : (sent / size).clamp(0.0, 1.0);
  int get percent => (fraction * 100).floor();

  UploadItem copyWith({UploadPhase? phase, int? sent, String? Function()? error, bool? canRetry}) => UploadItem(
    key: key,
    name: name,
    size: size,
    phase: phase ?? this.phase,
    sent: sent ?? this.sent,
    error: error == null ? this.error : error(),
    canRetry: canRetry ?? this.canRetry,
  );
}

/// "12.4 MB" / "640 KB" / "312 B".
String sizeLabel(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
  final mb = bytes / (1024 * 1024);
  return '${mb < 10 ? mb.toStringAsFixed(1) : mb.round()} MB';
}

String _extensionOf(String name) {
  final m = RegExp(r'\.([A-Za-z0-9]+)$').firstMatch(name);
  return m == null ? '' : m.group(1)!.toLowerCase();
}

/// Why [file] can't go up, or null when it can. Checked on the phone, so a
/// wrong file never starts uploading.
String? uploadProblem(PickedDocument file) {
  final ext = _extensionOf(file.name);
  if (!kUploadExtensions.contains(ext)) {
    return ext.isEmpty
        ? 'NeuroPal can’t tell what kind of file this is. It reads $kUploadKindsWords.'
        : 'NeuroPal can’t read .$ext files yet. It reads $kUploadKindsWords.';
  }
  final size = file.size;
  if (size == null) {
    return 'The phone couldn’t tell how big this file is. Try picking it again.';
  }
  if (size == 0) return 'This file is empty.';
  if (size > kUploadMaxBytes) {
    return 'This file is larger than 300 MB, the most the server takes.';
  }
  return null;
}

/// A failed upload in one plain sentence.
String describeUploadError(ApiException e) {
  if (e.timedOut) {
    return 'The upload stalled: nothing got through for a minute. Check the '
        'connection and try again.';
  }
  if (e.unreachable) {
    return 'Can’t reach your NeuroPal server, so the file didn’t go up. Check '
        'the connection and try again.';
  }
  final status = e.status;
  if (status == 401) {
    return 'Your session ended. Sign in again, then add the file again.';
  }
  if (status == 413) return 'This file is larger than the server accepts.';
  if (status == 400) return 'The file didn’t arrive in one piece. Try again.';
  if (status == 429) {
    final wait = e.retryAfterSec;
    return wait == null
        ? 'Too many uploads at once. Wait a moment, then try again.'
        : 'Too many uploads at once. Wait $wait s, then try again.';
  }
  if (status != null && status >= 500) {
    return 'The server couldn’t take the file this time. Try again in a moment.';
  }
  if (status != null) {
    return 'The server didn’t take the file (it answered $status). Try again later.';
  }
  return 'The server sent back something unexpected. The file may not have arrived; '
      'refresh the library to check.';
}

class UploadController extends ChangeNotifier {
  UploadController({
    required this.source,
    required this.isDemo,
    this.onUploaded,
    this.stall = const Duration(seconds: 60),
  });

  final ApiDocumentSource source;

  /// True while the demo library is on: nothing can be uploaded to it.
  final bool Function() isDemo;

  /// A new document on the server (the library shows it at once).
  final void Function(DocumentSummary doc)? onUploaded;

  /// How long an upload may go without any progress before it gives up.
  final Duration stall;

  List<UploadItem> _items = const [];
  final Map<String, PickedDocument> _files = {};
  String? _activeKey;
  Completer<void>? _cancel;
  bool _picking = false;
  bool _preparing = false;
  String? _status;
  String? _news;
  int _newsId = 0;
  int _seq = 0;

  /// Bumped by [reset]: anything an older upload reports is dropped.
  int _epoch = 0;
  bool _disposed = false;

  /// The rows to show, newest first (finished ones leave the list: the
  /// library's document card takes over).
  List<UploadItem> get items => _items;

  /// A file is going up right now (one at a time).
  bool get busy => _activeKey != null;

  /// The picker is open or still copying the chosen file in.
  bool get picking => _picking;

  /// A big file is being copied in from its app before it can go up.
  bool get preparing => _preparing;

  /// What just happened, shown under the button (null when the row
  /// itself says it, as a failed upload's does).
  String? get status => _status;

  /// The same news in full, for screen readers: the screen announces each
  /// new [newsId] once.
  String? get news => _news;
  int get newsId => _newsId;

  /// Opens the picker and uploads what comes back.
  Future<void> pickAndUpload(DocumentPicker picker) async {
    if (busy || _picking) return;
    if (isDemo()) {
      _say(_demoLine);
      return;
    }
    final epoch = _epoch;
    _picking = true;
    _status = null;
    _notify();
    PickedDocument? file;
    try {
      file = await picker.pick(
        onPreparing: () {
          if (epoch != _epoch || _preparing) return;
          _preparing = true;
          _notify();
        },
      );
    } on Object catch (e) {
      // Only the kind of error: never a file name or a path.
      debugPrint('File picker failed (${e.runtimeType})');
      if (epoch == _epoch) _tell('The file picker didn’t work this time. Try again.');
    } finally {
      if (epoch == _epoch) {
        _picking = false;
        _preparing = false;
        _notify();
      }
    }
    if (file == null || epoch != _epoch) return;
    await upload(file);
  }

  static const _demoLine =
      'Uploading needs your NeuroPal server. The demo library is built into the '
      'app, so nothing can be added to it.';

  /// Checks [file] and sends it up.
  Future<void> upload(PickedDocument file) async {
    if (busy) return;
    if (isDemo()) {
      _say(_demoLine);
      return;
    }
    final key = 'u${++_seq}';
    final name = file.name.trim().isEmpty ? 'Untitled file' : file.name;
    final problem = uploadProblem(file);
    if (problem != null) {
      _items = [
        UploadItem(key: key, name: name, size: file.size ?? 0, phase: UploadPhase.failed, error: problem),
        ..._items,
      ];
      _tell('“$name” wasn’t uploaded. $problem', shown: false);
      _notify();
      return;
    }
    _files[key] = file;
    _items = [
      UploadItem(key: key, name: name, size: file.size!, phase: UploadPhase.uploading),
      ..._items,
    ];
    await _run(key);
  }

  /// Tries a failed or cancelled upload again (same file).
  Future<void> retry(String key) async {
    final item = _item(key);
    if (busy || item == null || !_files.containsKey(key)) return;
    if (item.phase == UploadPhase.uploading) return;
    _replace(key, item.copyWith(phase: UploadPhase.uploading, sent: 0, error: () => null, canRetry: false));
    await _run(key);
  }

  /// Stops the running upload. Nothing reaches the library.
  void cancel(String key) {
    if (_activeKey != key) return;
    final c = _cancel;
    if (c != null && !c.isCompleted) c.complete();
  }

  /// Takes a failed or cancelled row off the list.
  void dismiss(String key) {
    if (_activeKey == key) return;
    _items = [
      for (final i in _items)
        if (i.key != key) i,
    ];
    _files.remove(key);
    _notify();
  }

  /// The session ended (or another began): stop and forget everything.
  void reset() {
    _epoch += 1;
    final c = _cancel;
    if (c != null && !c.isCompleted) c.complete();
    _cancel = null;
    _activeKey = null;
    _items = const [];
    _files.clear();
    _picking = false;
    _preparing = false;
    _status = null;
    _news = null;
    _notify();
  }

  Future<void> _run(String key) async {
    final file = _files[key]!;
    final epoch = _epoch;
    final cancel = Completer<void>();
    _cancel = cancel;
    _activeKey = key;
    final name = _item(key)!.name;
    _tell('Uploading “$name”.', shown: false);
    _notify();
    var lastPercent = -1;
    try {
      final doc = await source.uploadDocument(
        filename: name,
        length: file.size!,
        bytes: file.open(),
        cancel: cancel.future,
        stall: stall,
        onProgress: (sent, total) {
          if (epoch != _epoch) return;
          final item = _item(key);
          if (item == null) return;
          final next = item.copyWith(sent: sent);
          // Repaint once per percent, not once per network chunk.
          if (next.percent == lastPercent) {
            _items = [for (final i in _items) i.key == key ? next : i];
            return;
          }
          lastPercent = next.percent;
          _replace(key, next);
        },
      );
      if (epoch != _epoch) return;
      _items = [
        for (final i in _items)
          if (i.key != key) i,
      ];
      _files.remove(key);
      _tell('“$name” is in your library. Processing has started.');
      onUploaded?.call(doc);
    } on UploadCancelled {
      if (epoch != _epoch) return;
      _replace(key, _item(key)!.copyWith(phase: UploadPhase.cancelled, canRetry: true));
      _tell('Upload cancelled. Nothing was added.');
    } on ApiException catch (e) {
      if (epoch != _epoch) return;
      final why = describeUploadError(e);
      _replace(key, _item(key)!.copyWith(phase: UploadPhase.failed, error: () => why, canRetry: true));
      _tell('“$name” wasn’t uploaded. $why', shown: false);
    } on Object catch (e) {
      // Reading the file on the phone failed (it moved, or its app took it
      // back). Only the kind of error is logged.
      debugPrint('Upload: reading the file failed (${e.runtimeType})');
      if (epoch != _epoch) return;
      const why = 'The phone couldn’t read this file. Pick it again, then try once more.';
      _replace(key, _item(key)!.copyWith(phase: UploadPhase.failed, error: () => why));
      _files.remove(key);
      _tell('“$name” wasn’t uploaded. $why', shown: false);
    } finally {
      if (epoch == _epoch) {
        _activeKey = null;
        _cancel = null;
        _notify();
      }
    }
  }

  UploadItem? _item(String key) => _items.where((i) => i.key == key).firstOrNull;

  void _replace(String key, UploadItem next) {
    _items = [for (final i in _items) i.key == key ? next : i];
    _notify();
  }

  void _say(String line) {
    _tell(line);
    _notify();
  }

  /// News for the screen: [shown] also puts it under the button (a failed
  /// row already says why, so its news is only spoken).
  void _tell(String line, {bool shown = true}) {
    _status = shown ? line : null;
    _news = line;
    _newsId += 1;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    final c = _cancel;
    if (c != null && !c.isCompleted) c.complete();
    super.dispose();
  }
}
