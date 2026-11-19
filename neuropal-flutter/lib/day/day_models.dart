// The day's items, shaped for day sync (docs/DAY-SYNC.md §4 and §8).
//
// Every anchor and task carries createdAt / updatedAt / deletedAt, and the
// two that can be ticked carry doneOn + tickAt. "Done" is never stored: it
// is `doneOn == today`, so tomorrow the tick simply stops counting and no
// rollover job is needed. A deleted item keeps only its id and stamps (a
// tombstone), so a deleted title is gone from this phone too.
//
// Fields this app has no use for (an Expo anchor's `icon` and `location`, a
// field added next year) are kept in [extra] and sent back unchanged, so an
// edit here never erases another client's data.

import 'dart:math' as math;

import 'package:flutter/foundation.dart';

// ---- limits (the same as the server's, DAY-SYNC §4/§6) ---------------------

/// Check-ins kept on the device (the newest ones).
const int kCheckinCap = 200;

/// A check-in within a minute of the previous one refines it.
const int kCheckinMergeMs = 60 * 1000;

const int kTitleMax = 120;
const int kAnchorSubtitleMax = 200;
const int kTaskSubtitleMax = 120;

/// The ± window (minutes) an anchor may move in: ADHD-friendly, never to
/// the minute. The same choices as the web app.
const List<int> kFlexChoices = [0, 10, 15, 30, 45, 60];
const int kDefaultFlex = 30;
const int kFlexMax = 120;

/// The stamp a never-edited starter item carries on every client, so the
/// starters of all devices merge into one copy.
const String kEpochIso = '1970-01-01T00:00:00.000Z';

// ---- the three states: never colour alone ---------------------------------

enum StateShape { circle, triangle, square }

enum NervousState {
  green('green', 'Okay', 'I feel okay', StateShape.circle, 0.17),
  yellow('yellow', 'Bit off', 'Feeling a bit off', StateShape.triangle, 0.5),
  red('red', 'Overwhelmed', 'Help, I’m overwhelmed', StateShape.square, 0.83);

  const NervousState(this.id, this.word, this.long, this.shape, this.middle);

  /// The wire value ("green" | "yellow" | "red").
  final String id;

  /// One word for the state ("Okay").
  final String word;

  /// The button wording ("I feel okay").
  final String long;
  final StateShape shape;

  /// Where the slider knob rests for a check-in made with a button.
  final double middle;

  static NervousState? parse(Object? value) {
    for (final s in values) {
      if (s.id == value) return s;
    }
    return null;
  }
}

// ---- anchor kinds ------------------------------------------------------------

enum AnchorCategory {
  medication('medication', 'Meds'),
  rest('break', 'Break'),
  study('study', 'Study'),
  move('move', 'Move'),
  other('other', 'Other');

  const AnchorCategory(this.id, this.label);

  /// The wire value.
  final String id;
  final String label;

  static AnchorCategory? parse(Object? value) {
    for (final c in values) {
      if (c.id == value) return c;
    }
    return null;
  }

  /// The Expo app has no category: its kind is the anchor's icon name.
  static AnchorCategory? fromExpoIcon(Object? icon) => switch (icon) {
    'medication' => AnchorCategory.medication,
    'free-breakfast' => AnchorCategory.rest,
    'school' => AnchorCategory.study,
    'directions-walk' => AnchorCategory.move,
    'flag' => AnchorCategory.other,
    _ => null,
  };
}

// ---- small helpers -------------------------------------------------------------

/// ISO-8601 UTC with milliseconds, the contract's one time format:
/// `2026-11-19T17:20:00.000Z` (Dart would add microseconds otherwise).
String isoMs(DateTime t) => DateTime.fromMillisecondsSinceEpoch(
  t.millisecondsSinceEpoch,
  isUtc: true,
).toIso8601String();

/// Milliseconds since the epoch of an ISO time, or null when unreadable.
int? parseIsoMs(Object? value) {
  if (value is! String || value.isEmpty) return null;
  return DateTime.tryParse(value)?.millisecondsSinceEpoch;
}

/// The same time in the canonical format, or null when unreadable.
String? canonicalIso(Object? value) {
  final ms = parseIsoMs(value);
  return ms == null
      ? null
      : isoMs(DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true));
}

String _pad2(int n) => n.toString().padLeft(2, '0');

/// The local calendar date `YYYY-MM-DD` (what `doneOn` holds).
String stampOf(DateTime t) {
  final d = t.toLocal();
  return '${d.year.toString().padLeft(4, '0')}-${_pad2(d.month)}-${_pad2(d.day)}';
}

final RegExp _stampPattern = RegExp(r'^\d{4}-\d{2}-\d{2}$');
final RegExp _idPattern = RegExp(r'^[A-Za-z0-9._:-]{1,64}$');

String? _cleanStamp(Object? v) =>
    v is String && _stampPattern.hasMatch(v) ? v : null;

bool isValidId(Object? v) => v is String && _idPattern.hasMatch(v);

/// Trimmed, inner whitespace collapsed, cut to [max] (never inside a
/// surrogate pair). The server cleans text the same way.
String cleanText(Object? value, int max) {
  if (value is! String) return '';
  var s = value.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (s.length > max) {
    s = s.substring(0, max);
    final last = s.codeUnitAt(s.length - 1);
    if (last >= 0xD800 && last <= 0xDBFF) s = s.substring(0, s.length - 1);
    s = s.trimRight();
  }
  return s;
}

double? cleanLevel(Object? v) {
  if (v is! num || !v.isFinite) return null;
  return v.toDouble().clamp(0.0, 1.0);
}

int _int(Object? v, int lo, int hi, int fallback) {
  if (v is! num || !v.isFinite) return fallback;
  return v.round().clamp(lo, hi);
}

int _idCounter = 0;
final math.Random _random = math.Random();

/// A new item id (`a-m3x9…`): unique enough across devices, and within
/// the contract's characters.
String freshId(String prefix, DateTime now) {
  _idCounter += 1;
  final rand = List.generate(
    4,
    (_) => _random.nextInt(36).toRadixString(36),
  ).join();
  return '$prefix-${now.millisecondsSinceEpoch.toRadixString(36)}-'
      '${_idCounter.toRadixString(36)}$rand';
}

Map<String, Object?> _extraOf(Map<String, Object?> json, Set<String> known) => {
  for (final MapEntry(:key, :value) in json.entries)
    if (!known.contains(key)) key: value,
};

// ---- check-in -------------------------------------------------------------------

/// One check-in from Home's slider or a state button. It has no id: [at] is
/// its identity.
@immutable
class Checkin {
  Checkin({required this.at, required this.state, this.level})
    : atMs = parseIsoMs(at) ?? 0;

  /// ISO time (canonical format).
  final String at;
  final int atMs;
  final NervousState state;

  /// The exact slider level 0–1, or null (a check-in without one).
  final double? level;

  Map<String, Object?> toJson() => {'at': at, 'state': state.id, 'level': level};

  static Checkin? fromJson(Object? json) {
    if (json is! Map) return null;
    final state = NervousState.parse(json['state']);
    final at = canonicalIso(json['at']);
    if (state == null || at == null) return null;
    return Checkin(at: at, state: state, level: cleanLevel(json['level']));
  }

  @override
  bool operator ==(Object other) =>
      other is Checkin &&
      other.at == at &&
      other.state == state &&
      other.level == level;

  @override
  int get hashCode => Object.hash(at, state, level);
}

// ---- anchor ---------------------------------------------------------------------

/// What the anchors editor hands the store.
@immutable
class AnchorInput {
  const AnchorInput({
    required this.title,
    required this.hour,
    required this.minute,
    this.subtitle = '',
    this.flexMinutes = kDefaultFlex,
    this.category = AnchorCategory.other,
  });

  final String title;
  final String subtitle;
  final int hour;
  final int minute;
  final int flexMinutes;
  final AnchorCategory category;
}

@immutable
class DayAnchor {
  const DayAnchor({
    required this.id,
    required this.createdAt,
    required this.updatedAt,
    this.title = '',
    this.subtitle = '',
    this.hour = 9,
    this.minute = 0,
    this.flexMinutes,
    this.category,
    this.deletedAt,
    this.doneOn,
    this.tickAt,
    this.extra = const {},
  });

  final String id;
  final String title;
  final String subtitle;
  final int hour;
  final int minute;

  /// Null = not set (an anchor from a client without windows).
  final int? flexMinutes;

  /// Null = not set (an Expo anchor; see [kind]).
  final AnchorCategory? category;
  final String createdAt;
  final String updatedAt;
  final String? deletedAt;

  /// The local date it was ticked on; done today = `doneOn == today`.
  final String? doneOn;
  final String? tickAt;

  /// Fields this app doesn't use, sent back unchanged.
  final Map<String, Object?> extra;

  bool get isDeleted => deletedAt != null;
  int get minutesOfDay => hour * 60 + minute;

  /// The window shown and used (the web app's default when unset).
  int get flex => flexMinutes ?? kDefaultFlex;

  /// The kind shown: the category, else the Expo icon's kind, else Other.
  AnchorCategory get kind =>
      category ?? AnchorCategory.fromExpoIcon(extra['icon']) ?? AnchorCategory.other;

  static const _known = {
    'id',
    'title',
    'subtitle',
    'time',
    'flexMinutes',
    'category',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'doneOn',
    'tickAt',
    // Pre-sync saves (the web and Expo apps): read by the migration only.
    'status',
  };

  DayAnchor copyWith({
    String? title,
    String? subtitle,
    int? hour,
    int? minute,
    int? flexMinutes,
    AnchorCategory? category,
    String? createdAt,
    String? updatedAt,
    String? Function()? deletedAt,
    String? Function()? doneOn,
    String? Function()? tickAt,
  }) => DayAnchor(
    id: id,
    title: title ?? this.title,
    subtitle: subtitle ?? this.subtitle,
    hour: hour ?? this.hour,
    minute: minute ?? this.minute,
    flexMinutes: flexMinutes ?? this.flexMinutes,
    category: category ?? this.category,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
    deletedAt: deletedAt == null ? this.deletedAt : deletedAt(),
    doneOn: doneOn == null ? this.doneOn : doneOn(),
    tickAt: tickAt == null ? this.tickAt : tickAt(),
    extra: extra,
  );

  /// The tombstone: no content, only the id and the stamps (DAY-SYNC §5).
  DayAnchor tombstone(String at) =>
      DayAnchor(id: id, createdAt: createdAt, updatedAt: updatedAt, deletedAt: at);

  Map<String, Object?> toJson() {
    if (isDeleted) {
      return {
        'id': id,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        'deletedAt': deletedAt,
      };
    }
    return {
      ...extra,
      'id': id,
      'title': title,
      'subtitle': subtitle,
      'time': {'hour': hour, 'minute': minute},
      // An optional field without a value is left out, never null.
      'flexMinutes': ?flexMinutes,
      'category': ?category?.id,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'deletedAt': null,
      'doneOn': doneOn,
      'tickAt': tickAt,
    };
  }

  /// Reads an anchor from the server or a save. Null when it can't be used
  /// (bad id, no title, no stamps). Stamps of pre-sync saves are filled in
  /// by the store's migration before this is called.
  static DayAnchor? fromJson(Object? json) {
    if (json is! Map) return null;
    final m = json.cast<String, Object?>();
    final id = m['id'];
    if (!isValidId(id)) return null;
    final createdAt = canonicalIso(m['createdAt']);
    final updatedAt = canonicalIso(m['updatedAt']) ?? createdAt;
    if (createdAt == null || updatedAt == null) return null;
    final deletedAt = canonicalIso(m['deletedAt']);
    // Deleted when deletedAt >= updatedAt; otherwise an Undo won (§5).
    if (deletedAt != null &&
        parseIsoMs(deletedAt)! >= parseIsoMs(updatedAt)!) {
      return DayAnchor(
        id: id as String,
        createdAt: createdAt,
        updatedAt: updatedAt,
        deletedAt: deletedAt,
      );
    }
    final title = cleanText(m['title'], kTitleMax);
    if (title.isEmpty) return null;
    final time = m['time'] is Map ? (m['time'] as Map) : const {};
    final flex = m['flexMinutes'];
    return DayAnchor(
      id: id as String,
      title: title,
      subtitle: cleanText(m['subtitle'], kAnchorSubtitleMax),
      hour: _int(time['hour'], 0, 23, 9),
      minute: _int(time['minute'], 0, 59, 0),
      flexMinutes: flex is num && flex.isFinite ? _int(flex, 0, kFlexMax, kDefaultFlex) : null,
      category: AnchorCategory.parse(m['category']),
      createdAt: createdAt,
      updatedAt: updatedAt,
      doneOn: _cleanStamp(m['doneOn']),
      tickAt: canonicalIso(m['tickAt']),
      extra: _extraOf(m, _known),
    );
  }
}

// ---- task (minimum viable day) ---------------------------------------------------

@immutable
class DayTask {
  const DayTask({
    required this.id,
    required this.createdAt,
    required this.updatedAt,
    this.title = '',
    this.subtitle = '',
    this.deletedAt,
    this.doneOn,
    this.tickAt,
    this.extra = const {},
  });

  final String id;
  final String title;
  final String subtitle;
  final String createdAt;
  final String updatedAt;
  final String? deletedAt;
  final String? doneOn;
  final String? tickAt;
  final Map<String, Object?> extra;

  bool get isDeleted => deletedAt != null;

  static const _known = {
    'id',
    'title',
    'subtitle',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'doneOn',
    'tickAt',
    'done', // pre-sync saves, read by the migration only
  };

  DayTask copyWith({
    String? title,
    String? subtitle,
    String? createdAt,
    String? updatedAt,
    String? Function()? deletedAt,
    String? Function()? doneOn,
    String? Function()? tickAt,
  }) => DayTask(
    id: id,
    title: title ?? this.title,
    subtitle: subtitle ?? this.subtitle,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
    deletedAt: deletedAt == null ? this.deletedAt : deletedAt(),
    doneOn: doneOn == null ? this.doneOn : doneOn(),
    tickAt: tickAt == null ? this.tickAt : tickAt(),
    extra: extra,
  );

  DayTask tombstone(String at) =>
      DayTask(id: id, createdAt: createdAt, updatedAt: updatedAt, deletedAt: at);

  Map<String, Object?> toJson() {
    if (isDeleted) {
      return {
        'id': id,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        'deletedAt': deletedAt,
      };
    }
    return {
      ...extra,
      'id': id,
      'title': title,
      'subtitle': subtitle,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'deletedAt': null,
      'doneOn': doneOn,
      'tickAt': tickAt,
    };
  }

  static DayTask? fromJson(Object? json) {
    if (json is! Map) return null;
    final m = json.cast<String, Object?>();
    final id = m['id'];
    if (!isValidId(id)) return null;
    final createdAt = canonicalIso(m['createdAt']);
    final updatedAt = canonicalIso(m['updatedAt']) ?? createdAt;
    if (createdAt == null || updatedAt == null) return null;
    final deletedAt = canonicalIso(m['deletedAt']);
    if (deletedAt != null &&
        parseIsoMs(deletedAt)! >= parseIsoMs(updatedAt)!) {
      return DayTask(
        id: id as String,
        createdAt: createdAt,
        updatedAt: updatedAt,
        deletedAt: deletedAt,
      );
    }
    final title = cleanText(m['title'], kTitleMax);
    if (title.isEmpty) return null;
    return DayTask(
      id: id as String,
      title: title,
      subtitle: cleanText(m['subtitle'], kTaskSubtitleMax),
      createdAt: createdAt,
      updatedAt: updatedAt,
      doneOn: _cleanStamp(m['doneOn']),
      tickAt: canonicalIso(m['tickAt']),
      extra: _extraOf(m, _known),
    );
  }
}

/// The starter minimum day (the Expo app's: small, physical, kind). The
/// ids and words are the same in every client.
const List<(String, String, String)> kStarterTasks = [
  ('mvd-1', 'Stay hydrated', '2 glasses left'),
  ('mvd-2', 'Take meds', 'Morning dosage'),
  ('mvd-3', 'Walk', '10 minutes outside'),
];

List<DayTask> starterTasks() => [
  for (final (id, title, subtitle) in kStarterTasks)
    DayTask(
      id: id,
      title: title,
      subtitle: subtitle,
      createdAt: kEpochIso,
      updatedAt: kEpochIso,
    ),
];
