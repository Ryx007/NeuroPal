# Day sync — contract v1

_Written 2026-11-19 (round 4). This is the single source of truth for the
server and every client. Change this file first, then the code._

Your day follows you across devices: a check-in on the phone shows up in the
web app, an anchor edited on the laptop reaches the phone.

## 1. What syncs

| Section | What it is | Synced |
|---|---|---|
| `checkins` | Home's check-in history (state, level, time) | yes |
| `anchors` | timed anchors and whether each is done today | yes |
| `tasks` | the minimum viable day and today's ticks | yes |
| `todos` | the Toolbox to-do list (Expo only today) | yes |
| `dump` | Pal's brain dump | yes |
| Pal chat | the server already keeps it (`/api/pal/chat`) | — |
| Sit sessions, focus timer, reminders | belong to one device | no |
| Home layout, skin, Pal's look | appearance sync (`/api/me/appearance`) | — |

## 2. The model in one paragraph

**The server is the only merger.** A client sends everything it has for the
sections it knows. The server merges item by item and answers with the full
merged state. The client replaces its local copy with that answer. An item a
client leaves out is **not** deleted: a deletion is always explicit
(`deletedAt`). So a client that doesn't know a section can never destroy it.

## 3. Endpoints

All three need the session (in `LOCAL_MODE` the local user, as everywhere).

### `POST /api/me/day/sync`

Request body (every section is optional):

```json
{
  "v": 1,
  "gen": 3,
  "anchors": [],
  "tasks": [],
  "todos": [],
  "dump": [],
  "checkins": []
}
```

Response `200`:

```json
{
  "v": 1,
  "gen": 3,
  "rev": 41,
  "serverTime": "2026-11-19T17:20:00.000Z",
  "erased": false,
  "anchors": [],
  "tasks": [],
  "todos": [],
  "dump": [],
  "checkins": []
}
```

- `anchors`, `tasks`, `todos`, `dump`: every item the server holds, **live
  ones and tombstones** (`deletedAt` set), in the order of §5.
- `checkins`: the newest 200, oldest first.
- `rev` goes up by one each time a sync changes what is stored.
- Errors: `401` no session; `400` the body is not valid JSON; `422` the body
  is not an object, or `v` is not the number 1 (`{error}`); `413` the body is
  over 10 MB; `503` with `Retry-After` when other syncs for the same person
  kept landing first, or too many of them are waiting (rare; retry like any
  5xx). Bad items never fail the call: see §6.
- A server without this route answers `404`. The client then stops trying
  until the next app start, and shows no error.

### `GET /api/me/day`

The same body as the sync response, without sending anything.

### `DELETE /api/me/day`

Erases the day on the server: every section and the whole check-in history.
Answers `{ "deleted": true, "gen": 4 }` (`rev` goes up too). See §7 for what
`gen` does. No client
has a button for this in v1; the protocol is complete so that adding one
needs no migration.

## 4. Items

Rules for all of them:

- `id`: 1–64 characters from `A-Z a-z 0-9 . _ : -`.
- Times are ISO-8601 UTC with milliseconds: `2026-11-19T17:20:00.000Z`. The
  server also accepts an explicit offset (`+01:00`) and answers in UTC. A time
  without a zone, a number, or an impossible date drops the item. In Dart,
  format with `.toUtc().toIso8601String()`.
- `doneOn` is a **local calendar date**, `YYYY-MM-DD`, on the device that
  ticked. An item is "done today" when `doneOn` equals the device's local
  date. There is no rollover job: tomorrow the dates differ, so the tick no
  longer counts.
- Text is trimmed, inner whitespace collapsed to single spaces, then cut to
  its limit.

### Anchor

```json
{
  "id": "a-m3x9-1",
  "title": "Morning meds",
  "subtitle": "Blue, with water",
  "time": { "hour": 8, "minute": 15 },
  "flexMinutes": 30,
  "category": "medication",
  "icon": "medication",
  "createdAt": "2026-11-01T07:00:00.000Z",
  "updatedAt": "2026-11-19T17:20:00.000Z",
  "deletedAt": null,
  "doneOn": "2026-11-19",
  "tickAt": "2026-11-19T08:21:10.000Z"
}
```

| Field | Rule |
|---|---|
| `title` | required, ≤ 120 |
| `subtitle` | ≤ 200, default `""` |
| `time` | `hour` 0–23, `minute` 0–59 |
| `flexMinutes` | 0–120, **optional** (web, iOS, Flutter use it) |
| `category` | `medication` `break` `study` `move` `other`, **optional** |
| `icon` | ≤ 40, **optional** (Expo's icon name) |
| `location` | `{lat, lng, radius}`, **optional** (Expo's place trigger) |

An optional field with no value is **left out** (never `null`). A client
that doesn't use a field must still keep it and send it back unchanged: see
§8, "Fields you don't use".

### Task (minimum viable day)

```json
{
  "id": "mvd-2",
  "title": "Take meds",
  "subtitle": "Morning dosage",
  "createdAt": "1970-01-01T00:00:00.000Z",
  "updatedAt": "1970-01-01T00:00:00.000Z",
  "deletedAt": null,
  "doneOn": null,
  "tickAt": null
}
```

`title` required ≤ 120; `subtitle` ≤ 120, default `""`.

### To-do

```json
{
  "id": "td-m3xa-4",
  "title": "Email the lab about the SPAD array",
  "done": false,
  "createdAt": "2026-11-19T10:00:00.000Z",
  "updatedAt": "2026-11-19T10:00:00.000Z",
  "deletedAt": null
}
```

`title` required ≤ 200. `done` is part of the definition (it does not reset
each day).

### Brain-dump item

```json
{ "id": "d-m3xb-2", "text": "…", "at": "2026-11-19T10:05:00.000Z", "deletedAt": null }
```

`text` required ≤ 2000, never edited after it is written. `at` is when it was
written.

### Check-in

```json
{ "at": "2026-11-19T10:05:00.000Z", "state": "yellow", "level": 0.52 }
```

`state` is `green`, `yellow` or `red`. `level` is 0–1 or `null`. A check-in
has no id: **`at` is its identity**.

## 5. Merge rules (server)

For `anchors`, `tasks`, `todos`: items are matched by `id` within a section.
Each item has up to three independent parts.

1. **Definition** (every field except the tick and `deletedAt`). The item
   with the later `updatedAt` wins **all** of it; fields are never mixed.
   - A tie with different content is settled by comparing the canonical JSON
     of the two definitions as strings; the greater one wins. Any rule works
     as long as it always picks the same side.
   - `createdAt` is the earlier of the two.
   - Two devices editing different fields of the same item while both are
     offline: the later edit wins as a whole. That is the intended trade for
     a simple protocol.
2. **Tick** (`doneOn` + `tickAt`, anchors and tasks only). The later `tickAt`
   wins; `null` loses to any tick; a tie goes to the greater `doneOn` string
   (`null` is smallest). Un-ticking is a tick with `doneOn: null`. Ticks and
   definitions never overwrite each other.
3. **Deletion.** `deletedAt` is the later of the two (`null` loses). The item
   is deleted when `deletedAt >= updatedAt`. Undo is therefore just an edit:
   send the item again with `updatedAt` = now. When `deletedAt < updatedAt`
   the server stores and returns `deletedAt: null`.

**A tombstone carries no content.** A deleted item is stored and returned as
`{id, createdAt, updatedAt, deletedAt}` only: title, text, the tick and the
rest are removed from the server at once, and a stale device that still has
the item can't put the content back. One consequence: a tick made on another
device around a delete-then-Undo can be lost (the person ticks again). The
merge is exact everywhere else.

`dump`: matched by `id`. The first copy wins its `text` and `at`: the one
with the earlier `at`, ties to the greater canonical JSON (in practice one id
always has one text). `deletedAt` is the later of the two. A tombstone is
`{id, deletedAt}`. There is no restore: Undo adds the text again under a
**new id**.

`checkins`: the union by `at` (the same `at` twice: the greater canonical
JSON wins). Then the rule the clients already apply locally: sorted by time,
**a check-in followed by another less than 60 seconds later is dropped** (the
later one refines it).

Order in responses: live anchors by time of day, then `id`, then anchor
tombstones by `id`; tasks and to-dos by `createdAt`, then `id`; the live dump
newest first, then dump tombstones newest `deletedAt` first; check-ins oldest
first.

For anchors, tasks, to-dos and the dump the merge is commutative,
associative and idempotent: the result never depends on which device synced
first, and sending the same body twice changes nothing (within the caps of
§6, which are set so that a person never reaches them in practice). Check-ins
are idempotent too, but the server applies the 60-second rule as check-ins
arrive, against what is already stored. So inside a run of check-ins that
are each less than a minute apart (quick changes on two devices), two
arrival orders can keep different entries of that run; nothing outside such
a run is affected. That is harmless.

## 6. Limits and bad input (server)

- Bad items are dropped, never an error: wrong shape, bad `id`, empty title,
  unparseable time. A bad **optional** field is left out instead (the item
  stays); `flexMinutes` and `level` are clamped to their range; a to-do's
  `done` counts only when it is exactly `true`. A section that is not an
  array counts as not sent. A `gen` that is not a positive integer counts as
  none.
- Unknown fields are dropped. Objects are rebuilt field by field (nothing
  from the request is stored as-is).
- **Clocks.** Any timestamp later than the server's clock plus 60 seconds is
  set to the server's clock. One phone with a wrong clock can't win forever.
- Per request: at most 5000 items per section (a full section and all its
  tombstones fit) and 2000 check-ins; the rest are ignored.
- Stored per user: 200 live anchors, 100 live tasks, 1000 live to-dos, 1000
  live dump items (over a cap the oldest go first: by `createdAt`, the dump by
  `at`), and 3000 tombstones per section (the oldest `deletedAt` go first).
  Check-ins: the newest 5000. An item over a cap is simply missing from the
  answer. The tombstone cap is far above the live caps on purpose: a
  tombstone is what stops a deleted item from coming back from a device that
  still has it, so clearing a full list must not push out the tombstones of
  what was deleted just before.
- Stored stamps are not clamped again when they are read back (the clock rule
  above applies to what arrives, once), so a server clock that steps back
  can't turn a deletion into a live item.
- The request body may be at most 10 MB on this route (5 MB elsewhere):
  enough for a day at every cap, even in a script that takes three bytes a
  character. It is read only after the session check.
- One person's syncs are handled one at a time on a server process; past 32
  waiting, the newest gets `503` with `Retry-After`, like a lost race. A sync
  stuck on the database gives up its turn after 30 seconds.
- Nothing from a sync body is ever logged.

## 7. `gen`: erasing everywhere

The server keeps a generation number per user, starting at 1.
`DELETE /api/me/day` empties the day and adds 1.

- A client stores the `gen` from every response and sends it back.
- A client that has never synced sends no `gen` (or 0). Its data is merged
  as usual. That is a new device or sync just switched on.
- If the request's `gen` is **lower** than the server's, the day was erased
  somewhere else since this device last synced. The server merges nothing
  and answers with its current state and `"erased": true`. The client
  replaces its local day with the answer, as always. That is what "erase
  everywhere" means.

## 8. What every client does

**Local model.** Keep, per item: `createdAt`, `updatedAt`, `deletedAt`, and
for anchors and tasks `doneOn` + `tickAt`. Derive "done" from
`doneOn === today`. Deleting = set `deletedAt` to now and hide the item.
Undo = clear `deletedAt` and set `updatedAt` to now. Every edit to the
definition sets `updatedAt` to now. Every tick or un-tick sets `tickAt` to
now. Keep up to 3000 tombstones per section on the device, like the server
(the oldest `deletedAt` go first): a device that keeps fewer than it can
delete between two syncs brings the rest back on its next sync.

**Old saves.** Items saved before sync have no stamps. On first load:

- a starter item that was never edited (same `id` and title as the starter)
  gets `createdAt` and `updatedAt` = `1970-01-01T00:00:00.000Z`;
- anything else gets `createdAt` and `updatedAt` = now. Tasks and to-dos are
  ordered by `createdAt`, so keep the order the person sees: give each next
  item a `createdAt` one millisecond later than the one before it;
- an item ticked today gets `doneOn` = today and `tickAt` = now;
- **a starter missing from the old save** was deleted by the person before
  tombstones existed: send it as a tombstone, or another device's 1970
  starter brings it back. Stamps: `createdAt` and `updatedAt`
  `1970-01-01T00:00:00.000Z`, `deletedAt` `1970-01-01T00:00:00.001Z` (not
  now). One millisecond after the starter beats every untouched copy of it,
  but never a real edit: the deletion happened at some unknown time, an edit
  made on another device has a real one, so the edit wins whichever device
  migrated first. Only for a save from before sync, and only when the save
  has that list.

New installs seed their starters with the 1970 stamps. Starter ids are the
same in every client (`mvd-1` … `mvd-3`), so they merge into one copy.

**Fields you don't use.** Keep every field of an item the server sent,
including ones this client has no use for (an Expo `icon` in the web app, a
field added next year), and send them back unchanged when the item is edited.
In JavaScript that is `{...item, title}`; in Dart or Swift keep the unknown
keys in a map next to the typed fields. Otherwise an edit here would erase
another client's field.

**Whose day it is.** The local day remembers the account it last synced
with. A day that has never synced (made while signed out) joins the first
account that signs in. A day last synced as account A is cleared (with its
stored `gen`) before anything is synced as account B, so one person's
check-ins never reach another person's account.

**When to sync.** Only while signed in and with "Keep my day in sync" on
(Settings, on by default):

- when the app starts, comes to the foreground, or the tab becomes visible;
- 2–3 seconds after the last local change (debounced);
- when the connection comes back;
- every 5 minutes while the app is in front.

Turning the switch on again counts as a first sync: forget the stored `gen`
and send none. A device that was switched off while the day was erased
elsewhere then adds its day back instead of losing it (§7).

**Sending.** All local items of the sections the client knows, tombstones
included, and the stored `gen`.

**Receiving.** If anything changed locally while the request was in flight,
throw the answer away and sync again. Otherwise replace the local sections
with the answer. Sections the client doesn't know are ignored. One
exception protects the device's data: **an anchor, task, to-do or dump item
that the answer doesn't mention at all** (neither live nor as a tombstone)
**stays on the device**. The server refused it or is over a limit; it is
simply sent again next time. When the answer says `"erased": true` there is
no exception: the answer replaces everything.

**Check-ins are always replaced** by the answer's list (no exception). The
server stores a check-in from the future (a phone with a wrong clock) at
server time, so the device's copy never appears in the answer under its own
`at`; keeping it would add a new server copy on every sync. A check-in made
while the request was in flight is covered by "sync again" above. Then:

- if the newest check-in in the answer is newer than the newest one the
  device had, Home's current state and level follow it;
- if the answer says `"erased": true`, Home's current state and level are
  cleared too (the erased day has no check-ins to follow);
- keep the newest 200 check-ins, as before.

**Text limits.** Keep text within the server's limits on the device (task
title and subtitle 120, to-do title 200, anchor title 120 and subtitle 200,
dump line 2000), so a cut never happens silently on the first sync. Moving a
brain-dump line into the minimum day must not lose its end: if the line is
longer than a task title allows, keep the dump line.

**Failures.** Offline or a 5xx: keep working locally; retry after 5 seconds,
then 30 seconds, then every 5 minutes. `401`: the session ended, so stop
day sync — but only when the 401 answers the session that is current now (a
late 401 for an old token must not stop a new session), and without signing
the person out from a background sync: the next ordinary request does that.
The status line then says that signing in again resumes sync.
`404`: this server has no day sync, so stop until the next start. Any other
`4xx` (for example `413`, a day too big for one request): sending the same
again can't help, so stop until the next start as well, and the status line
says that sync stopped. `408` and `429` count as a `5xx`. Never
interrupt the person: the only place a sync problem is shown is the status
line under the Settings switch.

**Signing out.** A client that already clears the day on sign-out (the web
app) keeps doing so; the next sign-in brings it back from the server. A
client that keeps working signed out (Expo, Flutter) keeps the day on the
device and follows "Whose day it is" above.

**Undo.** Anchors, tasks and to-dos: send the item again with `updatedAt` =
now. Brain dump: add the text again under a new id. Once a deletion has
synced, the server's copy has no content, so the device must keep the item's
content itself (in its undo state) for as long as Undo is offered.

## 9. Privacy

Check-ins and the brain dump are personal. With sync on they are stored on
the user's NeuroPal server, like notes and Pal's chat, readable only with
that account's session. They are not sent to an AI provider by sync. An
anchor with a place trigger (Expo) carries that place's coordinates, so
those are stored on the server too. The Settings switch turns sync off for
one device; the data then stays on that device.

## 9a. Server notes

- Check-in rows carry the generation they were written under, so a sync that
  was in flight during an erase can't bring old check-ins back.
- Nothing of a sync body reaches a log line or an error message; a malformed
  body gets a fixed `400` message that never quotes it.
- If an account is ever deleted, its `DayState` document and `DayCheckin`
  rows go with it (there is no account deletion yet).

## 10. Not in v1

- A button for "erase my day everywhere" (the protocol is ready, §7).
- Deltas (`since`): every sync sends the whole sections. Sizes are small.
- The native iOS app (lowest priority for now).
- Trends over the check-in history (the server keeps 5000 for that).
