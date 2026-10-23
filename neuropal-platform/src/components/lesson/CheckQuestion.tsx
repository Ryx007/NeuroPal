"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import styles from "./lesson.module.css";

// Hint-first check: the learner tries first; a hint is offered after a try,
// and the answer only when they ask for it. Nothing is scored or stored.

const QUESTION =
  "You move the two sources further apart and keep the wavelength the same. What happens to the bright lines?";

const OPTIONS = [
  { id: "fewer", text: "There are fewer of them, spread further apart." },
  { id: "more", text: "There are more of them, packed closer together." },
  { id: "gone", text: "They disappear." },
  { id: "same", text: "Nothing changes." },
];

const CORRECT = "more";

type Result = null | "empty" | "right" | "wrong";

export function CheckQuestion() {
  const [choice, setChoice] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [tries, setTries] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [answerShown, setAnswerShown] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const firstOption = useRef<HTMLInputElement>(null);
  const id = useId();
  const solved = result === "right" || answerShown;

  useEffect(() => {
    if (hintShown) hintRef.current?.focus();
  }, [hintShown]);

  // Whether solved by a right answer or by asking, move focus to the
  // explanation (the button that was focused may now be disabled).
  useEffect(() => {
    if (solved) answerRef.current?.focus();
  }, [solved]);

  const check = (e: FormEvent) => {
    e.preventDefault();
    if (!choice) {
      setResult("empty");
      return;
    }
    setTries((t) => t + 1);
    setResult(choice === CORRECT ? "right" : "wrong");
  };

  const reset = () => {
    setChoice(null);
    setResult(null);
    setTries(0);
    setHintShown(false);
    setAnswerShown(false);
    firstOption.current?.focus();
  };

  let feedback = "";
  if (result === "empty") feedback = "Pick one of the answers first.";
  else if (result === "right") feedback = "Yes: more lines, packed closer together.";
  else if (answerShown) feedback = "Here is the answer, with the reasoning below.";
  else if (result === "wrong")
    feedback = hintShown
      ? "Not this one either. Try once more, or show the answer."
      : "Not this one. Have another go, or ask for a hint.";

  return (
    <form className={styles.check} onSubmit={check} noValidate>
      <fieldset className={styles.checkSet}>
        <legend className={styles.checkQuestion}>{QUESTION}</legend>
        <div className={styles.options}>
          {OPTIONS.map((o, i) => {
            const isAnswer = solved && o.id === CORRECT;
            return (
              <label key={o.id} className={styles.option} data-answer={isAnswer ? "true" : undefined}>
                <input
                  ref={i === 0 ? firstOption : undefined}
                  type="radio"
                  name={`${id}-q`}
                  value={o.id}
                  checked={choice === o.id}
                  disabled={solved}
                  onChange={() => {
                    setChoice(o.id);
                    if (result === "empty") setResult(null);
                  }}
                />
                <span>{o.text}</span>
                {isAnswer ? <span className="np-tag np-tag--accent">Answer</span> : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className={styles.checkActions}>
        <button type="submit" className="np-btn" disabled={solved}>
          Check my answer
        </button>
        {tries > 0 && !hintShown && !solved ? (
          <button type="button" className="np-btn np-btn--ghost" onClick={() => setHintShown(true)}>
            Show a hint
          </button>
        ) : null}
        {hintShown && !solved ? (
          <button type="button" className="np-btn np-btn--ghost" onClick={() => setAnswerShown(true)}>
            Show the answer
          </button>
        ) : null}
        {tries > 0 || hintShown || answerShown ? (
          <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={reset}>
            Start again
          </button>
        ) : null}
      </div>

      <p className={styles.feedback} role="status" aria-live="polite">
        {feedback}
      </p>

      {hintShown ? (
        <div className={styles.hint} ref={hintRef} tabIndex={-1} role="group" aria-labelledby={`${id}-hint`}>
          <p id={`${id}-hint`} className="np-label">
            Hint
          </p>
          <p>
            Bright lines sit where the path difference is a whole number of wavelengths. With the sources further
            apart, how large can the path difference get, and how many whole wavelengths fit into it?
          </p>
        </div>
      ) : null}

      {solved ? (
        <div className={styles.answer} ref={answerRef} tabIndex={-1} role="group" aria-labelledby={`${id}-why`}>
          <p id={`${id}-why`} className="np-label">
            {answerShown && result !== "right" ? "The answer" : "Why"}
          </p>
          <p>
            <b>More lines, packed closer together.</b> The largest path difference you can find anywhere is the
            separation itself, <i>d</i> (along the line through both sources). Bright lines need Δ = <i>m</i>λ, so
            there is one for every whole number <i>m</i> with |<i>m</i>| ≤ <i>d</i>/λ. A larger <i>d</i> lets more
            whole numbers fit, and the extra lines have to share the same space.
          </p>
          <p>
            <a href="#see-it">Back to the tank</a> to try it: drag the separation slider and count the lines.
          </p>
        </div>
      ) : null}
    </form>
  );
}
