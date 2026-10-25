// Where documents come from. Two implementations:
//   * ApiDocumentSource  — the real backend (default),
//   * DemoDocumentSource — bundled samples (Settings → "Demo library").
// Screens never know which one they talk to.

import 'backend.dart';
import 'models.dart';

abstract class DocumentSource {
  /// True for the offline demo library.
  bool get isDemo;

  Future<List<DocumentSummary>> listDocuments();
  Future<DocumentSummary> getDocument(String id);
  Future<DocumentText> getText(String id);
  Future<ReadingProgress> getProgress(String id);
  Future<void> saveProgress(
    String id, {
    required double progress,
    required int lastWordIndex,
  });
  Future<AskAnswer> ask(String id, String question);
}

class ApiDocumentSource implements DocumentSource {
  ApiDocumentSource(this.backend);

  final Backend backend;

  @override
  bool get isDemo => false;

  Map<String, Object?> _map(Object? json) {
    if (json is Map) return json.cast<String, Object?>();
    throw const ApiException('The backend sent an unexpected reply.');
  }

  @override
  Future<List<DocumentSummary>> listDocuments() async {
    final json = await backend.getJson('/api/documents');
    if (json is! List) {
      throw const ApiException('The backend sent an unexpected reply.');
    }
    return [
      for (final row in json)
        if (row is Map) DocumentSummary.fromJson(row.cast<String, Object?>()),
    ];
  }

  @override
  Future<DocumentSummary> getDocument(String id) async =>
      DocumentSummary.fromJson(_map(await backend.getJson('/api/documents/$id')));

  @override
  Future<DocumentText> getText(String id) async {
    // Whole books can be several MB of JSON: allow a generous timeout.
    final json = await backend.getJson(
      '/api/documents/$id/text',
      timeout: const Duration(seconds: 90),
    );
    return DocumentText.fromJson(_map(json));
  }

  @override
  Future<ReadingProgress> getProgress(String id) async =>
      ReadingProgress.fromJson(
        _map(await backend.getJson('/api/documents/$id/progress')),
      );

  @override
  Future<void> saveProgress(
    String id, {
    required double progress,
    required int lastWordIndex,
  }) async {
    await backend.patchJson('/api/documents/$id/progress', {
      'progress': progress,
      'lastWordIndex': lastWordIndex,
    }, timeout: const Duration(seconds: 10));
  }

  @override
  Future<AskAnswer> ask(String id, String question) async {
    // Answers come from an LLM (cloud or the Mac mini's Ollama): slow.
    final json = await backend.postJson('/api/documents/$id/query', {
      'question': question,
    }, timeout: const Duration(seconds: 180));
    return AskAnswer.fromJson(_map(json));
  }
}
