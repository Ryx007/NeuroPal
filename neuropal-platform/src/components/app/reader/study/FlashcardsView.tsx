"use client";
// Flashcards: recall the answer, then "Again" (the card comes back at the end)
// or "Got it" (it's put away), with progress. The deck stays on this device
// for this document (study.ts). Every step is a button, and focus follows
// the card (question, then answer, then the next question), so it works by
// keyboard and with a screen reader.
import { useEffect, useId, useRef } from "react";
import { ChoiceChips } from "@/components/app/common/bits";
import { CheckIcon } from "@/components/app/common/icons";
import { Markdown } from "@/lib/neuropal/reader/markdown";
import { CARD_COUNTS, saveDeckProgress, useDeck } from "@/lib/neuropal/study";
import { CardsIcon, ShuffleIcon } from "./icons";
import { Failure, Made, Working } from "./parts";
import { cancel, run, setFlipped, setMemoryDeck, setOptions, type DocStudy } from "./state";
import styles from "./study.module.css";

const COUNT_CHOICES = CARD_COUNTS.map((n) => ({ value: n as number, label: String(n), ariaLabel: `${n} cards` }));

interface Props {
  docId: string;
  docTitle: string;
  study: DocStudy;
  unavailable: string | null;
}

export function FlashcardsView({ docId, docTitle, study, unavailable }: Props) {
  const id = useId();
  const stored = useDeck(docId);
  const deck = stored ?? study.deck;
  const slot = study.tools.flashcards;
  const busy = slot.running;
  const flipped = study.flipped;
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  /** Where focus goes after the next render (set by the button that changed the card). */
  const focusNext = useRef<"front" | "back" | "done" | null>(null);

  useEffect(() => {
    const where = focusNext.current;
    if (!where) return;
    focusNext.current = null;
    (where === "back" ? backRef : where === "front" ? frontRef : doneRef).current?.focus();
  });

  // A first deck replaces the "Make flashcards" button: when focus went with
  // it, it goes to the first question instead of the top of the page.
  const madeAt = deck?.generatedAt ?? null;
  useEffect(() => {
    if (madeAt && (document.activeElement === document.body || document.activeElement === null)) frontRef.current?.focus();
  }, [madeAt]);

  const make = () => {
    if (busy || unavailable) return;
    run(docId, "flashcards", docTitle);
  };

  const save = (queue: number[], recalled: number) => {
    if (stored) saveDeckProgress(docId, queue, recalled);
    else if (study.deck) setMemoryDeck(docId, { ...study.deck, queue, recalled });
  };

  const makeLabel = busy ? "Working…" : slot.error?.retry ? "Try again" : deck ? "Make a new deck" : "Make flashcards";
  const options = (
    <ChoiceChips
      label={deck ? "Cards in a new deck" : "Cards"}
      value={study.options.cardCount}
      choices={COUNT_CHOICES}
      onChange={(v) => setOptions(docId, { cardCount: v })}
    />
  );
  const progress = (
    <>
      {busy ? <Working title="Reading the document and writing your flashcards…" startedAt={busy.startedAt} onCancel={() => cancel(docId, "flashcards")} /> : null}
      {slot.error && !busy ? <Failure failure={slot.error} /> : null}
    </>
  );

  if (!deck) {
    return (
      <>
        <p className={styles.lead}>
          Cards to flip: recall the answer, then choose “Again” to see the card later or “Got it” to put it away. The deck stays on this device.
        </p>
        {options}
        <div className={styles.actions}>
          <button type="button" className="np-btn np-btn--small" onClick={make} aria-disabled={busy || unavailable ? true : undefined}>
            <CardsIcon />
            {makeLabel}
          </button>
        </div>
        {progress}
      </>
    );
  }

  const total = deck.cards.length;
  const head = deck.queue[0];
  const card = head !== undefined ? deck.cards[head] : undefined;
  const pct = Math.round((deck.recalled / Math.max(1, total)) * 100);

  const reveal = () => {
    focusNext.current = "back";
    setFlipped(docId, true);
  };

  const grade = (gotIt: boolean) => {
    if (head === undefined) return;
    const rest = deck.queue.slice(1);
    const queue = gotIt ? rest : [...rest, head];
    focusNext.current = queue.length ? "front" : "done";
    save(queue, deck.recalled + (gotIt ? 1 : 0));
    setFlipped(docId, false);
  };

  const shuffle = () => {
    const order = deck.cards.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    focusNext.current = "front";
    save(order, 0);
    setFlipped(docId, false);
  };

  return (
    <>
      <div className={styles.deck}>
        <Made label={`${total} cards`} at={deck.generatedAt} extra={stored ? "on this device" : "not kept on this device"} />
        <div className={styles.deckProgress}>
          <p className={styles.deckCount}>
            {deck.recalled} recalled · {deck.queue.length} to go
          </p>
          <div className={styles.meter} aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>

        {card ? (
          <>
            <div className={styles.card} data-flipped={flipped || undefined}>
              <div ref={frontRef} tabIndex={-1} className={styles.face}>
                <p className={styles.faceLabel}>Question</p>
                <Markdown text={card.front} className={`${styles.md} ${styles.faceText}`} mathClassName={styles.mathInline} />
              </div>
              {flipped ? (
                <div ref={backRef} tabIndex={-1} className={`${styles.face} ${styles.back}`}>
                  <p className={styles.faceLabel}>Answer</p>
                  <Markdown text={card.back} className={`${styles.md} ${styles.faceText}`} mathClassName={styles.mathInline} />
                </div>
              ) : null}
            </div>
            <div className={styles.grade}>
              {flipped ? (
                <>
                  <button type="button" className="np-btn np-btn--ghost" onClick={() => grade(false)}>
                    Again
                    <span className="np-sr-only"> — show this card again later</span>
                  </button>
                  <button type="button" className="np-btn" onClick={() => grade(true)}>
                    <CheckIcon />
                    Got it
                    <span className="np-sr-only"> — put this card away</span>
                  </button>
                </>
              ) : (
                <button type="button" className="np-btn" onClick={reveal}>
                  Show answer
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div ref={doneRef} tabIndex={-1} className={styles.done}>
              <p className={styles.doneTitle}>Deck complete — all {total} recalled.</p>
              <p className={styles.lead}>Shuffle to go through them again, or make a new deck below.</p>
            </div>
            <div className={styles.actions}>
              <button type="button" className="np-btn np-btn--small" onClick={shuffle}>
                <ShuffleIcon />
                Shuffle and start again
              </button>
            </div>
          </>
        )}
      </div>

      <section className={styles.newDeck} aria-labelledby={`${id}-new`}>
        <h3 id={`${id}-new`} className={styles.subhead}>
          A new deck
        </h3>
        <p className={styles.note}>Replaces this one. You can keep going with this deck while the new one is made.</p>
        {options}
        <div className={styles.actions}>
          <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={make} aria-disabled={busy || unavailable ? true : undefined}>
            <CardsIcon />
            {makeLabel}
          </button>
        </div>
        {progress}
      </section>
    </>
  );
}
