// Utterance chunking and the char-offset → word-index mapping.

import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/reader/tts_chunks.dart';

void main() {
  test('joins words with single spaces and records offsets', () {
    final chunks = buildTtsChunks(['alpha', 'be', 'gamma'], 0);
    expect(chunks.length, 1);
    final c = chunks.single;
    expect(c.text, 'alpha be gamma');
    expect(c.offsets, [0, 6, 9]);
    expect(c.firstWordIndex, 0);
    expect(c.lastWordIndex, 2);
  });

  test('starts at startIndex', () {
    final chunks = buildTtsChunks(['a', 'b', 'c', 'd'], 2);
    expect(chunks.single.text, 'c d');
    expect(chunks.single.firstWordIndex, 2);
  });

  test('no chunk exceeds the limit, and no word is lost', () {
    final words = List.generate(5000, (i) => 'word$i');
    final chunks = buildTtsChunks(words, 0);
    expect(chunks.length, greaterThan(1));
    for (final c in chunks) {
      expect(c.text.length, lessThanOrEqualTo(kTtsChunkChars));
    }
    final rebuilt = chunks.expand((c) => c.text.split(' ')).toList();
    expect(rebuilt, words);
    // Chunks are contiguous.
    for (var i = 1; i < chunks.length; i++) {
      expect(chunks[i].firstWordIndex, chunks[i - 1].lastWordIndex + 1);
    }
  });

  test('wordIndexForChar maps any character to its word', () {
    final words = [...List.filled(10, 'skipped'), 'x', 'alpha', 'be', 'gamma'];
    final c = buildTtsChunks(words, 10).single;
    // "x alpha be gamma": x@0 alpha@2 be@8 gamma@11
    expect(c.wordIndexForChar(0), 10);
    expect(c.wordIndexForChar(2), 11);
    expect(c.wordIndexForChar(6), 11); // inside "alpha"
    expect(c.wordIndexForChar(7), 11); // the space after it
    expect(c.wordIndexForChar(8), 12);
    expect(c.wordIndexForChar(500), 13); // past the end → last word
  });

  test('empty input gives no chunks', () {
    expect(buildTtsChunks(const [], 0), isEmpty);
    expect(buildTtsChunks(['a'], 5), isEmpty);
  });
}
