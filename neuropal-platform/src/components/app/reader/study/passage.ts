// "Explain the sentence being read": the sentence at the reading position,
// plus the next ones while it is too short to explain on its own (a heading
// number like "1.", "Fig. 3", a one-word line).
import { sentenceRange, type ReaderModel } from "@/lib/neuropal/reader/sections";

type Words = Pick<ReaderModel, "sentenceEnd" | "totalWords" | "words">;

export function passageAt(model: Words, i: number, minWords = 6, maxWords = 80): string {
  if (!model.totalWords) return "";
  const at = Math.max(0, Math.min(model.totalWords - 1, i));
  const [s, first] = sentenceRange(model, at);
  let e = first;
  while (e - s < minWords && e < model.totalWords) {
    const next = sentenceRange(model, e)[1];
    if (next <= e) break;
    e = next;
  }
  return model.words
    .slice(s, Math.min(e, s + maxWords))
    .filter((w) => w !== "[image]")
    .join(" ");
}
