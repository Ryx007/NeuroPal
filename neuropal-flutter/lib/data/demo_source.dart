// The offline demo library: two short physics samples bundled in
// assets/demo/. Only used when the user turns on Settings → "Demo library
// (offline)". Reading progress is kept on the device; Ask is unavailable
// (there is no backend to search), and says so instead of faking answers.

import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'backend.dart';
import 'document_source.dart';
import 'models.dart';

class DemoDocumentSource implements DocumentSource {
  DemoDocumentSource({required this.prefs, AssetBundle? bundle})
    : _bundle = bundle ?? rootBundle;

  final SharedPreferences prefs;
  final AssetBundle _bundle;
  List<Map<String, Object?>>? _docs;

  @override
  bool get isDemo => true;

  Future<List<Map<String, Object?>>> _load() async {
    if (_docs != null) return _docs!;
    // `cache: false`: this source keeps the parsed documents itself, so the
    // bundle needn't hold a second copy of the raw strings.
    final index = jsonDecode(
      await _bundle.loadString('assets/demo/index.json', cache: false),
    ) as Map;
    final docs = <Map<String, Object?>>[];
    for (final name in (index['documents'] as List).cast<String>()) {
      final raw = await _bundle.loadString('assets/demo/$name', cache: false);
      docs.add((jsonDecode(raw) as Map).cast<String, Object?>());
    }
    return _docs = docs;
  }

  Future<Map<String, Object?>> _doc(String id) async {
    for (final d in await _load()) {
      if (d['id'] == id) return d;
    }
    throw const ApiException('That demo document doesn’t exist.', status: 404);
  }

  String _progressKey(String id) => 'np.demo.progress.$id';

  @override
  Future<List<DocumentSummary>> listDocuments() async {
    final docs = await _load();
    return [
      for (final d in docs)
        DocumentSummary.fromJson({
          ...d,
          'readingProgress': (await getProgress(d['id']! as String)).progress,
        }),
    ];
  }

  @override
  Future<DocumentSummary> getDocument(String id) async =>
      DocumentSummary.fromJson(await _doc(id));

  @override
  Future<DocumentText> getText(String id) async =>
      DocumentText.fromJson(await _doc(id));

  @override
  Future<ReadingProgress> getProgress(String id) async {
    final raw = prefs.getString(_progressKey(id));
    if (raw == null) return const ReadingProgress();
    try {
      return ReadingProgress.fromJson(
        (jsonDecode(raw) as Map).cast<String, Object?>(),
      );
    } on Object {
      return const ReadingProgress();
    }
  }

  @override
  Future<void> saveProgress(
    String id, {
    required double progress,
    required int lastWordIndex,
  }) async {
    await prefs.setString(
      _progressKey(id),
      jsonEncode({'progress': progress, 'lastWordIndex': lastWordIndex}),
    );
  }

  @override
  Future<AskAnswer> ask(String id, String question) async {
    throw const ApiException(
      'Ask needs the backend: demo documents are offline samples, so there '
      'is no index to search. Turn off the demo library in Settings to ask '
      'about your real documents.',
    );
  }
}
