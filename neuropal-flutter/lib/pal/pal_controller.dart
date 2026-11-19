// Pal, the assistant: what the five tools keep between visits, saved on the
// phone after every change (shared_preferences), so nothing is lost when
// Android stops the app.
//   * bubble    hidden or not (Settings and the sheet both switch it);
//   * dump      the brain dump, newest first, with tombstones for deletions;
//   * chat      Talk's last 30 messages (the sheet shows 10; the server
//               keeps its own copy until "Clear chat");
//   * sit       the running "Sit with me" and the notes written after one.
//
// Sit with me runs on an absolute clock (epoch ms), so it survives closing
// the sheet and restarting the app: a watcher ticks once a second while a
// session runs, asks the halfway question, ends it on time, and quietly
// forgets an unanswered "Want to note what you did?" after 30 minutes.
// What Pal says by itself is published as [news] for the app to read out.
//
// THE BRAIN DUMP AND DAY SYNC. DAY-SYNC §1 lists the dump as part of the
// day, but this app's DayStore (lib/day/) has no dump section yet, and it
// isn't this module's to change. Until it gets one, the dump is kept here,
// on this phone only, in exactly the contract's item shape ({id, text, at,
// deletedAt}, tombstones included), and it follows the day's owner the way
// the day does: a day that changes account is cleared, so is this.
//
// Signing out ends what belongs to that session: the chat, the sit and its
// notes are forgotten (the web app does the same). The dump is day data
// and stays with the day, as the day does in this app.

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/backend.dart';
import '../day/day_models.dart';
import '../day/day_store.dart';
import '../theme/pal.dart';
import 'crisis.dart';
import 'pal_api.dart';
import 'pal_models.dart';

/// Makes the sit watcher's timer (tests pass one that never fires and
/// call [PalController.tick] themselves).
typedef PalTimerFactory = Timer Function(Duration period, void Function(Timer) onTick);

/// A line Pal says by itself; [id] goes up with each one.
@immutable
class PalNews {
  const PalNews(this.id, this.text);

  final int id;
  final String text;
}

/// What a tick of the sit watcher did.
enum SitTick { asked, ended, forgotten }

class PalController extends ChangeNotifier {
  PalController({
    required this.prefs,
    required this.day,
    required this.api,
    required this.look,
    PalTimerFactory? timer,
  }) : _timer = timer ?? Timer.periodic {
    _load();
    day.addListener(_onDay);
    _onDay();
    // A session that ran on while the app was closed: catch up quietly
    // (ended on time, or past halfway), then keep watching.
    _tick(announce: false);
    _watch();
  }

  static const bubbleKey = 'np.pal.bubbleHidden';
  static const dumpKey = 'np.pal.dump';
  static const chatKey = 'np.pal.chat';
  static const sitKey = 'np.pal.sit';

  /// An unanswered end prompt goes away quietly after this long.
  static const forgetEnded = Duration(minutes: 30);

  final SharedPreferences prefs;
  final DayStore day;
  final PalApi api;

  /// Pal's name and talk style, now (the appearance can change any time).
  final PalSettings Function() look;
  final PalTimerFactory _timer;

  bool _bubbleHidden = false;
  List<DumpItem> _dump = const [];
  String? _dumpOwner;
  List<PalChatItem> _chat = const [];
  bool _sending = false;
  PalSit? _sit;
  List<PalSitNote> _notes = const [];
  Timer? _watcher;
  bool _watchingFast = false;
  PalNews? _news;
  int _newsId = 0;

  /// Bumped when the session ends: a reply that comes back afterwards
  /// belongs to nobody here and is dropped.
  int _epoch = 0;
  bool _disposed = false;

  int get _nowMs => day.now().millisecondsSinceEpoch;

  // ---- the bubble ------------------------------------------------------------

  bool get bubbleHidden => _bubbleHidden;

  void setBubbleHidden(bool hidden) {
    if (hidden == _bubbleHidden) return;
    _bubbleHidden = hidden;
    unawaited(prefs.setBool(bubbleKey, hidden));
    _notify();
  }

  // ---- the brain dump --------------------------------------------------------

  /// Live lines, newest first.
  List<DumpItem> get dump => [
    for (final d in _dump)
      if (!d.isDeleted) d,
  ];

  /// Everything, tombstones included, as day sync would send it.
  List<Map<String, Object?>> dumpForSync() => [for (final d in _dump) d.toJson()];

  /// Adds a line. False when it is empty.
  bool addDump(String text) {
    final t = cleanText(text, kDumpTextMax);
    if (t.isEmpty) return false;
    final now = day.now();
    _dump = _sortedDump([DumpItem(id: freshId('d', now), text: t, at: isoMs(now)), ..._dump]);
    _saveDump();
    _notify();
    return true;
  }

  /// Deletes a line: the text goes at once, a tombstone stays (for sync).
  /// Returns the line as it was, for Undo — which adds the text again
  /// under a new id (DAY-SYNC §5: there is no restore for the dump).
  DumpItem? removeDump(String id) {
    final i = _dump.indexWhere((d) => d.id == id && !d.isDeleted);
    if (i < 0) return null;
    final gone = _dump[i];
    _dump = _sortedDump(List.of(_dump)..[i] = gone.tombstone(isoMs(day.now())));
    _saveDump();
    _notify();
    return gone;
  }

  // ---- Talk ------------------------------------------------------------------

  /// The stored messages, oldest first (the sheet shows the last 10).
  List<PalChatItem> get chat => _chat;

  /// Waiting for Pal's reply.
  bool get sending => _sending;

  /// Sends [text] to Pal and returns Pal's reply (null when it was dropped:
  /// empty, already sending, or the session ended meanwhile). A message
  /// that sounds like a crisis is answered here with the careful reply and
  /// never sent anywhere.
  Future<PalChatItem?> sendChat(String text, {required Map<String, Object?> context}) async {
    final t = text.trim();
    if (t.isEmpty || _sending) return null;
    final epoch = _epoch;
    _pushChat(fromPal: false, text: t);
    if (looksLikeCrisis(t)) {
      final reply = _pushChat(fromPal: true, text: kCrisisReply, crisis: true, local: true);
      _notify();
      return reply;
    }
    _sending = true;
    _notify();
    PalChatItem? reply;
    try {
      final r = await api.chat(t, context);
      if (epoch != _epoch) return null;
      reply = _pushChat(fromPal: true, text: r.text, crisis: r.crisis, local: r.local);
    } on ApiException catch (e) {
      if (epoch != _epoch) return null;
      reply = _pushChat(fromPal: true, text: chatFallbackLine(look(), e), local: true);
    } finally {
      if (epoch == _epoch) {
        _sending = false;
        _notify();
      }
    }
    return reply;
  }

  /// Forgets the chat here at once, then asks the server to forget its
  /// copy. True when the server's copy is gone too.
  Future<bool> clearChat() async {
    _chat = const [];
    _saveChat();
    _notify();
    return api.clearChat();
  }

  PalChatItem _pushChat({required bool fromPal, required String text, bool crisis = false, bool local = false}) {
    final item = PalChatItem(
      id: freshId('m', day.now()),
      fromPal: fromPal,
      text: cleanText(text, kChatTextMax),
      at: isoMs(day.now()),
      crisis: crisis,
      local: local,
    );
    final list = [..._chat, item];
    _chat = list.length > kChatKeep ? list.sublist(list.length - kChatKeep) : list;
    _saveChat();
    return item;
  }

  // ---- Sit with me -------------------------------------------------------------

  PalSit? get sit => _sit;

  /// Notes written after a sit, newest first.
  List<PalSitNote> get sitNotes => _notes;

  /// What Pal last said by itself (the halfway question, the end).
  PalNews? get news => _news;

  /// Now, by the app's clock (the screens' timers use it).
  int nowMs() => _nowMs;

  void startSit({required int minutes, String label = '', String? taskId, String? anchorId}) {
    final startedAt = _nowMs;
    final m = minutes < 1 ? 1 : minutes;
    _sit = PalSit(
      id: freshId('s', day.now()),
      minutes: m,
      label: cleanText(label, kSitLabelMax),
      taskId: taskId,
      anchorId: anchorId,
      startedAt: startedAt,
      endsAt: startedAt + m * 60000,
    );
    _saveSit();
    _watch();
    _notify();
  }

  void answerSitCheck(SitCheck answer) {
    final s = _sit;
    if (s == null || s.ended) return;
    _sit = s.copyWith(checkIn: answer);
    _saveSit();
    _notify();
  }

  /// "I'm done" / "Stop": the session ends kindly either way.
  void endSit() {
    final s = _sit;
    if (s == null || s.ended) return;
    _sit = s.copyWith(endedAt: _nowMs, endReason: SitEnd.done);
    _saveSit();
    _watch();
    _notify();
  }

  /// Over without a note ("Not now").
  void clearSit() {
    if (_sit == null) return;
    _sit = null;
    _saveSit();
    _watch();
    _notify();
  }

  /// Saves what the person did (an empty note just closes the session).
  void saveSitNote(String note) {
    final s = _sit;
    if (s == null) return;
    final n = cleanText(note, kSitNoteMax);
    if (n.isNotEmpty) {
      final end = s.endedAt ?? s.endsAt;
      final spent = ((end - s.startedAt) / 60000).round();
      _notes = [
        PalSitNote(
          id: freshId('n', day.now()),
          minutes: spent < 1 ? 1 : spent,
          label: s.label,
          note: n,
          at: isoMs(day.now()),
        ),
        ..._notes,
      ].take(kSitNotesKeep).toList();
    }
    _sit = null;
    _saveSit();
    _watch();
    _notify();
  }

  /// One tick of the watcher: the halfway question (only with more than a
  /// minute left), the natural end, and forgetting an old end prompt.
  SitTick? tick() => _tick(announce: true);

  SitTick? _tick({required bool announce}) {
    final s = _sit;
    if (s == null) return null;
    final now = _nowMs;
    final pal = look();
    if (s.ended) {
      if (now - s.endedAt! > forgetEnded.inMilliseconds) {
        _sit = null;
        _saveSit();
        _watch();
        _notify();
        return SitTick.forgotten;
      }
      return null;
    }
    if (now >= s.endsAt) {
      _sit = s.copyWith(endedAt: s.endsAt, endReason: SitEnd.time);
      _saveSit();
      _watch();
      if (announce) _say('${pal.name}: ${palSay(pal, 'sitEnd')}');
      _notify();
      return SitTick.ended;
    }
    final half = s.startedAt + (s.endsAt - s.startedAt) ~/ 2;
    if (s.checkIn == null && now >= half && s.endsAt - now > 60000) {
      _sit = s.copyWith(checkIn: SitCheck.asked);
      _saveSit();
      if (announce) _say('${pal.name}: ${palSay(pal, 'sitCheck')}');
      _notify();
      return SitTick.asked;
    }
    return null;
  }

  /// A running sit is watched every second; an ended one only for the
  /// 30-minute forget; none, not at all.
  void _watch() {
    final s = _sit;
    final fast = s != null && !s.ended;
    if (s == null) {
      _watcher?.cancel();
      _watcher = null;
      return;
    }
    if (_watcher != null && _watchingFast == fast) return;
    _watcher?.cancel();
    _watchingFast = fast;
    _watcher = _timer(fast ? const Duration(seconds: 1) : const Duration(seconds: 30), (_) {
      if (_disposed) return;
      tick();
      // The minute labels (the bubble, Home's tile) follow the clock.
      if (_sit != null && !_sit!.ended) _notifyClock();
    });
  }

  /// Ticks once a second while a sit runs (the screens' clocks listen).
  final ValueNotifier<int> clock = ValueNotifier<int>(0);

  void _notifyClock() => clock.value = _nowMs;

  void _say(String text) {
    _newsId += 1;
    _news = PalNews(_newsId, text);
  }

  // ---- the session ---------------------------------------------------------------

  /// The session ended, or another began: the chat is forgotten, and an
  /// answer still on its way is dropped. With [endSit] (signing out) the
  /// sit and its notes go too.
  void forgetSession({bool endSit = true}) {
    _epoch += 1;
    _sending = false;
    _chat = const [];
    _saveChat();
    if (endSit) {
      _sit = null;
      _notes = const [];
      _saveSit();
      _watch();
    }
    _notify();
  }

  /// The day changed hands (DayStore.resetFor): so does the dump.
  void _onDay() {
    final owner = day.owner;
    if (owner == _dumpOwner) return;
    if (owner != null && _dumpOwner != null) _dump = const [];
    _dumpOwner = owner;
    _saveDump();
    _notify();
  }

  // ---- storage --------------------------------------------------------------------

  static List<DumpItem> _sortedDump(List<DumpItem> list) {
    final live = [
      for (final d in list)
        if (!d.isDeleted) d,
    ]..sort((a, b) => (parseIsoMs(b.at) ?? 0).compareTo(parseIsoMs(a.at) ?? 0));
    final gone = [
      for (final d in list)
        if (d.isDeleted) d,
    ]..sort((a, b) => (parseIsoMs(b.deletedAt) ?? 0).compareTo(parseIsoMs(a.deletedAt) ?? 0));
    return [...live.take(kDumpKeep), ...gone.take(kDumpTombstonesKeep)];
  }

  void _write(String key, Object? value) {
    // shared_preferences updates its cache at once and writes in the
    // background; a failed write is retried by the next change. Only the
    // kind of error is logged: never what was written.
    prefs.setString(key, jsonEncode(value)).catchError((Object e) {
      debugPrint('Pal could not save ($key): ${e.runtimeType}');
      return false;
    });
  }

  void _saveDump() => _write(dumpKey, {
    'v': 1,
    'owner': _dumpOwner,
    'items': [for (final d in _dump) d.toJson()],
  });

  void _saveChat() => _write(chatKey, [for (final m in _chat) m.toJson()]);

  void _saveSit() => _write(sitKey, {
    'sit': _sit?.toJson(),
    'notes': [for (final n in _notes) n.toJson()],
  });

  Object? _read(String key) {
    final raw = prefs.getString(key);
    if (raw == null) return null;
    try {
      return jsonDecode(raw);
    } on FormatException {
      return null; // a broken save starts empty rather than crash the app
    }
  }

  void _load() {
    _bubbleHidden = prefs.getBool(bubbleKey) ?? false;
    final dump = _read(dumpKey);
    if (dump is Map) {
      final owner = dump['owner'];
      _dumpOwner = owner is String && owner.isNotEmpty ? owner : null;
      final items = dump['items'];
      _dump = _sortedDump([
        for (final j in items is List ? items : const []) ?DumpItem.fromJson(j),
      ]);
    }
    final chat = _read(chatKey);
    if (chat is List) {
      final list = [for (final j in chat) ?PalChatItem.fromJson(j)];
      _chat = list.length > kChatKeep ? list.sublist(list.length - kChatKeep) : list;
    }
    final sit = _read(sitKey);
    if (sit is Map) {
      _sit = PalSit.fromJson(sit['sit']);
      final notes = sit['notes'];
      _notes = [
        for (final j in notes is List ? notes : const []) ?PalSitNote.fromJson(j),
      ].take(kSitNotesKeep).toList();
    }
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _watcher?.cancel();
    day.removeListener(_onDay);
    clock.dispose();
    super.dispose();
  }
}
