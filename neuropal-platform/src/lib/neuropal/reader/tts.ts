// Read-aloud on the Web Speech API, with a word cursor for karaoke.
//
// The reader hands over ONE word stream (what each word sounds like, where
// sentences and paragraphs end); this engine speaks it from any word and
// reports the word being spoken.
//
// What the browser makes hard, and how this copes:
//   - Chrome drops long utterances on some voices after ~15 s, and some
//     never fire `end`: speech goes out one sentence at a time (long
//     sentences split at a comma), with a watchdog that moves on.
//   - Not every voice sends word `boundary` events: until one arrives, a
//     timing estimate from the speed (weighted by word length and
//     punctuation) moves the cursor, and the next sentence resyncs it.
//   - `cancel()` fires late `end`/`error` events for the old utterance: every
//     start bumps a generation counter and stale events are ignored.
//   - Chrome sometimes swallows a `speak()` right after `cancel()`: a fresh
//     start waits a moment first.
//   - Chrome can garbage-collect an utterance mid-speech: the live one is
//     always referenced here.
//   - `pause()`/`resume()` are unreliable across engines: pause cancels and
//     remembers the word; play starts again from it.

export const BASE_WPM = 180;
const MIN_RATE = 0.5;
const MAX_RATE = 2.5;
/** Seconds of speech per utterance, at most (the ~15 s cut-off, with room). */
const CHUNK_SECONDS = 10;

export interface SpeechStream {
  /** What the voice says per word ("" = silent: figures, skipped equations). */
  speech: readonly string[];
  /** 1 where a word ends a sentence (paragraph ends included). */
  sentenceEnd: Uint8Array;
  /** Paragraph per word. */
  paraOf: Int32Array;
}

export interface VoiceSettings {
  voiceURI: string | null;
  wordsPerMinute: number;
  pitch: number;
  /** BCP-47 language of the text, used when no voice is chosen. */
  lang?: string;
}

export type PlayState = "idle" | "playing" | "paused" | "ended" | "error";

export interface ReadAloudCallbacks {
  /** The word being spoken changed. */
  onWord: (index: number) => void;
  onState: (state: PlayState, message?: string) => void;
  /** utterance.rate for a words-per-minute setting (default: wpm / 180, clamped). */
  rateFor?: (wordsPerMinute: number) => number;
}

interface Chunk {
  first: number;
  /** Exclusive. */
  end: number;
  text: string;
  /** Char offset of each spoken word in `text`, ascending. */
  offsets: number[];
  /** Word index of each spoken word. */
  tokens: number[];
  /** Cumulative timing weight up to and including each spoken word. */
  weights: number[];
}

export const clampRate = (wpm: number) => Math.min(MAX_RATE, Math.max(MIN_RATE, wpm / BASE_WPM));

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

function weightOf(word: string): number {
  let w = word.length + 1;
  if (/[,;:)\]–—]$/.test(word)) w += 3;
  else if (/[.!?…]["”’)]*$/.test(word)) w += 6;
  return w;
}

function findVoice(uri: string | null): SpeechSynthesisVoice | null {
  if (!uri) return null;
  try {
    return window.speechSynthesis.getVoices().find((v) => v.voiceURI === uri) ?? null;
  } catch {
    return null;
  }
}

export class ReadAloud {
  private stream: SpeechStream | null = null;
  private total = 0;
  private settings: VoiceSettings = { voiceURI: null, wordsPerMinute: BASE_WPM, pitch: 1 };
  private cb: ReadAloudCallbacks;
  private state: PlayState = "idle";
  private gen = 0;
  private cursor = 0;
  private utterance: SpeechSynthesisUtterance | null = null;
  private chunk: Chunk | null = null;
  private startedAt = 0;
  private gotBoundary = false;
  private timers = new Set<number>();
  private estimator: number | null = null;
  /** Voices known to send word boundaries (so no estimate is needed). */
  private boundaryVoices = new Set<string>();
  private endedHandler: (() => void) | null = null;

  constructor(cb: ReadAloudCallbacks) {
    this.cb = cb;
  }

  get playing() {
    return this.state === "playing";
  }

  /** Called when the stream has been read to the end. */
  setEndedHandler(fn: (() => void) | null) {
    this.endedHandler = fn;
  }

  get position() {
    return this.cursor;
  }

  setStream(stream: SpeechStream | null) {
    this.stop("idle");
    this.stream = stream;
    this.total = stream ? stream.speech.length : 0;
    this.cursor = 0;
  }

  /** New voice/speed/pitch. While playing, picks up again from the word being spoken. */
  setSettings(next: VoiceSettings) {
    const changed =
      next.voiceURI !== this.settings.voiceURI ||
      next.wordsPerMinute !== this.settings.wordsPerMinute ||
      next.pitch !== this.settings.pitch ||
      next.lang !== this.settings.lang;
    this.settings = next;
    if (changed && this.state === "playing") this.play(this.cursor);
  }

  /** Move the cursor without speaking (or keep speaking from there). */
  seek(index: number) {
    const i = this.clamp(index);
    if (this.state === "playing") {
      this.play(i);
      return;
    }
    this.cursor = i;
    this.cb.onWord(i);
  }

  play(from: number = this.cursor) {
    if (!this.stream || this.total === 0) return;
    if (!speechSupported()) {
      this.setState("error", "Read-aloud isn’t available in this browser.");
      return;
    }
    const start = this.clamp(from);
    const gen = this.halt();
    this.cursor = start;
    this.cb.onWord(start);
    this.setState("playing");
    // A short pause after cancel(): Chrome can drop a speak() that follows it at once.
    this.later(() => {
      if (gen === this.gen) this.speakFrom(start, gen);
    }, 60);
  }

  pause() {
    if (this.state !== "playing") return;
    this.halt();
    this.setState("paused");
  }

  toggle() {
    if (this.state === "playing") this.pause();
    else this.play(this.state === "ended" ? 0 : this.cursor);
  }

  stop(state: PlayState = "idle") {
    this.halt();
    if (this.state !== state) this.setState(state);
  }

  destroy() {
    this.halt();
    this.stream = null;
  }

  // ---- internals -----------------------------------------------------------

  private clamp(i: number) {
    return Math.max(0, Math.min(Math.max(0, this.total - 1), Math.floor(i) || 0));
  }

  private setState(s: PlayState, message?: string) {
    this.state = s;
    this.cb.onState(s, message);
    if (s === "ended") this.endedHandler?.();
  }

  /** Stop speech and timers; returns the new generation. */
  private halt(): number {
    this.gen += 1;
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    this.stopEstimator();
    this.chunk = null;
    if (this.utterance) {
      this.utterance.onstart = null;
      this.utterance.onend = null;
      this.utterance.onerror = null;
      this.utterance.onboundary = null;
      this.utterance = null;
    }
    if (speechSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* nothing to cancel */
      }
    }
    return this.gen;
  }

  private later(fn: () => void, ms: number) {
    const t = window.setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  private rate() {
    const r = this.cb.rateFor ? this.cb.rateFor(this.settings.wordsPerMinute) : clampRate(this.settings.wordsPerMinute);
    return Number.isFinite(r) && r > 0 ? r : 1;
  }

  private voiceKey() {
    return this.settings.voiceURI || "default";
  }

  private buildChunk(from: number): Chunk {
    const s = this.stream as SpeechStream;
    const maxWords = Math.max(8, Math.round((BASE_WPM * this.rate() * CHUNK_SECONDS) / 60));
    let end = from;
    let spoken = 0;
    let lastClause = -1;
    while (end < this.total) {
      const t = end;
      end += 1;
      const word = s.speech[t];
      if (word) {
        spoken += 1;
        if (/[,;:)–—]$/.test(word) && spoken >= Math.floor(maxWords / 2)) lastClause = end;
      }
      if (s.sentenceEnd[t]) break;
      if (end < this.total && s.paraOf[end] !== s.paraOf[t]) break;
      if (spoken >= maxWords) {
        if (lastClause > from) end = lastClause;
        break;
      }
    }
    const offsets: number[] = [];
    const tokens: number[] = [];
    const weights: number[] = [];
    let text = "";
    let acc = 0;
    for (let t = from; t < end; t++) {
      const word = s.speech[t];
      if (!word) continue;
      if (text) text += " ";
      offsets.push(text.length);
      tokens.push(t);
      text += word;
      acc += weightOf(word);
      weights.push(acc);
    }
    return { first: from, end, text, offsets, tokens, weights };
  }

  private speakFrom(from: number, gen: number) {
    if (gen !== this.gen || !this.stream) return;
    if (from >= this.total) {
      this.cursor = this.total - 1;
      this.setState("ended");
      return;
    }
    const chunk = this.buildChunk(from);
    this.chunk = chunk;
    if (!chunk.text.trim()) {
      // Nothing to say here (a figure): show it, then go on.
      this.cursor = chunk.first;
      this.cb.onWord(chunk.first);
      this.later(() => this.speakFrom(chunk.end, gen), 120);
      return;
    }

    const u = new SpeechSynthesisUtterance(chunk.text);
    const voice = findVoice(this.settings.voiceURI);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || this.settings.lang || document.documentElement.lang || "en";
    u.rate = this.rate();
    u.pitch = Math.min(2, Math.max(0, this.settings.pitch || 1));
    u.volume = 1;
    this.utterance = u;
    this.gotBoundary = false;
    let started = false;

    u.onstart = () => {
      if (gen !== this.gen) return;
      started = true;
      this.startedAt = performance.now();
      this.emit(chunk.tokens[0]);
      if (this.boundaryVoices.has(this.voiceKey())) {
        // This voice sends boundaries; only estimate if they stop coming.
        this.later(() => {
          if (gen === this.gen && this.chunk === chunk && !this.gotBoundary) this.startEstimator(chunk, gen);
        }, 1200);
      } else {
        this.startEstimator(chunk, gen);
      }
      const expected = chunk.weights[chunk.weights.length - 1] * this.msPerUnit();
      this.later(() => {
        // Stalled (no `end` ever came): clear the engine and go on rather than hang.
        if (gen !== this.gen || this.chunk !== chunk) return;
        const g = this.halt();
        if (chunk.end >= this.total) {
          this.cursor = this.total - 1;
          this.setState("ended");
          return;
        }
        this.later(() => this.speakFrom(chunk.end, g), 60);
      }, expected * 3 + 5000);
    };

    u.onboundary = (e: SpeechSynthesisEvent) => {
      if (gen !== this.gen || this.chunk !== chunk) return;
      if (e.name && e.name !== "word") return;
      const ci = typeof e.charIndex === "number" ? e.charIndex : -1;
      if (ci < 0) return;
      this.gotBoundary = true;
      this.boundaryVoices.add(this.voiceKey());
      this.stopEstimator();
      this.emit(chunk.tokens[this.offsetIndex(chunk, ci)]);
    };

    u.onend = () => {
      if (gen !== this.gen || this.chunk !== chunk) return;
      this.next(chunk, gen);
    };

    u.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (gen !== this.gen) return;
      if (e.error === "interrupted" || e.error === "canceled") return;
      this.halt();
      this.setState("error", errorWords(e.error));
    };

    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      window.speechSynthesis.speak(u);
    } catch {
      this.halt();
      this.setState("error", "Read-aloud couldn’t start in this browser.");
      return;
    }

    // Nothing at all after a while: the browser has no working voice.
    this.later(() => {
      if (gen === this.gen && this.chunk === chunk && !started) {
        this.halt();
        this.setState(
          "error",
          "Read-aloud didn’t start. Check that your computer has a voice installed, or try another voice in the read-aloud settings.",
        );
      }
    }, 7000);
  }

  private next(chunk: Chunk, gen: number) {
    this.stopEstimator();
    if (chunk.end >= this.total) {
      this.utterance = null;
      this.chunk = null;
      this.cursor = this.total - 1;
      this.setState("ended");
      return;
    }
    this.speakFrom(chunk.end, gen);
  }

  private emit(index: number | undefined) {
    if (index === undefined || index === this.cursor) return;
    this.cursor = index;
    this.cb.onWord(index);
  }

  private offsetIndex(chunk: Chunk, charIndex: number) {
    const o = chunk.offsets;
    let lo = 0;
    let hi = o.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (o[mid] <= charIndex) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  /** Milliseconds per timing unit (≈ one character) at the current speed. */
  private msPerUnit() {
    return 60000 / (BASE_WPM * this.rate() * 6);
  }

  private startEstimator(chunk: Chunk, gen: number) {
    this.stopEstimator();
    const unit = this.msPerUnit();
    this.estimator = window.setInterval(() => {
      if (gen !== this.gen || this.chunk !== chunk || this.gotBoundary) {
        this.stopEstimator();
        return;
      }
      const elapsed = (performance.now() - this.startedAt) / unit;
      const w = chunk.weights;
      let k = 0;
      while (k < w.length - 1 && w[k] <= elapsed) k++;
      this.emit(chunk.tokens[k]);
    }, 70);
  }

  private stopEstimator() {
    if (this.estimator !== null) {
      window.clearInterval(this.estimator);
      this.estimator = null;
    }
  }
}

function errorWords(code: string): string {
  switch (code) {
    case "network":
      return "This voice needs the internet and couldn’t reach it. Try a voice installed on this device.";
    case "synthesis-unavailable":
    case "voice-unavailable":
      return "That voice isn’t available right now. Choose another voice in the read-aloud settings.";
    case "language-unavailable":
      return "There’s no voice for this language on this device.";
    case "not-allowed":
      return "The browser blocked read-aloud. Click Play again to start it.";
    case "audio-busy":
    case "audio-hardware":
      return "The audio device is busy. Try again in a moment.";
    case "text-too-long":
      return "That passage was too long for this voice. Try again from the next sentence.";
    default:
      return "Read-aloud stopped unexpectedly. Press Play to try again.";
  }
}
