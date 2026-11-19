// Pal's local brain, a port of the web app's palLogic.ts (itself a port of
// the Expo app's palAssistant.js). Pure functions of the day, the time and
// the appearance — no widgets, no network — so every basic works offline:
//   suggestionsFor()  "What now?": ONE next step for this moment, with a why
//   localBreakdown()  "Break it down" without the server (template steps)
//   cleanSteps()      the same rules for steps that come from the server
//   chatContext()     what POST /api/pal/chat gets to know
//   leftLabel()       the calm "12 min left" of Sit with me
// Copy is short, kind and plain; Pal never diagnoses. The one change from
// the other clients: clock times follow the skin (Classic "2:05 PM",
// Signal "14:05"), as everywhere in this app.

import '../data/models.dart';
import '../day/day_models.dart';
import '../day/day_rules.dart';
import '../home/home_logic.dart' show shorten;
import '../theme/pal.dart';

enum PalTool {
  now('What now?', 'One next step, picked for right now'),
  breakdown('Break it down', 'Big task in, tiny steps out'),
  dump('Brain dump', 'Get thoughts out of your head'),
  sit('Sit with me', 'Quiet company while you work'),
  talk('Talk', 'A short chat');

  const PalTool(this.title, this.sub);

  final String title;
  final String sub;
}

/// Sit with me: the three lengths offered (minutes).
const List<int> kSitLengths = [10, 25, 45];

/// "Within 30 min" (the anchor rule) and how early Pal calls time before it.
const int kAnchorWindowMin = 30;
const int _anchorLeadMin = 5;

const int kTaskMaxChars = 500;
const int kMessageMaxChars = 1000;

// ---- time ------------------------------------------------------------------------

enum DayPart { night, morning, afternoon, evening }

/// Night is 22:00–05:59: no new deep work, wind down instead.
DayPart partOfDay(DateTime d) {
  final h = d.hour;
  if (h < 6 || h >= 22) return DayPart.night;
  if (h < 12) return DayPart.morning;
  if (h < 18) return DayPart.afternoon;
  return DayPart.evening;
}

/// The first anchor not done today that starts within the next
/// [windowMin] minutes, and how many minutes away it is.
(DayAnchor, int)? upcomingAnchor(
  List<DayAnchor> anchors,
  DateTime now,
  String today, {
  int windowMin = kAnchorWindowMin,
}) {
  (DayAnchor, int)? best;
  for (final a in anchors) {
    if (a.doneOn == today) continue;
    final m = minutesUntil(a, now);
    if (m < 0 || m > windowMin) continue;
    if (best == null || m < best.$2) best = (a, m);
  }
  return best;
}

/// The reading to suggest: the most recently read unfinished document.
DocumentSummary? unfinishedReading(List<DocumentSummary> docs) {
  DocumentSummary? best;
  int at(DocumentSummary d) => d.lastReadAt?.millisecondsSinceEpoch ?? 0;
  for (final d in docs) {
    if (d.id.isEmpty || d.readingProgress <= 0 || d.readingProgress >= 1) continue;
    if (best == null || at(d) > at(best)) best = d;
  }
  return best;
}

String _quoted(String s) => '“${shorten(s)}”';

// ---- "What now?" -------------------------------------------------------------------

sealed class SuggestionAction {
  const SuggestionAction();
}

/// Open the calming steps.
class CalmAction extends SuggestionAction {
  const CalmAction();
}

/// Open another of Pal's tools.
class OpenToolAction extends SuggestionAction {
  const OpenToolAction(this.tool);
  final PalTool tool;
}

/// A plain "go for it": Pal says it will be here.
class AckAction extends SuggestionAction {
  const AckAction();
}

/// Start Sit with me.
class SitAction extends SuggestionAction {
  const SitAction({required this.minutes, this.label = '', this.taskId, this.anchorId});
  final int minutes;
  final String label;
  final String? taskId;
  final String? anchorId;
}

/// Open the reader on [document] and sit with Pal while reading.
class ReadAction extends SuggestionAction {
  const ReadAction({required this.document, required this.minutes, required this.label});
  final DocumentSummary document;
  final int minutes;
  final String label;
}

class Suggestion {
  const Suggestion({required this.id, required this.title, required this.why, required this.action});

  final String id;
  final String title;
  final String why;
  final SuggestionAction action;
}

/// The candidate next steps for this moment, best first. The sheet shows
/// one; "Something else" moves on. Never empty.
List<Suggestion> suggestionsFor({
  required NervousState? state,
  required DateTime now,
  required String today,
  required List<DayAnchor> anchors,
  required List<DayTask> tasks,
  required PalSettings pal,
  required bool signal,
  DocumentSummary? reading,
}) {
  final open = [
    for (final t in tasks)
      if (t.doneOn != today && t.title.trim().isNotEmpty) t,
  ];
  final night = partOfDay(now) == DayPart.night;
  final out = <Suggestion>[];
  void add(Suggestion s) {
    if (!out.any((x) => x.id == s.id)) out.add(s);
  }

  const water = Suggestion(
    id: 'water',
    title: 'Get a glass of water',
    why: 'Small and physical helps when your head is loud.',
    action: AckAction(),
  );
  final dump = Suggestion(
    id: 'dump',
    title: night ? 'Write down tomorrow’s first step, then stop' : 'Empty your head for two minutes',
    why: night
        ? 'It’s late. Nothing big tonight; tomorrow can start from here.'
        : 'Getting thoughts out makes room to pick one.',
    action: const OpenToolAction(PalTool.dump),
  );
  // A bit off: the talk-style "two minutes on …" line; the sit runs up to
  // 10 minutes and can end any time.
  Suggestion smallStep(DayTask t, String why) => Suggestion(
    id: 'task:${t.id}',
    title: palLine(pal, _quoted(t.title)),
    why: why,
    action: SitAction(minutes: 10, label: t.title.trim(), taskId: t.id),
  );

  if (state == NervousState.red) {
    add(
      const Suggestion(
        id: 'calm',
        title: 'Take a 2-minute reset',
        why: 'You said you’re overwhelmed. Body first; everything else can wait.',
        action: CalmAction(),
      ),
    );
    add(water);
    add(
      const Suggestion(
        id: 'sit-quiet',
        title: 'Sit with me for 10 minutes',
        why: 'No task. Just quiet company.',
        action: SitAction(minutes: 10),
      ),
    );
    return out;
  }

  if (state == NervousState.yellow) {
    if (night) {
      add(
        Suggestion(
          id: dump.id,
          title: dump.title,
          why: 'It’s late and you’re a bit off. Rest counts as a step.',
          action: dump.action,
        ),
      );
    }
    for (final (i, t) in open.indexed) {
      add(
        smallStep(
          t,
          i == 0
              ? 'You’re a bit off, so the next thing on today’s list. Two minutes counts.'
              : 'Another small one from today’s list.',
        ),
      );
    }
    if (open.isEmpty) {
      add(
        const Suggestion(
          id: 'smallest',
          title: 'Pick the smallest thing you can do',
          why: 'Today’s list is done. If you want more, keep it tiny.',
          action: OpenToolAction(PalTool.breakdown),
        ),
      );
    }
    add(water);
    add(dump);
    return out;
  }

  // Okay, or not checked in yet (treated as okay; the panel offers a
  // check-in above the suggestion).
  final soon = upcomingAnchor(anchors, now, today);
  if (soon != null) {
    final (anchor, minutes) = soon;
    final at = anchorClock(anchor, signal: signal);
    if (minutes <= _anchorLeadMin + 2) {
      add(
        Suggestion(
          id: 'anchor:${anchor.id}',
          title: 'Get ready for ${_quoted(anchor.title)}',
          why: minutes <= 0 ? 'It’s at $at, right about now.' : 'It starts in $minutes min, at $at.',
          action: const AckAction(),
        ),
      );
    } else {
      final sit = minutes - _anchorLeadMin < 25 ? minutes - _anchorLeadMin : 25;
      add(
        Suggestion(
          id: 'anchor:${anchor.id}',
          title: 'One small thing before ${_quoted(anchor.title)}',
          why:
              'It starts in $minutes min, so nothing big. I’ll call time '
              '$_anchorLeadMin min before.',
          action: SitAction(
            minutes: sit,
            label: 'Before ${anchor.title.trim()}',
            anchorId: anchor.id,
          ),
        ),
      );
    }
  }
  if (night) add(dump);
  if (reading != null) {
    final pct = (reading.readingProgress * 100).round();
    add(
      Suggestion(
        id: 'read:${reading.id}',
        title: palSay(pal, 'focus', {'task': _quoted(reading.title)}),
        why: 'A good window for focus. You left off at $pct%.',
        action: ReadAction(
          document: reading,
          minutes: 25,
          label: 'Reading ${reading.title.trim()}',
        ),
      ),
    );
  }
  for (final (i, t) in open.indexed) {
    add(
      Suggestion(
        id: 'task:${t.id}',
        title: palSay(pal, 'focus', {'task': _quoted(t.title)}),
        why: i == 0 && reading == null
            ? 'A good window for focus. Stop whenever it’s done.'
            : 'Next on today’s list. Stop whenever it’s done.',
        action: SitAction(minutes: 25, label: t.title.trim(), taskId: t.id),
      ),
    );
  }
  add(dump);
  if (open.isEmpty && reading == null) {
    add(
      const Suggestion(
        id: 'smallest',
        title: 'Pick one small thing for today',
        why: 'Nothing is waiting. Break something down, or rest.',
        action: OpenToolAction(PalTool.breakdown),
      ),
    );
  }
  add(water);
  return out;
}

// ---- "Break it down" -----------------------------------------------------------------

const int kStepMaxWords = 12;
const int kStepsMin = 3;
const int kStepsMax = 7;

final RegExp _ws = RegExp(r'\s+');
final RegExp _numbering = RegExp(r'^\s*(?:step\s*)?(?:\d+|[a-z])[.):\]-]\s+', caseSensitive: false);
final RegExp _bullet = RegExp(r'^\s*[-*•·–—]+\s*');
final RegExp _trailingPunct = RegExp(r'[,;:–—-]+$');
// A step cut at 12 words must not end on a dangling "and" / "the".
final RegExp _dangling = RegExp(
  r'\s+(?:and|or|but|the|a|an|to|of|with|for|about|that|which|then|so)$',
  caseSensitive: false,
);
final RegExp _keyChars = RegExp(r'[^a-z0-9]+');

/// JavaScript truthiness, for `o.text || o.step || o.title || ""`.
bool _truthy(Object? v) =>
    v != null && v != false && v != 0 && v != '' && !(v is double && v.isNaN);

/// Server or template steps → 3–7 clean steps of ≤ 12 words; null when
/// fewer than 3 survive. Numbering, bullets and duplicates go.
List<String>? cleanSteps(Object? raw) {
  final list = raw is List ? raw : const [];
  final out = <String>[];
  final seen = <String>{};
  for (final item in list) {
    Object? value = '';
    if (item is String) {
      value = item;
    } else if (item is Map) {
      value = [item['text'], item['step'], item['title']].firstWhere(_truthy, orElse: () => '');
    }
    var s = '$value'
        .replaceAll(_ws, ' ')
        .replaceFirst(_numbering, '')
        .replaceFirst(_bullet, '')
        .trim();
    if (s.isEmpty) continue;
    final words = s.split(_ws).where((w) => w.isNotEmpty).toList();
    if (words.length > kStepMaxWords) {
      s = words.take(kStepMaxWords).join(' ').replaceFirst(_trailingPunct, '');
      while (_dangling.hasMatch(s)) {
        s = s.replaceFirst(_dangling, '');
      }
    }
    if (s.isEmpty) continue;
    s = s[0].toUpperCase() + s.substring(1);
    // A step can go on the minimum day as a task: cut to a task title's
    // length now (as the day and the server would), so what is on screen
    // is what the day gets.
    s = cleanText(s, kTitleMax);
    final key = s.toLowerCase().replaceAll(_keyChars, '');
    if (key.isEmpty || !seen.add(key)) continue;
    out.add(s);
    if (out.length == kStepsMax) break;
  }
  return out.length >= kStepsMin ? out : null;
}

// Checked in order, verbs first: "read the paper" is reading, "write the
// paper" is writing. Ambiguous nouns alone ("the paper") get the generic one.
final List<(RegExp, List<String>)> _templates = [
  (
    RegExp(r'\b(write|writing|draft|drafting|essay|report|thesis|blog|cv|cover letter|summari[sz]e)\b', caseSensitive: false),
    const [
      'Open the document',
      'Write one messy sentence, any sentence',
      'List three points you want to make',
      'Write the first point, badly is fine',
      'Take a two-minute break',
      'Write the next point',
      'Read it once and fix one thing',
    ],
  ),
  (
    RegExp(r'\b(read|reading|study|studying|revise|revision|review|learn|lecture|lectures|textbook|exam|exams)\b', caseSensitive: false),
    const [
      'Open the reading at your page',
      'Read only the headings first',
      'Read one section, nothing more',
      'Write one line about what it said',
      'Stretch for a minute',
      'Read the next section',
    ],
  ),
  (
    RegExp(r'\b(email|e-mail|mail|message|reply|text|letter|dm)\b', caseSensitive: false),
    const [
      'Open the message',
      'Write one sentence saying what you need',
      'Add one sentence of detail',
      'Read it once',
      'Send it as it is',
    ],
  ),
  (
    RegExp(r'\b(call|phone|ring)\b', caseSensitive: false),
    const [
      'Find the number',
      'Write one line about why you’re calling',
      'Pick a quiet spot',
      'Press call',
      'Say your line, then listen',
    ],
  ),
  (
    RegExp(r'\b(clean|cleaning|tidy|dishes|laundry|wash|washing|room|desk|kitchen|vacuum|hoover|bathroom)\b', caseSensitive: false),
    const [
      'Put on something to listen to',
      'Pick up five things and put them away',
      'Clear one surface',
      'Take the rubbish out',
      'Do five more minutes, then stop',
    ],
  ),
  (
    RegExp(r'\b(apply|application|form|forms|tax|taxes|bill|bills|paperwork|admin|insurance|bank|appointment)\b', caseSensitive: false),
    const [
      'Open the form or website',
      'Find the first box you can fill',
      'Fill in only the easy parts',
      'Write down what you’re missing',
      'Save it, even if it isn’t finished',
    ],
  ),
  (
    RegExp(r'\b(cook|cooking|dinner|lunch|breakfast|meal|food|groceries|shopping|shop)\b', caseSensitive: false),
    const [
      'Get out one pan or one bag',
      'Pick the simplest option you have',
      'Get the ingredients or the list ready',
      'Do the first step of the recipe',
      'Tidy one thing while you wait',
    ],
  ),
];

const List<String> _generic = [
  'Get out what you need for it',
  'Do the first tiny part for two minutes',
  'Decide the next small piece',
  'Do that piece',
  'Check: done, or one more piece?',
];

/// Offline steps for any task: a template picked by keywords, else a
/// start-small sequence. Always 3–7 steps; step one takes under 2 minutes.
List<String> localBreakdown(String task) {
  final hit = _templates.where((t) => t.$1.hasMatch(task)).firstOrNull;
  return cleanSteps(hit?.$2 ?? _generic) ?? List.of(_generic);
}

/// Why the steps on screen are Pal's offline ones (said under the list).
enum OfflineReason {
  offline('No server right now, so these are Pal’s offline steps.'),
  limited('Pal has done a lot of thinking for now, so these are offline steps.'),
  error('The server didn’t answer well, so these are offline steps.'),
  quick('Quick steps, made on your phone.');

  const OfflineReason(this.note);
  final String note;
}

// ---- "Talk" -----------------------------------------------------------------------------

String _cut(String s, int max) => s.length <= max ? s : s.substring(0, max);

/// What POST /api/pal/chat gets to know: only what helps a short reply.
Map<String, Object?> chatContext({
  required NervousState? state,
  required DateTime now,
  required String today,
  required List<DayAnchor> anchors,
  required List<DayTask> tasks,
  required PalSettings pal,
}) {
  (DayAnchor, int)? next;
  for (final a in anchors) {
    if (a.doneOn == today) continue;
    final m = minutesUntil(a, now);
    if (m < 0) continue;
    if (next == null || m < next.$2) next = (a, m);
  }
  return {
    'state': state?.id,
    'localTime': hhmm(now.hour, now.minute),
    'nextAnchor': next == null
        ? null
        : {
            'title': _cut(next.$1.title, 80),
            'at': hhmm(next.$1.hour, next.$1.minute),
            'inMinutes': next.$2,
          },
    'minimumDay': [
      for (final t in tasks)
        if (t.doneOn != today && t.title.isNotEmpty) _cut(t.title, 80),
    ].take(8).toList(),
    'palName': pal.name,
    'talkStyle': pal.talk,
    'people': pal.people,
  };
}

// ---- "Sit with me" ---------------------------------------------------------------------------

/// "12 min left" (minutes, not ticking seconds: calm).
String leftLabel(int endsAt, int now) {
  final ms = endsAt - now;
  if (ms <= 0) return 'time’s up';
  if (ms < 60000) return 'under a minute left';
  return '${(ms / 60000).ceil()} min left';
}
