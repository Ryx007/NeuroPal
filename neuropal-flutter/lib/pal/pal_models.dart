// What Pal remembers, shaped like the other clients' (the Expo app's
// palSlice, the web app's palState.ts):
//   * the Talk chat: the last 30 messages (the server keeps its own copy);
//   * the running "Sit with me" session and the notes written after one.
// (The brain dump's lines are part of the day: DumpItem in
// lib/day/day_models.dart.) Every reader here is forgiving: a broken save
// drops the bad entry, never the app.

import 'package:flutter/foundation.dart';

import '../day/day_models.dart';

// ---- limits (the same as the other clients and the server) -------------------

/// Talk: messages stored on the phone, and how many the sheet shows.
const int kChatKeep = 30;
const int kChatShown = 10;
const int kChatTextMax = 4000;

/// "Sit with me": notes kept, and the longest label and note.
const int kSitNotesKeep = 30;
const int kSitLabelMax = 120;
const int kSitNoteMax = 500;

int? _ms(Object? v) => v is num && v.isFinite ? v.toInt() : null;

// ---- Talk -----------------------------------------------------------------------

@immutable
class PalChatItem {
  const PalChatItem({
    required this.id,
    required this.fromPal,
    required this.text,
    required this.at,
    this.crisis = false,
    this.local = false,
  });

  final String id;

  /// Pal's message (else the person's).
  final bool fromPal;
  final String text;
  final String at;

  /// Pal's careful crisis reply (from this phone or from the server): it
  /// carries the help lines and the way to the calming steps.
  final bool crisis;

  /// Written on this phone, not by the server.
  final bool local;

  Map<String, Object?> toJson() => {
    'id': id,
    'role': fromPal ? 'pal' : 'user',
    'text': text,
    'at': at,
    'crisis': crisis,
    'local': local,
  };

  static PalChatItem? fromJson(Object? json) {
    if (json is! Map) return null;
    final role = json['role'];
    final text = cleanText(json['text'], kChatTextMax);
    if (text.isEmpty || (role != 'user' && role != 'pal')) return null;
    final id = json['id'];
    return PalChatItem(
      id: isValidId(id) ? id as String : freshId('m', DateTime.now()),
      fromPal: role == 'pal',
      text: text,
      at: json['at'] is String ? json['at'] as String : '',
      crisis: json['crisis'] == true,
      local: json['local'] == true,
    );
  }
}

// ---- Sit with me ---------------------------------------------------------------------

/// The halfway question: asked, then answered.
enum SitCheck { asked, yes, no }

/// time = the block ran out; done = the person finished or stopped.
enum SitEnd { time, done }

@immutable
class PalSit {
  const PalSit({
    required this.id,
    required this.minutes,
    required this.startedAt,
    required this.endsAt,
    this.label = '',
    this.taskId,
    this.anchorId,
    this.checkIn,
    this.endedAt,
    this.endReason,
  });

  final String id;
  final int minutes;
  final String label;

  /// The minimum-day task it is for (Tick off at the end), if any.
  final String? taskId;
  final String? anchorId;

  /// Epoch milliseconds: a restart picks the clock up where it was.
  final int startedAt;
  final int endsAt;
  final SitCheck? checkIn;
  final int? endedAt;
  final SitEnd? endReason;

  bool get ended => endedAt != null;

  PalSit copyWith({SitCheck? checkIn, int? endedAt, SitEnd? endReason}) => PalSit(
    id: id,
    minutes: minutes,
    label: label,
    taskId: taskId,
    anchorId: anchorId,
    startedAt: startedAt,
    endsAt: endsAt,
    checkIn: checkIn ?? this.checkIn,
    endedAt: endedAt ?? this.endedAt,
    endReason: endReason ?? this.endReason,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'minutes': minutes,
    'label': label,
    'taskId': taskId,
    'anchorId': anchorId,
    'startedAt': startedAt,
    'endsAt': endsAt,
    'checkIn': checkIn?.name,
    'endedAt': endedAt,
    'endReason': endReason?.name,
  };

  static PalSit? fromJson(Object? json) {
    if (json is! Map) return null;
    final startedAt = _ms(json['startedAt']);
    final endsAt = _ms(json['endsAt']);
    if (startedAt == null || endsAt == null || endsAt <= startedAt) return null;
    final minutes = _ms(json['minutes']);
    final endedAt = _ms(json['endedAt']);
    final id = json['id'];
    final taskId = json['taskId'];
    final anchorId = json['anchorId'];
    return PalSit(
      id: isValidId(id) ? id as String : freshId('s', DateTime.now()),
      minutes: minutes != null && minutes > 0
          ? minutes
          : ((endsAt - startedAt) / 60000).round(),
      label: cleanText(json['label'], kSitLabelMax),
      taskId: taskId is String && taskId.isNotEmpty ? taskId : null,
      anchorId: anchorId is String && anchorId.isNotEmpty ? anchorId : null,
      startedAt: startedAt,
      endsAt: endsAt,
      checkIn: SitCheck.values.where((c) => c.name == json['checkIn']).firstOrNull,
      endedAt: endedAt,
      endReason: endedAt == null
          ? null
          : (json['endReason'] == 'done' ? SitEnd.done : SitEnd.time),
    );
  }
}

/// A finished sit the person wrote a note for.
@immutable
class PalSitNote {
  const PalSitNote({
    required this.id,
    required this.minutes,
    required this.label,
    required this.note,
    required this.at,
  });

  final String id;
  final int minutes;
  final String label;
  final String note;
  final String at;

  Map<String, Object?> toJson() => {
    'id': id,
    'minutes': minutes,
    'label': label,
    'note': note,
    'at': at,
  };

  static PalSitNote? fromJson(Object? json) {
    if (json is! Map) return null;
    final note = cleanText(json['note'], kSitNoteMax);
    if (note.isEmpty) return null;
    final id = json['id'];
    final minutes = _ms(json['minutes']);
    return PalSitNote(
      id: isValidId(id) ? id as String : freshId('n', DateTime.now()),
      minutes: minutes == null || minutes < 0 ? 0 : minutes,
      label: cleanText(json['label'], kSitLabelMax),
      note: note,
      at: json['at'] is String ? json['at'] as String : '',
    );
  }
}
