// Today, on this phone: Home's check-ins, the timed anchors, the minimum
// viable day and Pal's brain dump. The same rules as the web app's day.ts
// and the Expo app's homeSlice:
//   * check-ins: oldest first, the newest 200 kept; a check-in within a
//     minute of the last one refines it (one check-in = one settled
//     feeling, not every step of the slider); an older one joins the
//     history in time order and leaves the current state alone;
//   * the starter minimum day is mvd-1…3, with the same words everywhere;
//   * the brain dump: newest first, a line is never edited, a deletion is
//     final (Undo writes the text again under a new id).
// Built for day sync (docs/DAY-SYNC.md §8): every item carries its stamps,
// "done" is `doneOn == today` (no rollover job), a deletion leaves a
// tombstone without content (the newest 3000 per section are kept), and
// Undo is an edit. The day also remembers the account it last synced with
// ("whose day it is", lib/day/day_sync.dart).
//
// Saved with shared_preferences after every change, so nothing is lost when
// Android stops the app. Nothing here needs the network.

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'day_models.dart';
import 'day_rules.dart' as rules;

class DayStore extends ChangeNotifier {
  DayStore({required this.prefs, DateTime Function()? clock})
    : _clock = clock ?? DateTime.now {
    _load();
  }

  static const storageKey = 'np.day';

  /// Where Pal kept the brain dump before it joined the day: read once by
  /// the migration, and removed once the day holding its lines is saved.
  static const legacyDumpKey = 'np.pal.dump';

  /// The save's shape: 1 = before sync (no stamps); 2 = day sync (stamps,
  /// tombstones, owner, gen); 3 = the brain dump is part of the day.
  static const _version = 3;

  final SharedPreferences prefs;
  final DateTime Function() _clock;

  NervousState? _state;
  double? _level;
  List<Checkin> _checkins = const [];

  /// All anchors, tasks and dump lines, tombstones included (they are
  /// synced too).
  List<DayAnchor> _anchors = const [];
  List<DayTask> _tasks = const [];
  List<DumpItem> _dump = const [];

  String? _owner;
  int? _gen;
  String? _syncedAt;
  int _localRevision = 0;

  // ---- reading -------------------------------------------------------------

  DateTime now() => _clock();

  /// Today's local date, `YYYY-MM-DD`.
  String get today => stampOf(now());

  /// The current check-in (null = not checked in yet).
  NervousState? get state => _state;
  double? get level => _level;

  /// The history, oldest first.
  List<Checkin> get checkins => List.unmodifiable(_checkins);
  Checkin? get lastCheckin => _checkins.isEmpty ? null : _checkins.last;

  /// Live anchors, by time of day.
  List<DayAnchor> get anchors => [
    for (final a in _anchors)
      if (!a.isDeleted) a,
  ];

  /// Live tasks, in the order they were made.
  List<DayTask> get tasks => [
    for (final t in _tasks)
      if (!t.isDeleted) t,
  ];

  /// Live brain-dump lines, newest first.
  List<DumpItem> get dump => [
    for (final d in _dump)
      if (!d.isDeleted) d,
  ];

  bool isAnchorDone(DayAnchor a) => a.doneOn == today;
  bool isTaskDone(DayTask t) => t.doneOn == today;

  int get remainingTasks => tasks.where((t) => !isTaskDone(t)).length;

  /// Home's "Next anchor" right now.
  DayAnchor? get nextAnchor => rules.nextAnchor(anchors, now(), today);

  DayAnchor? anchorById(String id) {
    for (final a in _anchors) {
      if (a.id == id && !a.isDeleted) return a;
    }
    return null;
  }

  /// Bumped by every change made on this phone (never by a sync answer):
  /// day sync uses it to debounce, and to notice a change made while a
  /// request was in flight.
  int get localRevision => _localRevision;

  // ---- check-ins -----------------------------------------------------------

  /// One check-in (the slider or a state button). [at] defaults to now and
  /// is never in the future.
  void recordCheckin(NervousState mood, double? level, {DateTime? at}) {
    final nowMs = now().millisecondsSinceEpoch;
    final given = at?.millisecondsSinceEpoch;
    final t = given != null && given <= nowMs ? given : nowMs;
    final entry = Checkin(
      at: isoMs(DateTime.fromMillisecondsSinceEpoch(t, isUtc: true)),
      state: mood,
      level: cleanLevel(level),
    );
    final list = List.of(_checkins);
    final last = list.isEmpty ? null : list.last;
    if (last != null && t < last.atMs) {
      // Older than the newest one (made elsewhere, heard about later): it
      // joins the history in time order; the newer state stays.
      list.removeWhere((c) => c.atMs == t);
      var i = list.length;
      while (i > 0 && list[i - 1].atMs > t) {
        i -= 1;
      }
      list.insert(i, entry);
    } else {
      _state = mood;
      _level = entry.level;
      if (last != null && t - last.atMs < kCheckinMergeMs) {
        list[list.length - 1] = entry;
      } else {
        list.add(entry);
      }
    }
    _checkins = _capped(list);
    _changed();
  }

  // ---- minimum viable day ---------------------------------------------------

  void toggleTask(String id) {
    final t = _task(id);
    if (t != null) setTaskDone(id, !isTaskDone(t));
  }

  /// Ticks or un-ticks for today. Un-ticking is a tick with `doneOn: null`.
  /// (Every stamp made here is [later] than the one it replaces, so it wins
  /// over the version this phone saw, whatever another device's clock said.)
  void setTaskDone(String id, bool done) {
    final i = _tasks.indexWhere((t) => t.id == id && !t.isDeleted);
    if (i < 0) return;
    final t = _tasks[i];
    final stamp = later(now(), [t.tickAt]);
    final day = today;
    _tasks = List.of(_tasks)
      ..[i] = t.copyWith(doneOn: () => done ? day : null, tickAt: () => stamp);
    _changed();
  }

  /// Adds a task at the end. False when the title is empty.
  bool addTask(String title, {String subtitle = ''}) {
    final t = cleanText(title, kTitleMax);
    if (t.isEmpty) return false;
    final at = now();
    // Tasks are ordered by createdAt: a new one goes last even when this
    // phone's clock is behind the one another task was made on.
    var created = at.millisecondsSinceEpoch;
    for (final x in _tasks) {
      final ms = parseIsoMs(x.createdAt) ?? 0;
      if (ms >= created) created = ms + 1;
    }
    final stamp = isoMs(DateTime.fromMillisecondsSinceEpoch(created, isUtc: true));
    _tasks = _sortedTasks([
      ..._tasks,
      DayTask(
        id: freshId('t', at),
        title: t,
        subtitle: cleanText(subtitle, kTaskSubtitleMax),
        createdAt: stamp,
        updatedAt: stamp,
      ),
    ]);
    _changed();
    return true;
  }

  /// Deletes a task: a tombstone stays (for sync), the content goes. Returns
  /// the task as it was, for Undo.
  DayTask? removeTask(String id) {
    final i = _tasks.indexWhere((t) => t.id == id && !t.isDeleted);
    if (i < 0) return null;
    final gone = _tasks[i];
    _tasks = _sortedTasks(
      List.of(_tasks)..[i] = gone.tombstone(later(now(), [gone.updatedAt])),
    );
    _changed();
    return gone;
  }

  /// Undo of [removeTask]: the task comes back as an edit made now, so it
  /// wins over its own deletion on every device (§5).
  void restoreTask(DayTask task) {
    final tomb = _tasks.where((t) => t.id == task.id).firstOrNull;
    final back = task.copyWith(
      updatedAt: later(now(), [task.updatedAt, tomb?.updatedAt, tomb?.deletedAt]),
      deletedAt: () => null,
    );
    _tasks = _sortedTasks([
      for (final t in _tasks)
        if (t.id != task.id) t,
      back,
    ]);
    _changed();
  }

  // ---- anchors -------------------------------------------------------------

  /// Adds an anchor. Returns its id, or null when the title is empty.
  String? addAnchor(AnchorInput input) {
    final title = cleanText(input.title, kTitleMax);
    if (title.isEmpty) return null;
    final at = now();
    final stamp = isoMs(at);
    final anchor = DayAnchor(
      id: freshId('a', at),
      title: title,
      subtitle: cleanText(input.subtitle, kAnchorSubtitleMax),
      hour: input.hour.clamp(0, 23),
      minute: input.minute.clamp(0, 59),
      flexMinutes: input.flexMinutes.clamp(0, kFlexMax),
      category: input.category,
      createdAt: stamp,
      updatedAt: stamp,
    );
    _anchors = _sortedAnchors([..._anchors, anchor]);
    _changed();
    return anchor.id;
  }

  /// Changes an anchor's definition (its tick stays as it is). Fields this
  /// app doesn't use (Expo's icon, location) are kept unchanged.
  bool updateAnchor(String id, AnchorInput input) {
    final title = cleanText(input.title, kTitleMax);
    final i = _anchors.indexWhere((a) => a.id == id && !a.isDeleted);
    if (title.isEmpty || i < 0) return false;
    final a = _anchors[i];
    final updated = a.copyWith(
      title: title,
      subtitle: cleanText(input.subtitle, kAnchorSubtitleMax),
      hour: input.hour.clamp(0, 23),
      minute: input.minute.clamp(0, 59),
      flexMinutes: input.flexMinutes.clamp(0, kFlexMax),
      category: input.category,
      updatedAt: later(now(), [a.updatedAt]),
    );
    _anchors = _sortedAnchors(List.of(_anchors)..[i] = updated);
    _changed();
    return true;
  }

  /// Deletes an anchor (tombstone, no content). Returns it, for Undo.
  DayAnchor? removeAnchor(String id) {
    final i = _anchors.indexWhere((a) => a.id == id && !a.isDeleted);
    if (i < 0) return null;
    final gone = _anchors[i];
    _anchors = _sortedAnchors(
      List.of(_anchors)..[i] = gone.tombstone(later(now(), [gone.updatedAt])),
    );
    _changed();
    return gone;
  }

  /// Undo of [removeAnchor]: an edit made now, after its own deletion.
  void restoreAnchor(DayAnchor anchor) {
    final tomb = _anchors.where((a) => a.id == anchor.id).firstOrNull;
    final back = anchor.copyWith(
      updatedAt: later(now(), [anchor.updatedAt, tomb?.updatedAt, tomb?.deletedAt]),
      deletedAt: () => null,
    );
    _anchors = _sortedAnchors([
      for (final a in _anchors)
        if (a.id != anchor.id) a,
      back,
    ]);
    _changed();
  }

  /// Done (or not) for today.
  void setAnchorDone(String id, bool done) {
    final i = _anchors.indexWhere((a) => a.id == id && !a.isDeleted);
    if (i < 0) return;
    final a = _anchors[i];
    final stamp = later(now(), [a.tickAt]);
    final day = today;
    _anchors = List.of(_anchors)
      ..[i] = a.copyWith(doneOn: () => done ? day : null, tickAt: () => stamp);
    _changed();
  }

  // ---- the brain dump ------------------------------------------------------

  /// Adds a line at the top, cut to 2000 characters as the server keeps
  /// it. False when it is empty.
  bool addDump(String text) {
    final t = cleanText(text, kDumpTextMax);
    if (t.isEmpty) return false;
    final at = now();
    _dump = _sortedDump([
      DumpItem(id: freshId('d', at), text: t, at: isoMs(at)),
      ..._dump,
    ]);
    _changed();
    return true;
  }

  /// Deletes a line: its text goes at once, a tombstone `{id, deletedAt}`
  /// stays (for sync). Returns the line as it was, for Undo — which adds
  /// the text again under a new id ([addDump]): a dump deletion is final
  /// (DAY-SYNC §5), so the text must come from the caller's undo state.
  DumpItem? removeDump(String id) {
    final i = _dump.indexWhere((d) => d.id == id && !d.isDeleted);
    if (i < 0) return null;
    final gone = _dump[i];
    _dump = _sortedDump(List.of(_dump)..[i] = gone.tombstone(isoMs(now())));
    _changed();
    return gone;
  }

  // ---- day sync ----------------------------------------------------------------

  /// The account this day was last synced as (an opaque key), or null when
  /// it has never synced.
  String? get owner => _owner;

  /// The server's generation from the last answer (DAY-SYNC §7).
  int? get gen => _gen;

  /// When the last sync answer was applied.
  DateTime? get syncedAt {
    final ms = parseIsoMs(_syncedAt);
    return ms == null ? null : DateTime.fromMillisecondsSinceEpoch(ms);
  }

  /// A day that has never synced joins the first account that syncs.
  void claim(String account) {
    if (_owner == account) return;
    _owner = account;
    _save();
  }

  /// Another account: this day is cleared first (with its `gen`), so one
  /// person's check-ins never reach another person's account.
  void resetFor(String account) {
    _state = null;
    _level = null;
    _checkins = const [];
    _anchors = const [];
    _tasks = starterTasks();
    _dump = const [];
    _gen = null;
    _syncedAt = null;
    _owner = account;
    _save();
    notifyListeners();
  }

  /// Sync switched on again: the next sync counts as a first one (§8).
  void forgetGen() {
    if (_gen == null) return;
    _gen = null;
    _save();
  }

  /// What a sync sends: every item of the sections this app knows,
  /// tombstones included, and the stored `gen`.
  Map<String, Object?> syncBody() => {
    'v': 1,
    'gen': ?_gen,
    'anchors': [for (final a in _anchors) a.toJson()],
    'tasks': [for (final t in _tasks) t.toJson()],
    'dump': [for (final d in _dump) d.toJson()],
    'checkins': [for (final c in _checkins) c.toJson()],
  };

  /// Applies a sync answer (DAY-SYNC §8 "Receiving"): the answer replaces the
  /// local sections. For anchors, tasks and the dump, a local item the
  /// answer doesn't mention at all stays (the server refused it or is over
  /// a limit; it goes again next time) — unless the answer says the day was
  /// erased. The answer's check-ins replace the local list outright: the
  /// server may have moved one (a phone clock ahead is set to server time),
  /// so a local copy it doesn't mention is already there under another
  /// time, and keeping it would send it again on every sync. Sections
  /// missing from the answer are left alone. Returns true when Home's
  /// current state followed a newer check-in from another device.
  bool applyServer(Map<String, Object?> answer) {
    final erased = answer['erased'] == true;
    final gen = answer['gen'];
    if (gen is num && gen.isFinite) _gen = gen.toInt();

    final anchorsIn = answer['anchors'];
    if (anchorsIn is List) {
      final server = _firstById([
        for (final j in anchorsIn) ?DayAnchor.fromJson(j),
      ], (a) => a.id);
      final mentioned = {for (final a in server) a.id};
      _anchors = _sortedAnchors([
        ...server,
        if (!erased)
          for (final a in _anchors)
            if (!mentioned.contains(a.id)) a,
      ]);
    }

    final tasksIn = answer['tasks'];
    if (tasksIn is List) {
      final server = _firstById([
        for (final j in tasksIn) ?DayTask.fromJson(j),
      ], (t) => t.id);
      final mentioned = {for (final t in server) t.id};
      _tasks = _sortedTasks([
        ...server,
        if (!erased)
          for (final t in _tasks)
            if (!mentioned.contains(t.id)) t,
      ]);
    }

    final dumpIn = answer['dump'];
    if (dumpIn is List) {
      final server = _firstById([
        for (final j in dumpIn) ?DumpItem.fromJson(j),
      ], (d) => d.id);
      final mentioned = {for (final d in server) d.id};
      _dump = _sortedDump([
        ...server,
        if (!erased)
          for (final d in _dump)
            if (!mentioned.contains(d.id)) d,
      ]);
    }

    var followed = false;
    // Erased everywhere: the answer replaces the history even without a
    // list of its own (the erased day has none).
    final checkinsIn = answer['checkins'] ?? (erased ? const <Object?>[] : null);
    if (checkinsIn is List) {
      final hadNewest = _checkins.isEmpty ? null : _checkins.last.atMs;
      final server = [
        for (final j in checkinsIn) ?Checkin.fromJson(j),
      ]..sort((a, b) => a.atMs.compareTo(b.atMs));
      // (A check-in made here while the request was out never gets this
      // far: that answer is thrown away and the day is sent again.)
      _checkins = _capped(server);
      final newest = server.isEmpty ? null : server.last;
      if (newest != null && (hadNewest == null || newest.atMs > hadNewest)) {
        // A newer check-in from another device: Home follows it.
        _state = newest.state;
        _level = newest.level;
        followed = true;
      } else if (erased) {
        // The erased day has no check-in of this phone's to follow: Home's
        // current state and level go too (§8).
        _state = null;
        _level = null;
      }
    }

    _syncedAt = isoMs(now());
    _save();
    notifyListeners();
    return followed;
  }

  // ---- internals ---------------------------------------------------------------

  DayTask? _task(String id) {
    for (final t in _tasks) {
      if (t.id == id && !t.isDeleted) return t;
    }
    return null;
  }

  void _changed() {
    _localRevision += 1;
    _save();
    notifyListeners();
  }

  static List<Checkin> _capped(List<Checkin> list) =>
      list.length > kCheckinCap ? list.sublist(list.length - kCheckinCap) : list;

  /// One item per id, the first one (a well-behaved server never repeats
  /// one; a repeated id must not become two items here).
  static List<T> _firstById<T>(Iterable<T> items, String Function(T) id) {
    final seen = <String>{};
    return [
      for (final x in items)
        if (seen.add(id(x))) x,
    ];
  }

  /// The newest [kTombstoneCap] tombstones of a section stay (§8 "Local
  /// model"); the oldest `deletedAt` go first, as on the server. Live
  /// items all stay, in their order.
  static List<T> _capGone<T>(
    List<T> list,
    String? Function(T) deletedAt,
    String Function(T) id,
  ) {
    var gone = 0;
    for (final x in list) {
      if (deletedAt(x) != null) gone += 1;
    }
    if (gone <= kTombstoneCap) return list;
    final newest = [
      for (final x in list)
        if (deletedAt(x) != null) x,
    ]..sort((a, b) => _newerFirst(deletedAt(a), deletedAt(b), id(a), id(b)));
    final keep = {for (final x in newest.take(kTombstoneCap)) id(x)};
    return [
      for (final x in list)
        if (deletedAt(x) == null || keep.contains(id(x))) x,
    ];
  }

  /// Newest time first; the same time by the greater id first (the
  /// server's tie rule for its caps).
  static int _newerFirst(String? a, String? b, String idA, String idB) {
    final byTime = (parseIsoMs(b) ?? 0).compareTo(parseIsoMs(a) ?? 0);
    return byTime != 0 ? byTime : idB.compareTo(idA);
  }

  static List<DayAnchor> _sortedAnchors(List<DayAnchor> list) {
    // The server's order: by time of day, then id (tombstones last).
    final out = List.of(list)
      ..sort((a, b) {
        if (a.isDeleted != b.isDeleted) return a.isDeleted ? 1 : -1;
        final byTime = a.isDeleted ? 0 : a.minutesOfDay - b.minutesOfDay;
        return byTime != 0 ? byTime : a.id.compareTo(b.id);
      });
    return _capGone(out, (a) => a.deletedAt, (a) => a.id);
  }

  static List<DayTask> _sortedTasks(List<DayTask> list) {
    final out = List.of(list)
      ..sort((a, b) {
        final byTime = (parseIsoMs(a.createdAt) ?? 0).compareTo(
          parseIsoMs(b.createdAt) ?? 0,
        );
        return byTime != 0 ? byTime : a.id.compareTo(b.id);
      });
    return _capGone(out, (t) => t.deletedAt, (t) => t.id);
  }

  static List<DumpItem> _sortedDump(List<DumpItem> list) {
    // The server's order: live lines newest first, then the tombstones,
    // newest deletion first; the same time by id. The newest 1000 lines
    // and 3000 tombstones are kept, as on the server.
    int byTime(String? a, String? b, String idA, String idB) {
      final t = (parseIsoMs(b) ?? 0).compareTo(parseIsoMs(a) ?? 0);
      return t != 0 ? t : idA.compareTo(idB);
    }

    final live = [
      for (final d in list)
        if (!d.isDeleted) d,
    ]..sort((a, b) => byTime(a.at, b.at, a.id, b.id));
    final gone = [
      for (final d in list)
        if (d.isDeleted) d,
    ]..sort((a, b) => byTime(a.deletedAt, b.deletedAt, a.id, b.id));
    return [...live.take(kDumpKeep), ...gone.take(kTombstoneCap)];
  }

  Map<String, Object?> _toStorage() => {
    'v': _version,
    'state': _state?.id,
    'level': _level,
    'checkins': [for (final c in _checkins) c.toJson()],
    'anchors': [for (final a in _anchors) a.toJson()],
    'tasks': [for (final t in _tasks) t.toJson()],
    'dump': [for (final d in _dump) d.toJson()],
    'owner': _owner,
    'gen': _gen,
    'syncedAt': _syncedAt,
  };

  /// True once written: shared_preferences updates its cache at once and
  /// writes in the background; a failed write is retried by the next
  /// change. (Only the kind of error is logged, never the day.)
  Future<bool> _save() => prefs
      .setString(storageKey, jsonEncode(_toStorage()))
      .catchError((Object e) {
        debugPrint('The day could not be saved: ${e.runtimeType}');
        return false;
      });

  void _load() {
    Object? saved;
    final raw = prefs.getString(storageKey);
    if (raw != null) {
      try {
        saved = jsonDecode(raw);
      } on FormatException {
        // A broken save starts a fresh day rather than crash the app.
        saved = null;
      }
    }
    _restore(saved is Map ? saved.cast<String, Object?>() : null);
  }

  void _restore(Map<String, Object?>? src) {
    final o = src ?? const <String, Object?>{};
    // A save without a version is the oldest shape there is.
    final v = o['v'];
    final version = v is num ? v.toInt() : 1;
    final checkins = [
      for (final j in o['checkins'] is List ? o['checkins'] as List : const [])
        ?Checkin.fromJson(j),
    ]..sort((a, b) => a.atMs.compareTo(b.atMs));
    _checkins = _capped(checkins);
    _state = NervousState.parse(o['state']);
    _level = _state == null ? null : cleanLevel(o['level']);

    final migrate = _Migration(now: now(), today: today, dayStamp: o['dayStamp']);
    final rawTasks = o['tasks'];
    _tasks = rawTasks is List
        ? _sortedTasks([
            for (final j in migrate.tasks(rawTasks)) ?DayTask.fromJson(j),
            // Only a save from before sync, and only one with the list (a
            // new install has neither).
            if (version < 2) ...migrate.goneStarters(rawTasks),
          ])
        : starterTasks();
    final rawAnchors = o['anchors'];
    _anchors = rawAnchors is List
        ? _sortedAnchors([
            for (final j in migrate.anchors(rawAnchors)) ?DayAnchor.fromJson(j),
          ])
        : const [];
    final rawDump = o['dump'];
    _dump = rawDump is List
        ? _sortedDump(
            _firstById([for (final j in rawDump) ?DumpItem.fromJson(j)], (d) => d.id),
          )
        : const [];

    final owner = o['owner'];
    _owner = owner is String && owner.isNotEmpty ? owner : null;
    final gen = o['gen'];
    _gen = gen is num && gen.isFinite ? gen.toInt() : null;
    _syncedAt = canonicalIso(o['syncedAt']);

    // Pal's old dump joins the day once: a day saved since already has it
    // (then only the old copy's removal didn't happen).
    final legacy = prefs.get(legacyDumpKey);
    final moving = legacy != null;
    if (moving && (src == null || version < 3)) {
      final lines = _legacyDumpLines(legacy);
      if (lines.isNotEmpty) _dump = _sortedDump([..._dump, ...lines]);
    }

    if (migrate.changed || moving) {
      final saved = _save();
      // The old copy goes only once the day holding its lines is written:
      // if that fails, the next start migrates it again.
      if (moving) {
        unawaited(
          saved.then((ok) async {
            if (!ok) return;
            try {
              await prefs.remove(legacyDumpKey);
            } on Object catch (e) {
              debugPrint('Pal’s old dump could not be removed: ${e.runtimeType}');
            }
          }),
        );
      }
    }
  }

  /// The live lines of Pal's old dump (`{v, owner, items: [{id, text, at,
  /// deletedAt}]}`, newest first), ready to join the day: a valid id is
  /// kept (else a new one); `at` is the saved time, else now, each next
  /// line a millisecond earlier so the order stays. A deleted line never
  /// left this phone, so its tombstone has nothing to stop and stays
  /// behind. Lines of another account's day don't move (the old Pal
  /// cleared them at the next start, as the day itself was cleared).
  List<DumpItem> _legacyDumpLines(Object raw) {
    Object? saved;
    try {
      saved = raw is String ? jsonDecode(raw) : null;
    } on FormatException {
      saved = null;
    }
    if (saved is! Map) return const [];
    final owner = saved['owner'];
    final from = owner is String && owner.isNotEmpty ? owner : null;
    if (from != null && _owner != null && from != _owner) return const [];
    final items = saved['items'];
    if (items is! List) return const [];
    final base = now();
    final used = {for (final d in _dump) d.id};
    var k = 0;
    final out = <DumpItem>[];
    for (final j in items) {
      if (j is! Map || canonicalIso(j['deletedAt']) != null) continue;
      final text = cleanText(j['text'], kDumpTextMax);
      if (text.isEmpty) continue;
      final rawId = j['id'];
      final id = isValidId(rawId) && !used.contains(rawId)
          ? rawId as String
          : freshId('d', base);
      used.add(id);
      final at = canonicalIso(j['at']) ??
          isoMs(base.subtract(Duration(milliseconds: k++)));
      out.add(DumpItem(id: id, text: text, at: at));
    }
    return out;
  }
}

/// Saves from before sync have no stamps (DAY-SYNC §8 "Old saves"):
///   * a starter that was never edited (same id and title) gets the 1970
///     stamps, so it merges with every other device's starter;
///   * anything else gets now, each next item one millisecond later, which
///     keeps the order the person sees;
///   * an item ticked today gets doneOn = today and tickAt = now;
///   * a starter missing from the save was deleted before tombstones
///     existed: it becomes one ([goneStarters]).
class _Migration {
  _Migration({required this.now, required this.today, required Object? dayStamp})
    : _ticksCount = dayStamp is! String || dayStamp == today;

  final DateTime now;
  final String today;

  /// A pre-sync save's ticks belong to its `dayStamp` (missing = today).
  final bool _ticksCount;
  int _offset = 0;
  bool changed = false;

  String _next() => isoMs(now.add(Duration(milliseconds: _offset++)));

  bool _needs(Map<String, Object?> m) =>
      m['createdAt'] is! String || m['updatedAt'] is! String;

  Iterable<Object?> tasks(List<Object?> list) sync* {
    for (final j in list) {
      if (j is! Map) continue;
      final m = j.cast<String, Object?>();
      if (!_needs(m)) {
        yield m;
        continue;
      }
      changed = true;
      final starter = kStarterTasks
          .where((s) => s.$1 == m['id'] && s.$2 == cleanText(m['title'], kTitleMax))
          .isNotEmpty;
      final stamp = starter ? kEpochIso : _next();
      final ticked = m['done'] == true && _ticksCount;
      yield {
        ...m,
        // Pre-sync ids were always set, but a hand-edited save may lack one.
        'id': isValidId(m['id']) ? m['id'] : freshId('t', now),
        'createdAt': m['createdAt'] is String ? m['createdAt'] : stamp,
        'updatedAt': m['updatedAt'] is String ? m['updatedAt'] : stamp,
        if (ticked) 'doneOn': today,
        if (ticked) 'tickAt': isoMs(now),
      };
    }
  }

  /// The starters a save from before sync doesn't have: the person deleted
  /// them. Sent as deletions, or another device's 1970 starter would bring
  /// them back. Stamped 1970 + 1 ms, not now: that beats every untouched
  /// copy of the starter but never a real edit made on another device,
  /// whichever device migrates first.
  Iterable<DayTask> goneStarters(List<Object?> saved) sync* {
    final have = {
      for (final j in saved)
        if (j is Map) j['id'],
    };
    for (final (id, _, _) in kStarterTasks) {
      if (have.contains(id)) continue;
      changed = true;
      yield DayTask(
        id: id,
        createdAt: kEpochIso,
        updatedAt: kEpochIso,
        deletedAt: kStarterGoneIso,
      );
    }
  }

  Iterable<Object?> anchors(List<Object?> list) sync* {
    for (final j in list) {
      if (j is! Map) continue;
      final m = j.cast<String, Object?>();
      if (!_needs(m)) {
        yield m;
        continue;
      }
      changed = true;
      final stamp = _next();
      final ticked = m['status'] == 'done' && _ticksCount;
      yield {
        ...m,
        'id': isValidId(m['id']) ? m['id'] : freshId('a', now),
        'createdAt': m['createdAt'] is String ? m['createdAt'] : stamp,
        'updatedAt': m['updatedAt'] is String ? m['updatedAt'] : stamp,
        if (ticked) 'doneOn': today,
        if (ticked) 'tickAt': isoMs(now),
      };
    }
  }
}
