// Home's words and choices as pure functions (ports of the web app's
// HomeView.tsx and palLogic.ts), so they can be tested without a screen.

import '../data/models.dart';
import '../day/day_models.dart';
import '../day/day_rules.dart';
import '../pal/pal_avatar.dart';
import '../theme/pal.dart';

/// The check-in tile's live message line.
String stateMessage({
  required NervousState? state,
  required DayAnchor? next,
  required PalSettings pal,
  required bool signal,
}) {
  switch (state) {
    case NervousState.green:
      return next == null
          ? 'Good window for focus.'
          : 'Good window for focus. ${next.title} starts at '
                '${anchorClock(next, signal: signal)}.';
    case NervousState.yellow:
      return 'A gentler day. Two minutes on something counts.';
    case NervousState.red:
      return 'Everything else can wait. The calming steps are one tap away.';
    case null:
      return 'Check in when you like. ${pal.name}’s note follows how you feel.';
  }
}

/// Long titles are cut at a word, never mid-word.
String shorten(String s, [int n = 42]) {
  final t = s.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (t.length <= n) return t;
  final cut = t.substring(0, n - 1);
  final space = cut.lastIndexOf(' ');
  final head = space > n * 0.5 ? cut.substring(0, space) : cut;
  return '${head.replaceAll(RegExp(r'[\s,;:–—-]+$'), '')}…';
}

/// The greeting under Pal's name.
String helloFor(PalSettings pal, NervousState? state) => palSay(
  pal,
  switch (state) {
    NervousState.red => 'helloOver',
    NervousState.yellow => 'helloOff',
    NervousState.green => 'helloOkay',
    null => 'helloUnset',
  },
);

/// Pal's line on Home: nothing asked of you while overwhelmed; otherwise
/// two minutes on the first open task, or a hello.
String palNote(PalSettings pal, NervousState? state, DayTask? firstOpen) {
  if (state == NervousState.red) return palSay(pal, 'helloOver');
  if (firstOpen != null) return palLine(pal, '“${shorten(firstOpen.title)}”');
  return helloFor(pal, state);
}

/// The check-in → Pal's face.
PalMood moodFor(NervousState? state) => switch (state) {
  NervousState.red => PalMood.over,
  NervousState.yellow => PalMood.off,
  _ => PalMood.okay,
};

/// The document to resume on Home: the most recently read unfinished one,
/// else the most recently read one; null when nothing was read yet.
DocumentSummary? resumeDocument(List<DocumentSummary> docs) {
  int at(DocumentSummary d) => d.lastReadAt?.millisecondsSinceEpoch ?? 0;
  DocumentSummary? newest(Iterable<DocumentSummary> list) {
    DocumentSummary? best;
    for (final d in list) {
      if (best == null || at(d) > at(best)) best = d;
    }
    return best;
  }

  final unfinished = docs.where(
    (d) => d.id.isNotEmpty && d.readingProgress > 0 && d.readingProgress < 1,
  );
  return newest(unfinished) ??
      newest(docs.where((d) => d.id.isNotEmpty && d.lastReadAt != null));
}

/// "Hello, Ryx" from the account's name (its first word), or "Hello".
String helloLine(String? name, {required bool signal}) {
  final first = (name ?? '').trim().split(RegExp(r'\s+')).first;
  return '${first.isEmpty ? 'Hello' : 'Hello, $first'}${signal ? '.' : ''}';
}
