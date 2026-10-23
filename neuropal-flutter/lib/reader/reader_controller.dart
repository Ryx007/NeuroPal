// The reading session: which document is open, its tokenized text, and
// playback (play/pause/seek, speed, tone, voice).
//
// It lives above the screens, so listening continues when you open the
// drawer, the Library or Settings (a "now playing" bar brings you back).
// Opening another document — or switching the demo library on/off —
// ends the current session.
//
// The word being spoken is published separately through [cursor] (a tiny
// ChangeNotifier): it changes several times a second, and only the widgets
// that show it should rebuild — not the whole reader.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import '../data/backend.dart';
import '../data/document_source.dart';
import '../data/models.dart';
import '../data/settings_controller.dart';
import '../services.dart';
import 'reader_document.dart';
import 'speech_engine.dart';
import 'tts_player.dart';
import 'wpm.dart';

/// The word the voice is on (global word index).
class WordCursor extends ChangeNotifier {
  int _index = 0;
  int get index => _index;
  set index(int value) {
    if (value == _index) return;
    _index = value;
    notifyListeners();
  }
}

enum ReaderPhase {
  /// No document open.
  idle,

  /// Fetching / preparing the text.
  loading,

  /// The backend is still ingesting the document.
  processing,

  /// Ingest failed on the backend.
  failed,

  /// Loading failed (network or backend error).
  error,

  /// Text ready to read and play.
  ready,
}

class ReaderController extends ChangeNotifier with WidgetsBindingObserver {
  ReaderController(
    this.services, {
    TargetPlatform? platform,
    this.statusPollInterval = const Duration(seconds: 4),
    this.settingsDebounce = const Duration(milliseconds: 500),
  }) : _platform = platform ?? defaultTargetPlatform,
       _player = TtsPlayer(services.engine) {
    _player
      ..onWord = _onWord
      ..onFinished = _onFinished
      ..onError = _onSpeechError;
    _appliedSignature = _settingsSignature();
    settings.addListener(_onSettingsChanged);
    WidgetsBinding.instance.addObserver(this);
  }

  final AppServices services;
  final TargetPlatform _platform;
  final TtsPlayer _player;
  final Duration statusPollInterval;
  final Duration settingsDebounce;

  final WordCursor cursor = WordCursor();

  SettingsController get settings => services.settings;

  DocumentSummary? _doc;
  DocumentSource? _source;
  ReaderDocument? _content;
  ReaderPhase _phase = ReaderPhase.idle;
  String? _error;
  bool _playing = false;
  String? _speechError;
  int _loadToken = 0;
  Timer? _statusPoll;
  Timer? _restart;
  late String _appliedSignature;
  int _lastSavedWord = -1;
  DateTime _lastSavedAt = DateTime.fromMillisecondsSinceEpoch(0);
  bool _disposed = false;

  DocumentSummary? get document => _doc;
  ReaderDocument? get content => _content;
  ReaderPhase get phase => _phase;

  /// Why loading failed, in words.
  String? get error => _error;
  bool get playing => _playing;

  /// Set when the speech engine stopped with an error.
  String? get speechError => _speechError;

  /// The source the open document came from (for Ask and progress).
  DocumentSource? get source => _source;
  bool get hasSession => _doc != null;

  // ---- opening / loading -----------------------------------------------

  /// Opens [doc]. Re-opening the document that is already open keeps the
  /// session (and playback) as it is.
  Future<void> open(DocumentSummary doc) async {
    final same = _doc?.id == doc.id;
    // Already open (or on its way): keep the session as it is.
    if (same &&
        (_phase == ReaderPhase.ready || _phase == ReaderPhase.loading)) {
      return;
    }
    // Still processing and nothing new to load: the status poll continues.
    if (same && _phase == ReaderPhase.processing && !doc.isReady) return;
    await close();
    _doc = doc;
    _source = services.source;
    _content = null;
    _error = null;
    _speechError = null;
    cursor.index = 0;
    _lastSavedWord = -1;
    await _load();
  }

  /// Tries again after an error.
  Future<void> retry() async {
    final doc = _doc;
    final source = _source;
    if (doc == null || source == null) return;
    _phase = ReaderPhase.loading;
    _error = null;
    _notify();
    try {
      _doc = await source.getDocument(doc.id);
    } on ApiException catch (e) {
      _phase = ReaderPhase.error;
      _error = e.message;
      _notify();
      return;
    }
    await _load();
  }

  Future<void> _load() async {
    final token = ++_loadToken;
    final doc = _doc!;
    final source = _source!;
    _statusPoll?.cancel();

    // The text is only fetched once ingest is done (before that, binary
    // formats would come back as mojibake).
    if (!doc.isReady) {
      _phase = doc.isFailed ? ReaderPhase.failed : ReaderPhase.processing;
      _notify();
      if (doc.isProcessing) _pollStatus();
      return;
    }

    _phase = ReaderPhase.loading;
    _notify();
    try {
      final text = await source.getText(doc.id);
      if (token != _loadToken) return;
      // Big books take a moment to tokenize: do it off the UI thread.
      final content = text.text.length > 150000
          ? await readerDocumentInBackground(text.text, text.toc)
          : ReaderDocument.fromText(text.text, toc: text.toc);
      if (token != _loadToken) return;

      var start = 0;
      try {
        final progress = await source.getProgress(doc.id);
        start = progress.lastWordIndex;
      } on ApiException {
        start = 0; // no resume point is not worth an error screen
      }
      if (token != _loadToken) return;

      _content = content;
      cursor.index = start.clamp(0, math.max(0, content.wordCount - 1));
      _lastSavedWord = cursor.index;
      _phase = ReaderPhase.ready;
      _notify();
    } on ApiException catch (e) {
      if (token != _loadToken) return;
      _phase = ReaderPhase.error;
      _error = e.message;
      _notify();
    }
  }

  void _pollStatus() {
    _statusPoll?.cancel();
    _statusPoll = Timer.periodic(statusPollInterval, (_) async {
      final doc = _doc;
      final source = _source;
      if (doc == null || source == null) return;
      try {
        final fresh = await source.getDocument(doc.id);
        if (_doc?.id != fresh.id) return;
        _doc = fresh;
        if (fresh.isReady || fresh.isFailed) {
          _statusPoll?.cancel();
          await _load();
        } else {
          _notify(); // show the new stage / percentage
        }
      } on ApiException {
        // keep polling; the Library banner explains connection problems
      }
    });
  }

  /// Ends the session: stops speech and saves the resume point.
  Future<void> close() async {
    _loadToken++;
    _statusPoll?.cancel();
    _restart?.cancel();
    if (_playing) {
      _playing = false;
      await _player.stop();
    }
    await saveProgress();
    _doc = null;
    _source = null;
    _content = null;
    _phase = ReaderPhase.idle;
    _notify();
  }

  // ---- playback ------------------------------------------------------------

  Future<void> togglePlay() => _playing ? pause() : play();

  Future<void> play() async {
    final content = _content;
    if (content == null || content.isEmpty || _playing) return;
    var from = cursor.index;
    // Play on a finished document starts again from the top.
    if (from >= content.wordCount - 1) from = 0;
    cursor.index = from;
    _playing = true;
    _speechError = null;
    _notify();
    await _applyEngineSettings();
    if (!_playing) return; // paused while the engine was being set up
    await _player.play(content.speechWords, from, wpm: settings.wpm);
  }

  Future<void> pause() async {
    if (!_playing) return;
    _playing = false;
    _restart?.cancel();
    _notify();
    await _player.stop();
    await saveProgress();
  }

  /// Jumps to [wordIndex]; keeps playing if it was playing.
  Future<void> seekTo(int wordIndex) async {
    final content = _content;
    if (content == null || content.isEmpty) return;
    final target = wordIndex.clamp(0, content.wordCount - 1);
    cursor.index = target;
    if (_playing) {
      await _player.play(content.speechWords, target, wpm: settings.wpm);
    }
    await saveProgress();
  }

  /// Back/forward one paragraph. "Back" first returns to the start of the
  /// current paragraph, like an audiobook's back button.
  Future<void> skipParagraph(int delta) async {
    final content = _content;
    if (content == null || content.paragraphs.isEmpty) return;
    final i = content.paragraphIndexForWord(cursor.index);
    final current = content.paragraphs[i];
    var target = i + delta;
    if (delta < 0 && cursor.index > current.startWord + 2) target = i;
    target = target.clamp(0, content.paragraphs.length - 1);
    await seekTo(content.paragraphs[target].startWord);
  }

  Future<List<TtsVoice>> voices() => services.engine.voices();

  void dismissSpeechError() {
    _speechError = null;
    _notify();
  }

  Future<void> _applyEngineSettings() async {
    final engine = services.engine;
    try {
      await engine.setRate(speechRateForWpm(settings.wpm, _platform));
      await engine.setPitch(pitchForTone(settings.tone));
      await engine.setVoice(settings.voice);
    } on Object catch (e) {
      debugPrint('TTS settings not applied: $e');
    }
  }

  String _settingsSignature() {
    final v = settings.voice;
    return '${settings.wpm}|${settings.tone}|${v?.name}|${v?.locale}';
  }

  void _onSettingsChanged() {
    // Demo library switched: this document belongs to the other source.
    if (_doc != null && _source != null && _source!.isDemo != settings.demoMode) {
      unawaited(close());
      return;
    }
    final signature = _settingsSignature();
    if (signature == _appliedSignature) return;
    final before = _appliedSignature.split('|');
    final after = signature.split('|');
    final voiceChanged = before[2] != after[2] || before[3] != after[3];
    final wpmChanged = before[0] != after[0];
    _appliedSignature = signature;
    if (wpmChanged || voiceChanged) _player.resetPace(voiceChanged: voiceChanged);
    if (!_playing) return;
    // Apply mid-playback, debounced so dragging the speed slider doesn't
    // restart the engine for every step.
    _restart?.cancel();
    _restart = Timer(settingsDebounce, () async {
      final content = _content;
      if (!_playing || content == null) return;
      await _applyEngineSettings();
      if (!_playing) return;
      await _player.play(content.speechWords, cursor.index, wpm: settings.wpm);
    });
  }

  void _onWord(int wordIndex) {
    cursor.index = wordIndex;
    // A heartbeat save every 30 s while listening, in case the OS kills us.
    if (DateTime.now().difference(_lastSavedAt) > const Duration(seconds: 30)) {
      unawaited(saveProgress());
    }
  }

  void _onFinished() {
    _playing = false;
    final content = _content;
    if (content != null && content.wordCount > 0) {
      cursor.index = content.wordCount - 1;
    }
    _notify();
    unawaited(saveProgress(finished: true));
  }

  void _onSpeechError(String message) {
    _playing = false;
    _speechError = message;
    _notify();
    unawaited(saveProgress());
  }

  // ---- progress --------------------------------------------------------------

  /// Saves the resume point when it moved (best effort: a failed save is
  /// retried by the next one). [finished] marks the document as read to
  /// the end.
  Future<void> saveProgress({bool finished = false}) async {
    final doc = _doc;
    final source = _source;
    final content = _content;
    if (doc == null || source == null || content == null || content.isEmpty) {
      return;
    }
    final index = cursor.index;
    if (index == _lastSavedWord && !finished) return;
    _lastSavedWord = index;
    _lastSavedAt = DateTime.now();
    // Same formula as the Expo reader (word / total), 1.0 when finished.
    final progress = finished ? 1.0 : index / content.wordCount;
    try {
      await source.saveProgress(doc.id, progress: progress, lastWordIndex: index);
    } on ApiException catch (e) {
      _lastSavedWord = -1; // try again next time
      debugPrint('Progress not saved: ${e.message}');
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Backgrounding is the last reliable moment before a possible OS kill.
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.hidden) {
      unawaited(saveProgress());
    }
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _statusPoll?.cancel();
    _restart?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    settings.removeListener(_onSettingsChanged);
    _player.dispose();
    cursor.dispose();
    super.dispose();
  }
}
