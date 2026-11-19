"use client";
// The quiz for active recall: each answer stays hidden until you ask for it
// ("Show answer"). Server text, through the safe Markdown renderer.
import { useId } from "react";
import { Markdown } from "@/lib/neuropal/reader/markdown";
import type { ParsedQuiz } from "./quizParse";
import styles from "./study.module.css";

const LEVELS: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export function QuizView({ quiz, revealed, onRevealed }: { quiz: ParsedQuiz; revealed: number[]; onRevealed: (next: number[]) => void }) {
  const id = useId();
  const total = quiz.items.length;
  return (
    <div className={styles.quiz}>
      {quiz.intro ? <Markdown text={quiz.intro} className={styles.md} mathClassName={styles.mathInline} /> : null}
      <ol className={styles.quizList}>
        {quiz.items.map((item, i) => {
          const open = revealed.includes(i);
          const answerId = `${id}-a${i}`;
          return (
            <li key={i} className={styles.quizItem}>
              <p className={styles.quizMeta}>
                <span>
                  Question {i + 1} of {total}
                </span>
                {item.level ? <span className={`np-tag np-tag--outline ${styles.level}`}>{LEVELS[item.level] ?? item.level}</span> : null}
              </p>
              <Markdown text={item.question} className={`${styles.md} ${styles.quizQuestion}`} mathClassName={styles.mathInline} />
              <div>
                <button
                  type="button"
                  className="np-btn np-btn--ghost np-btn--small"
                  aria-expanded={open}
                  aria-controls={answerId}
                  onClick={() => onRevealed(open ? revealed.filter((x) => x !== i) : [...revealed, i])}
                >
                  {open ? "Hide answer" : "Show answer"}
                  <span className="np-sr-only">{` to question ${i + 1}`}</span>
                </button>
              </div>
              <div id={answerId} className={styles.quizAnswer} hidden={!open}>
                {open ? (
                  <>
                    <p className={styles.faceLabel}>Answer</p>
                    <Markdown text={item.answer || "No answer came back for this question."} className={styles.md} mathClassName={styles.mathInline} />
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
