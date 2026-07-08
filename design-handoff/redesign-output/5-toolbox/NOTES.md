# 5 — Toolbox — NOTES

**Directive:** D7 (rename “Anchors” → “Toolbox”) + re-render on new shell/material
**File:** `mockup.html` (2 frames: idle · timer running)

## What changed
- **D7 — rename only.** “Anchors” becomes **“Toolbox”** in the drawer label (D1),
  the screen title, and the route name. **Contents are unchanged** — Pomodoro +
  Reminders — signalling it’s the home for study tools (timers, reminders, future
  tools).
- **Re-render** inside the new shell (drawer hamburger header, safe area, tinted
  status bar) with material polish. No behavior change. Frame 2 shows the running
  state + a D5 success toast (“Reminder set”).

## Elements touched (→ `02` Anchols/Toolbox table)
- **Pomodoro** (`PomodoroCard`): MM:SS mono display (from `focus.endsAt`), FOCUS/BREAK
  phase + “N done”, play/pause + reset (with notification schedule/cancel),
  Focus/Break steppers (`setDurations`). All preserved.
- **Reminders** (`RemindersCard`): “Remind me to…” field, quick chips
  (15m/30m/1h/3h/Tmrw 9:00) + custom-min, list rows with done toggle
  (`toggleReminderDone`), delete (`removeReminder`, cancels notification), overdue
  in `warn`. All preserved.

## Recommended default
- Straight rename + re-render, layout unchanged (per D7 “same contents for now”).
  Kept the big mono timer (did **not** add the ring the `02` notes muse about —
  that’s out of the directive’s scope; flagged below as an optional).

## Choices left for owner
- **Optional (not in D7 scope):** upgrade the timer to a progress ring, and add an
  arbitrary date/time picker for reminders (`02` wishlist). Left out to honor
  “same contents for now”; easy to add if you want it.

## Backend / behavioral notes
- D6 keyboard-aware on the reminder + custom-min fields. D5 toast treatment on
  reminder/error toasts. OS notification scheduling (`services/notify.js`) unchanged.
