// TtsPlayer: chunk chaining, exact word sync from engine ranges, the timer
// estimator fallback, and protection against stale engine events.

import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/reader/tts_chunks.dart';
import 'package:neuropal/reader/tts_player.dart';

import 'helpers/fakes.dart';

void main() {
  late FakeSpeechEngine engine;
  late TtsPlayer player;
  late DateTime now;
  late List<int> words;
  var finished = 0;
  String? error;

  // Enough words for several ≤ 3000-character chunks.
  final book = List.generate(1500, (i) => 'word$i');

  setUp(() {
    engine = FakeSpeechEngine();
    now = DateTime(2026, 10, 23, 12);
    words = [];
    player = TtsPlayer(engine, clock: () => now)
      ..onWord = words.add
      ..onFinished = () {
        finished++;
      }
      ..onError = (m) {
        error = m;
      };
    finished = 0;
    error = null;
  });

  tearDown(() => player.dispose());

  test('speaks the first chunk and re-syncs to its first word', () async {
    await player.play(book, 10, wpm: 225);
    expect(engine.spoken.length, 1);
    expect(engine.last.startsWith('word10 word11'), isTrue);
    expect(engine.last.length, lessThanOrEqualTo(kTtsChunkChars));
    expect(words, [10]);
    expect(player.isPlaying, isTrue);
  });

  test('chains chunks on completion and finishes after the last', () async {
    await player.play(book, 0, wpm: 225);
    final chunkCount = buildTtsChunks(book, 0).length;
    expect(chunkCount, greaterThan(1));
    for (var i = 0; i < chunkCount; i++) {
      engine
        ..fireStart()
        ..fireComplete();
    }
    expect(engine.spoken.length, chunkCount);
    expect(finished, 1);
    expect(player.isPlaying, isFalse);
  });

  test('range events give the exact word (and retire the estimator)', () async {
    await player.play(['alpha', 'beta', 'gamma'], 0, wpm: 225);
    engine
      ..fireStart()
      ..fireRange(6, 10); // "beta"
    expect(words.last, 1);
    expect(player.rangesSeen, isTrue);
    now = now.add(const Duration(seconds: 30));
    player.tick(); // estimator must stay silent now
    expect(words.last, 1);
    engine.fireRange(11, 16); // "gamma"
    expect(words.last, 2);
  });

  test('range events from an older utterance are ignored', () async {
    await player.play(['alpha', 'beta', 'gamma'], 0, wpm: 225);
    engine
      ..fireStart()
      ..fireRange(6, 10, text: 'some previous chunk text');
    expect(words, [0]);
  });

  test('a completion right after speak (no start yet) is stale', () async {
    await player.play(book, 0, wpm: 225);
    engine.fireComplete(); // belongs to the utterance we just replaced
    expect(engine.spoken.length, 1, reason: 'must not skip a chunk');
    engine
      ..fireStart()
      ..fireComplete();
    expect(engine.spoken.length, 2);
  });

  test('without a start event, completion counts after the grace period', () async {
    await player.play(book, 0, wpm: 225);
    now = now.add(const Duration(seconds: 2));
    engine.fireComplete();
    expect(engine.spoken.length, 2);
  });

  test('estimator: advances with time by characters, holds at chunk end', () async {
    final short = ['one', 'two', 'three', 'four'];
    await player.play(short, 0, wpm: 120);
    engine.fireStart();
    // 120 wpm ≈ 2 words/s. After ~1.1 s we should be on the 3rd word.
    now = now.add(const Duration(milliseconds: 1100));
    player.tick();
    expect(words.last, inInclusiveRange(1, 2));
    // Long after: never beyond the chunk's last word until "done".
    now = now.add(const Duration(minutes: 5));
    player.tick();
    expect(words.last, 3);
    expect(finished, 0);
  });

  test('estimator learns the real pace from a finished chunk', () async {
    await player.play(book, 0, wpm: 225);
    final chunks = buildTtsChunks(book, 0);
    engine.fireStart();
    // The engine took twice as long as 225 wpm predicts.
    final predictedMs = chunks[0].wordCount / 225 * 60000;
    now = now.add(Duration(milliseconds: (predictedMs * 2).round()));
    engine.fireComplete(); // → chunk 2
    engine.fireStart();
    final second = chunks[1];
    now = now.add(Duration(milliseconds: (predictedMs).round()));
    player.tick();
    // Half of the chunk's duration at the LEARNED pace ≈ its middle word.
    final middle = second.firstWordIndex + second.wordCount ~/ 2;
    expect(words.last, closeTo(middle, second.wordCount * 0.1));
  });

  test('stop silences the engine and ignores later events', () async {
    await player.play(book, 0, wpm: 225);
    await player.stop();
    expect(engine.stops, greaterThan(0));
    expect(player.isPlaying, isFalse);
    engine
      ..fireStart()
      ..fireComplete()
      ..fireRange(0, 4);
    expect(engine.spoken.length, 1);
    expect(finished, 0);
  });

  test('an engine error stops playback and is reported', () async {
    await player.play(book, 0, wpm: 225);
    engine.fireError('synthesis failed');
    expect(player.isPlaying, isFalse);
    expect(error, contains('synthesis failed'));
  });
}
