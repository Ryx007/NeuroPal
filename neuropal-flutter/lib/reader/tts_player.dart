// Speaks a document through a SpeechEngine and reports which word is being
// spoken, for the karaoke highlight.
//
// HOW WORD SYNC WORKS
// 1. Exact: the engine reports the character range it is about to speak
//    (Android `onRangeStart`, API 26+; iOS `willSpeakRange`). The chunk's
//    offset table turns that into a global word index.
// 2. Fallback estimator: some engines never report ranges. Then a timer
//    estimates the position from elapsed time × speaking pace, measured in
//    CHARACTERS so long words take longer than short ones. It is switched
//    off for good on the first real range event, and it LEARNS the engine's
//    real pace from every finished chunk (so a wrong WPM calibration
//    corrects itself after the first ~2 minutes).
// 3. Every chunk start re-syncs the highlight to the chunk's first word.
//
// STALE EVENTS: after a stop/seek, events from the previous utterance can
// still be in flight. Range events carry the utterance text, so they are
// matched against the current chunk. A completion only counts once the
// current utterance has reported "started" (or after a grace period, for
// engines that never report it).

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'speech_engine.dart';
import 'tts_chunks.dart';

class TtsPlayer {
  TtsPlayer(
    this.engine, {
    DateTime Function()? clock,
    this.tickInterval = const Duration(milliseconds: 100),
  }) : _now = clock ?? DateTime.now {
    engine.onStart = _handleStart;
    engine.onComplete = _handleComplete;
    engine.onProgress = _handleProgress;
    engine.onError = _handleError;
  }

  final SpeechEngine engine;
  final DateTime Function() _now;
  final Duration tickInterval;

  /// Called with the global index of the word being spoken.
  void Function(int wordIndex)? onWord;

  /// Called when the last chunk finished naturally.
  VoidCallback? onFinished;

  /// Called when the engine failed; playback has stopped.
  void Function(String message)? onError;

  // ---- the current run ----
  int _run = 0;
  List<TtsChunk> _chunks = const [];
  int _chunk = -1;
  bool _started = false;
  DateTime _speakIssuedAt = DateTime.fromMillisecondsSinceEpoch(0);
  DateTime? _chunkStartedAt;
  int _lastWord = -1;
  double _wpm = 225;
  Timer? _ticker;

  // ---- learned across runs ----
  bool _rangesSeen = false;
  double? _learnedCharsPerMs;

  /// A completion that arrives this soon after `speak` without a "started"
  /// event is assumed to belong to the PREVIOUS utterance.
  static const _staleWindow = Duration(milliseconds: 1500);

  bool get isPlaying => _chunk >= 0;

  /// True once the engine has reported word ranges (estimator retired).
  bool get rangesSeen => _rangesSeen;

  /// Speaks [speechWords] from [startIndex] to the end. [wpm] seeds the
  /// estimator; the engine's rate must already be set.
  Future<void> play(
    List<String> speechWords,
    int startIndex, {
    required int wpm,
  }) async {
    await stop();
    final run = ++_run;
    _chunks = buildTtsChunks(speechWords, startIndex);
    _wpm = wpm.toDouble();
    _lastWord = -1;
    if (_chunks.isEmpty) {
      onFinished?.call();
      return;
    }
    _chunk = -1;
    _speakNext(run);
  }

  /// Stops speaking. Safe to call at any time.
  Future<void> stop() async {
    _reset();
    await engine.stop();
  }

  /// Forget the learned pace (after a WPM change) and, when the voice
  /// changed, whether this engine reports ranges.
  void resetPace({bool voiceChanged = false}) {
    _learnedCharsPerMs = null;
    if (voiceChanged) _rangesSeen = false;
  }

  void dispose() {
    _reset();
    engine
      ..onStart = null
      ..onComplete = null
      ..onProgress = null
      ..onError = null;
  }

  // ---- internals ----------------------------------------------------------

  void _speakNext(int run) {
    if (run != _run) return;
    _chunk += 1;
    if (_chunk >= _chunks.length) {
      final done = onFinished;
      _reset();
      done?.call();
      return;
    }
    final chunk = _chunks[_chunk];
    _started = false;
    _chunkStartedAt = null;
    _speakIssuedAt = _now();
    _emit(chunk.firstWordIndex); // every chunk start re-syncs
    unawaited(
      engine.speak(chunk.text).catchError((Object e) {
        if (run == _run) _fail('The speech engine refused the text ($e).');
      }),
    );
    _startTicker();
  }

  void _reset() {
    _run++;
    _chunk = -1;
    _chunks = const [];
    _ticker?.cancel();
    _ticker = null;
  }

  void _fail(String message) {
    final report = onError;
    _reset();
    unawaited(engine.stop());
    report?.call(message);
  }

  void _emit(int wordIndex) {
    if (wordIndex == _lastWord) return;
    _lastWord = wordIndex;
    onWord?.call(wordIndex);
  }

  void _handleStart() {
    if (!isPlaying || _started) return;
    _started = true;
    _chunkStartedAt = _now();
  }

  void _handleProgress(String text, int start, int end) {
    if (!isPlaying) return;
    final chunk = _chunks[_chunk];
    if (text != chunk.text) return; // from an earlier utterance
    _rangesSeen = true;
    _ticker?.cancel();
    _ticker = null;
    if (!_started) {
      _started = true;
      _chunkStartedAt = _now();
    }
    _emit(chunk.wordIndexForChar(start));
  }

  void _handleComplete() {
    if (!isPlaying) return;
    final sinceSpeak = _now().difference(_speakIssuedAt);
    if (!_started && sinceSpeak < _staleWindow) return;
    _learnPace();
    _speakNext(_run);
  }

  void _handleError(String message) {
    if (!isPlaying) return;
    _fail('Speech stopped: $message');
  }

  void _learnPace() {
    final startedAt = _chunkStartedAt;
    if (_rangesSeen || startedAt == null) return;
    final chunk = _chunks[_chunk];
    final ms = _now().difference(startedAt).inMilliseconds;
    // Too short to be a reliable sample.
    if (ms < 2000 || chunk.wordCount < 20) return;
    final measured = chunk.text.length / ms;
    final learned = _learnedCharsPerMs;
    _learnedCharsPerMs = learned == null ? measured : (learned + measured) / 2;
  }

  void _startTicker() {
    if (_rangesSeen || _ticker != null) return;
    _ticker = Timer.periodic(tickInterval, (_) => tick());
  }

  /// One estimator step (public so tests can drive it without timers).
  @visibleForTesting
  void tick() {
    if (_rangesSeen || !isPlaying) {
      _ticker?.cancel();
      _ticker = null;
      return;
    }
    final chunk = _chunks[_chunk];
    final from = _chunkStartedAt ?? _speakIssuedAt;
    final elapsedMs = _now().difference(from).inMilliseconds;
    final charsPerMs = _learnedCharsPerMs ?? _expectedCharsPerMs(chunk);
    final word = chunk.wordIndexForChar((elapsedMs * charsPerMs).floor());
    // Hold at the chunk's last word until the engine says it is done:
    // the estimate must never run into text that hasn't been spoken.
    _emit(math.min(word, chunk.lastWordIndex));
  }

  double _expectedCharsPerMs(TtsChunk chunk) {
    final charsPerWord = (chunk.text.length + 1) / chunk.wordCount;
    return _wpm * charsPerWord / 60000;
  }
}
