// Ask: questions about the open document, answered by the backend's RAG
// pipeline (grounded in the document, with citations).
//
// Each document keeps its own thread for this app session, so closing and
// reopening the sheet keeps the conversation. Errors stay attached to the
// question that failed, with a Retry.

import 'package:flutter/foundation.dart';

import '../data/backend.dart';
import '../data/document_source.dart';
import '../data/models.dart';

class AskExchange {
  AskExchange(this.question);

  final String question;
  AskAnswer? answer;
  String? error;

  bool get pending => answer == null && error == null;
}

class AskController extends ChangeNotifier {
  final Map<String, List<AskExchange>> _threads = {};
  bool _disposed = false;

  List<AskExchange> thread(String documentId) =>
      List.unmodifiable(_threads[documentId] ?? const <AskExchange>[]);

  bool isBusy(String documentId) =>
      (_threads[documentId] ?? const <AskExchange>[]).any((e) => e.pending);

  Future<void> ask(
    DocumentSource source,
    String documentId,
    String question,
  ) async {
    final q = question.trim();
    if (q.isEmpty || isBusy(documentId)) return;
    final exchange = AskExchange(q);
    (_threads[documentId] ??= []).add(exchange);
    _notify();
    await _run(source, documentId, exchange);
  }

  Future<void> retry(
    DocumentSource source,
    String documentId,
    AskExchange exchange,
  ) async {
    if (exchange.pending) return;
    exchange
      ..error = null
      ..answer = null;
    _notify();
    await _run(source, documentId, exchange);
  }

  Future<void> _run(
    DocumentSource source,
    String documentId,
    AskExchange exchange,
  ) async {
    try {
      exchange.answer = await source.ask(documentId, exchange.question);
    } on ApiException catch (e) {
      exchange.error = e.message;
    }
    _notify();
  }

  /// Forgets every thread (the session ended).
  void clear() {
    _threads.clear();
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
