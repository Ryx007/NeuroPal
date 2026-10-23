// Lesson copy: two-source interference. The three levels describe the same
// physics at different depths; each is correct on its own terms.
import type { ReactNode } from "react";

export type Level = "simple" | "standard" | "technical";
export type Interest = "music" | "games" | "cooking";

export const LEVELS: { id: Level; label: string; note: string }[] = [
  { id: "simple", label: "Simple", note: "Plain words, no symbols." },
  { id: "standard", label: "Standard", note: "The rule, with a little algebra." },
  { id: "technical", label: "Technical", note: "The full derivation." },
];

export const INTERESTS: { id: Interest; label: string }[] = [
  { id: "music", label: "Music" },
  { id: "games", label: "Video games" },
  { id: "cooking", label: "Cooking" },
];

const r1 = (
  <>
    <i>r</i>
    <sub>1</sub>
  </>
);
const r2 = (
  <>
    <i>r</i>
    <sub>2</sub>
  </>
);

export const EXPLANATIONS: Record<Level, ReactNode> = {
  simple: (
    <>
      <p>
        Each source dips into the water in a steady rhythm and sends out rings of ripples. The distance from one crest
        to the next is the <b>wavelength</b>.
      </p>
      <p>Where two ripples overlap, they add up:</p>
      <ul>
        <li>
          <b>Crest meets crest</b>, or trough meets trough: the wave gets bigger.
        </li>
        <li>
          <b>Crest meets trough</b>: they cancel, and the water hardly moves.
        </li>
      </ul>
      <p>
        In some places the two ripples always arrive in step, so the water there swings strongly. Those places line up
        into the <b>bright lines</b> in the picture. In other places they always arrive out of step, crest with trough,
        and the water stays almost still: the <b>dark lines</b>.
      </p>
      <p>
        Try it in the tank: longer ripples give fewer, wider lines. Sources further apart give more lines, packed closer
        together.
      </p>
    </>
  ),
  standard: (
    <>
      <p>
        Both sources vibrate in step: the same frequency and the same phase. Each sends out circular waves of wavelength{" "}
        <i>λ</i>.
      </p>
      <p>
        At any point P the two waves have travelled distances {r1} and {r2}. What decides the result is the{" "}
        <b>path difference</b> Δ = {r2} − {r1}.
      </p>
      <ul>
        <li>
          If Δ is a whole number of wavelengths, Δ = <i>m</i>λ with <i>m</i> = 0, ±1, ±2, …, the crests arrive together:{" "}
          <b>constructive interference</b>, a bright line.
        </li>
        <li>
          If Δ is a whole number plus a half, Δ = (<i>m</i> + ½)λ, a crest meets a trough:{" "}
          <b>destructive interference</b>, a dark line.
        </li>
      </ul>
      <p>
        Far from the sources, Δ ≈ <i>d</i> sin <i>θ</i>, where <i>d</i> is the separation and <i>θ</i> the angle from
        straight ahead. So the bright lines point along <b>
          <i>d</i> sin <i>θ</i> = <i>m</i>λ
        </b>
        .
      </p>
      <p>
        Because sin <i>θ</i> can never exceed 1, there are 2⌊<i>d</i>/λ⌋ + 1 bright lines in total. More separation or
        shorter waves give more lines, packed closer together.
      </p>
      <p>
        Thomas Young saw the same stripes with light in the early 1800s. They became key evidence that light is a wave.
      </p>
    </>
  ),
  technical: (
    <>
      <p>
        Take two coherent point sources at (±<i>d</i>/2, 0) with equal amplitude <i>A</i>, and write <i>k</i> = 2π/λ:
      </p>
      <p className="lesson-math">
        ψ(<b>r</b>, <i>t</i>) = <i>A</i> cos(<i>k</i>
        {r1} − ω<i>t</i>) + <i>A</i> cos(<i>k</i>
        {r2} − ω<i>t</i>)
      </p>
      <p>
        A sum-to-product step gives ψ = 2<i>A</i> cos(<i>k</i>Δ/2) cos(<i>k</i>
        <i>r̄</i> − ω<i>t</i>), with Δ = {r2} − {r1} and <i>r̄</i> = ({r1} + {r2})/2. The first factor is a fixed
        envelope; the second is the travelling carrier you see when you press Play.
      </p>
      <p>
        Time-averaging: ⟨ψ²⟩ = 2<i>A</i>² cos²(<i>k</i>Δ/2), so <i>I</i> ∝ cos²(πΔ/λ). For unequal amplitudes, ⟨ψ²⟩ = ½(
        <i>A</i>
        <sub>1</sub>² + <i>A</i>
        <sub>2</sub>²) + <i>A</i>
        <sub>1</sub>
        <i>A</i>
        <sub>2</sub> cos(<i>k</i>Δ).
      </p>
      <p>
        Curves of constant Δ are hyperbolae with the sources as foci. The nodal lines are the hyperbolae Δ = (<i>m</i> +
        ½)λ.
      </p>
      <p>
        Far field (<i>r</i> ≫ <i>d</i>): Δ ≈ <i>d</i> sin <i>θ</i>, so <i>I</i>(<i>θ</i>) = <i>I</i>
        <sub>max</sub> cos²(π<i>d</i> sin <i>θ</i>/λ), with maxima at sin <i>θ</i> = <i>m</i>λ/<i>d</i> and |<i>m</i>| ≤{" "}
        <i>d</i>/λ. On a screen at distance <i>L</i> ≫ <i>d</i>, small angles give a fringe spacing of λ<i>L</i>/
        <i>d</i>.
      </p>
      <p>
        Fringe visibility <i>V</i> = (<i>I</i>
        <sub>max</sub> − <i>I</i>
        <sub>min</sub>)/(<i>I</i>
        <sub>max</sub> + <i>I</i>
        <sub>min</sub>) = 2<i>A</i>
        <sub>1</sub>
        <i>A</i>
        <sub>2</sub>/(<i>A</i>
        <sub>1</sub>² + <i>A</i>
        <sub>2</sub>²), so equal amplitudes give <i>V</i> = 1. If the relative phase drifts at random, the cross term
        averages away and the fringes vanish: the sources must be mutually coherent.
      </p>
      <p>
        Real ripples in two dimensions also fade as 1/√<i>r</i>. The tank leaves that factor out so the pattern stays
        readable across the whole view.
      </p>
    </>
  ),
};

export const INTEREST_TEXT: Record<Interest, { title: string; body: ReactNode }> = {
  music: {
    title: "Two speakers, one note",
    body: (
      <>
        <p>
          Play one steady note through two speakers and walk slowly across the room in front of them. The note gets
          louder and quieter as you go.
        </p>
        <p>
          Where the sound from both speakers arrives in step, the pressure waves add up and the note is loud. Where one
          arrives half a wavelength behind the other, they cancel and it goes quiet. A note of 343 Hz has a wavelength
          of about one metre, so the loud and quiet spots are spaced on the scale of a metre. Real rooms add echoes, so
          the pattern is messier than in the tank.
        </p>
        <p>
          Noise-cancelling headphones use the cancelling half on purpose: they play an inverted copy of the noise, so
          crest meets trough.
        </p>
        <p className="lesson-link">
          In the tank: the speakers are the two sources, and your walk across the room is a trip along the far edge.
        </p>
      </>
    ),
  },
  games: {
    title: "Water in a game engine",
    body: (
      <>
        <p>
          Many game engines draw water by adding sine waves together. Put two ripple emitters on a pond, ticking in
          sync, and add their waves at every pixel.
        </p>
        <p>
          Where crest meets crest, the surface rises highest. Where crest meets trough, the two cancel and the surface
          stays flat. The flat lines fan out from between the emitters, exactly like the dark lines in the tank.
        </p>
        <p className="lesson-link">
          In the tank: move the emitters further apart and you get more, thinner lines; that is the separation slider.
          Make the ripples longer and the lines spread out; that is the wavelength slider.
        </p>
      </>
    ),
  },
  cooking: {
    title: "Hot spots in a microwave",
    body: (
      <>
        <p>
          Inside a microwave oven, the waves bounce off the metal walls and overlap with their own reflections. Where
          they add, you get hot spots; where they cancel, cold spots.
        </p>
        <p>
          Home ovens use waves about 12 cm long, so neighbouring hot spots sit roughly 6 cm apart, half a wavelength.
          That is why the food turns on a turntable: it carries every part through hot and cold spots in turn. You can
          see the pattern yourself: take the turntable out, warm a plate of grated cheese for a few seconds, and look
          for the melted patches.
        </p>
        <p className="lesson-link">
          In the tank: a wave and its reflection behave like two sources, one real and one its mirror image behind the
          wall.
        </p>
      </>
    ),
  },
};

export const SUMMARY = [
  "Waves add where they meet: crest plus crest is bigger, crest plus trough cancels.",
  "Bright lines sit where the path difference is a whole number of wavelengths; dark lines, a whole number plus a half.",
  "More separation or shorter waves: more lines, packed closer together.",
];
