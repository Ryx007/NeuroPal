// The check-in scale: one 0–100 track split into three equal regions. The
// region the knob rests in decides the state the rest of the app already
// understands ("green" | "yellow" | "red"). Shared by both skins; the
// words, glyphs and colours are the ones the state buttons already use.

export const STATE_REGIONS = [
  { id: "green", word: "Okay", shape: "circle", icon: "sentiment-satisfied", tint: "secondary", middle: 0.17 },
  { id: "yellow", word: "Bit off", shape: "triangle", icon: "sentiment-neutral", tint: "tertiary", middle: 0.5 },
  { id: "red", word: "Overwhelmed", shape: "square", icon: "sentiment-very-dissatisfied", tint: "error", middle: 0.83 },
];

// Region edges sit at 33.5 and 66.5 so the 0–100 number shown next to the
// knob always agrees with the region: 0–33 okay, 34–66 bit off, 67–100
// overwhelmed (equal thirds to within half a point).
export const REGION_EDGES = [0.335, 0.665];

// Step for screen-reader increment/decrement and the arrow keys (0–100 units).
export const LEVEL_STEP = 5;

export function clamp01(x) {
  "worklet";
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// 0–1 → 0–100 integer, the number people see and hear.
export function toValue(pos) {
  "worklet";
  return Math.round(clamp01(pos) * 100);
}

export function regionOf(pos) {
  "worklet";
  return pos < 0.335 ? 0 : pos < 0.665 ? 1 : 2;
}

export function regionIndexOfState(state) {
  return STATE_REGIONS.findIndex((r) => r.id === state);
}

export function stateForLevel(level) {
  return STATE_REGIONS[regionOf(clamp01(level))].id;
}

export function middleOfState(state) {
  const i = regionIndexOfState(state);
  return i < 0 ? null : STATE_REGIONS[i].middle;
}

// Where the knob should rest for a stored check-in: the exact level when it
// agrees with the state, otherwise the middle of the state's region, and
// null when nothing has been checked in yet.
export function levelFor(state, level) {
  const i = regionIndexOfState(state);
  if (i < 0) return null;
  if (typeof level === "number" && Number.isFinite(level) && regionOf(clamp01(level)) === i) return clamp01(level);
  return STATE_REGIONS[i].middle;
}

// Colour of a state in the current skin (never used alone: always paired
// with the region's word and glyph).
export function stateTint(palette, state) {
  const i = regionIndexOfState(state);
  return i < 0 ? palette.outline : palette[STATE_REGIONS[i].tint];
}
