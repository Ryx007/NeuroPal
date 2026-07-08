import { Platform } from "react-native";
import * as Speech from "expo-speech";

// TTS playback engine for the Reader (Build Brief §7).
//
// One implementation for native AND web: expo-speech drives the platform
// engine (AVSpeech / Android TTS / speechSynthesis) on all three targets.
// What this wrapper adds:
//
//  1. CHUNKING — Android's TTS engine rejects utterances over ~4000 chars,
//     and a 400-page book is one giant string. Words are grouped into
//     ~3000-char utterances chained via onDone.
//  2. WORD MAPPING — onBoundary reports a charIndex within the current
//     utterance; a per-chunk offset table maps it back to the GLOBAL word
//     index the karaoke highlight uses. Platforms with real boundary
//     events (iOS, web, most Android engines) get exact word sync.
//  3. RESYNC POINTS — onChunkStart(globalWordIndex) fires as each chunk
//     begins, so even boundary-less platforms snap the estimator back to
//     the true position every ~500 words.
//
// The caller owns pacing fallback (timer estimator) and all Redux state.

// Android's engine caps a single utterance around 4000 chars. Web gets
// smaller chunks: Chrome's speechSynthesis is known to stall on long
// utterances, and frequent chunk boundaries double as resync points.
const CHUNK_CHARS = Platform.OS === "web" ? 1200 : 3000;

export function speakWords({
  words,
  startIndex = 0,
  rate = 1,
  pitch = 1,
  voice,
  onWord,
  onChunkStart,
  onDone,
  onError,
}) {
  const chunks = buildChunks(words, startIndex);
  let stopped = false;
  let chunkIdx = 0;

  function speakNext() {
    if (stopped) return;
    if (chunkIdx >= chunks.length) {
      if (onDone) onDone();
      return;
    }
    const chunk = chunks[chunkIdx++];
    if (onChunkStart) onChunkStart(chunk.firstWordIndex);
    Speech.speak(chunk.text, {
      rate,
      pitch,
      // A specific platform voice (identifier) if the user picked one;
      // undefined falls back to the engine default.
      ...(voice ? { voice } : {}),
      onBoundary: (event) => {
        if (stopped) return;
        const charIndex = event?.charIndex;
        if (typeof charIndex !== "number") return;
        if (onWord) onWord(wordIndexForChar(chunk, charIndex));
      },
      onDone: () => {
        if (!stopped) speakNext();
      },
      onStopped: () => {},
      onError: (err) => {
        if (!stopped && onError) onError(err);
      },
    });
  }

  speakNext();

  return {
    stop() {
      stopped = true;
      Speech.stop();
    },
  };
}

function buildChunks(words, startIndex) {
  const chunks = [];
  let current = [];
  let currentLen = 0;
  let currentStart = startIndex;

  for (let i = startIndex; i < words.length; i++) {
    const word = words[i];
    if (currentLen + word.length + 1 > CHUNK_CHARS && current.length > 0) {
      chunks.push(buildChunk(current, currentStart));
      current = [];
      currentLen = 0;
      currentStart = i;
    }
    current.push(word);
    currentLen += word.length + 1;
  }
  if (current.length > 0) chunks.push(buildChunk(current, currentStart));
  return chunks;
}

function buildChunk(wordArr, firstWordIndex) {
  const offsets = new Array(wordArr.length);
  let pos = 0;
  for (let i = 0; i < wordArr.length; i++) {
    offsets[i] = pos;
    pos += wordArr[i].length + 1; // +1 for the joining space
  }
  return { text: wordArr.join(" "), firstWordIndex, offsets };
}

// Largest word whose start offset is <= charIndex (binary search).
function wordIndexForChar(chunk, charIndex) {
  const { offsets } = chunk;
  let lo = 0;
  let hi = offsets.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= charIndex) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return chunk.firstWordIndex + ans;
}

// The installed system voices, best-quality first. expo-speech exposes
// { identifier, name, quality, language }. quality is 'Default' | 'Enhanced'
// (and some Android engines tag network/neural voices in the name).
export async function listVoices() {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (!Array.isArray(voices)) return [];
    const score = (v) => {
      let s = 0;
      if (v.quality === "Enhanced" || v.quality === Speech.VoiceQuality?.Enhanced) s += 100;
      if (/enhanced|premium|neural|natural|network/i.test(v.name || "")) s += 50;
      if (/^en/i.test(v.language || "")) s += 10; // surface English first
      return s;
    };
    return [...voices].sort((a, b) => score(b) - score(a));
  } catch (e) {
    return [];
  }
}
