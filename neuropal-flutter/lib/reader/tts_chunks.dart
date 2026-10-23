// Splitting the spoken word list into engine-sized utterances.
//
// Android's TextToSpeech rejects utterances over ~4000 characters, and a
// book is one enormous string, so words are grouped into ≤ 3000-character
// chunks that are spoken one after another (chained on completion).
//
// Each chunk remembers where every word starts inside its text. The engine
// reports progress as a CHARACTER offset within the current utterance;
// [TtsChunk.wordIndexForChar] turns that back into the GLOBAL word index
// the karaoke highlight uses.

/// Max characters per utterance (same as the Expo app on native).
const int kTtsChunkChars = 3000;

class TtsChunk {
  TtsChunk._(this.text, this.firstWordIndex, this.offsets);

  /// Words joined by single spaces.
  final String text;

  /// Global index of the chunk's first word.
  final int firstWordIndex;

  /// Start offset of each word inside [text].
  final List<int> offsets;

  int get wordCount => offsets.length;
  int get lastWordIndex => firstWordIndex + offsets.length - 1;

  /// The global word index for a character offset inside [text]: the last
  /// word that starts at or before it (binary search).
  int wordIndexForChar(int charIndex) {
    var lo = 0;
    var hi = offsets.length - 1;
    var ans = 0;
    while (lo <= hi) {
      final mid = (lo + hi) >> 1;
      if (offsets[mid] <= charIndex) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return firstWordIndex + ans;
  }
}

/// Chunks [words] from [startIndex] to the end.
List<TtsChunk> buildTtsChunks(
  List<String> words,
  int startIndex, {
  int maxChars = kTtsChunkChars,
}) {
  final start = startIndex < 0 ? 0 : startIndex;
  final chunks = <TtsChunk>[];
  var current = <String>[];
  var currentLen = 0;
  var currentStart = start;

  void flush() {
    final offsets = <int>[];
    var pos = 0;
    for (final w in current) {
      offsets.add(pos);
      pos += w.length + 1; // +1 for the joining space
    }
    chunks.add(TtsChunk._(current.join(' '), currentStart, offsets));
  }

  for (var i = start; i < words.length; i++) {
    final word = words[i];
    if (currentLen + word.length + 1 > maxChars && current.isNotEmpty) {
      flush();
      current = <String>[];
      currentLen = 0;
      currentStart = i;
    }
    current.add(word);
    currentLen += word.length + 1;
  }
  if (current.isNotEmpty) flush();
  return chunks;
}
