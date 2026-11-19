// Pal's local brain on fixed states and times: "What now?" (one step, with
// its reason and its action), the step cleaner and the offline steps (the
// server's own test case), the chat context and the calm sit labels.

import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/data/models.dart';
import 'package:neuropal/day/day_models.dart';
import 'package:neuropal/pal/pal_logic.dart';
import 'package:neuropal/theme/pal.dart';
import 'package:neuropal/theme/tokens.g.dart';

final pal = normalizePal(null); // "Pal", Gentle
final nerdy = normalizePal({'name': 'Quark', 'talk': 'Nerdy'});
const today = '2026-11-19';

DayAnchor anchor(String id, String title, int h, int m, {String? doneOn}) => DayAnchor(
  id: id,
  title: title,
  hour: h,
  minute: m,
  createdAt: kEpochIso,
  updatedAt: kEpochIso,
  doneOn: doneOn,
);

DayTask task(String id, String title, {bool done = false}) => DayTask(
  id: id,
  title: title,
  createdAt: kEpochIso,
  updatedAt: kEpochIso,
  doneOn: done ? today : null,
);

final tasks = [
  task('mvd-1', 'Stay hydrated'),
  task('mvd-2', 'Take meds', done: true),
  task('mvd-3', 'Walk'),
];

List<Suggestion> at(
  int h,
  int m, {
  NervousState? state,
  List<DayAnchor> anchors = const [],
  List<DayTask>? list,
  DocumentSummary? reading,
  bool signal = false,
  PalSettings? look,
}) => suggestionsFor(
  state: state,
  now: DateTime(2026, 11, 19, h, m),
  today: today,
  anchors: anchors,
  tasks: list ?? tasks,
  pal: look ?? pal,
  signal: signal,
  reading: reading,
);

void main() {
  group('What now?', () {
    test('overwhelmed: body first, water, quiet company — nothing else', () {
      final list = at(15, 0, state: NervousState.red);
      expect(list.map((s) => s.id), ['calm', 'water', 'sit-quiet']);
      expect(list.first.title, 'Take a 2-minute reset');
      expect(list.first.why, 'You said you’re overwhelmed. Body first; everything else can wait.');
      expect(list.first.action, isA<CalmAction>());
      final quiet = list.last.action as SitAction;
      expect((quiet.minutes, quiet.label, quiet.taskId), (10, '', null));
    });

    test('a bit off: two minutes on the next open task, in Pal’s talk style', () {
      final list = at(15, 0, state: NervousState.yellow);
      expect(list.map((s) => s.id), ['task:mvd-1', 'task:mvd-3', 'water', 'dump']);
      final first = list.first;
      expect(first.title, kPalTalk['Gentle']!.replaceFirst('{task}', '“Stay hydrated”'));
      expect(first.why, 'You’re a bit off, so the next thing on today’s list. Two minutes counts.');
      final sit = first.action as SitAction;
      expect((sit.minutes, sit.label, sit.taskId), (10, 'Stay hydrated', 'mvd-1'));
      expect(list[1].why, 'Another small one from today’s list.');
      // Another talk style, the same step.
      final q = at(15, 0, state: NervousState.yellow, look: nerdy).first;
      expect(q.title, kPalTalk['Nerdy']!.replaceFirst('{task}', '“Stay hydrated”'));
    });

    test('a bit off at night: rest counts as a step', () {
      final first = at(23, 10, state: NervousState.yellow).first;
      expect(first.id, 'dump');
      expect(first.title, 'Write down tomorrow’s first step, then stop');
      expect(first.why, 'It’s late and you’re a bit off. Rest counts as a step.');
      expect((first.action as OpenToolAction).tool, PalTool.dump);
    });

    test('a bit off with today’s list done: the smallest thing, or rest', () {
      final done = [task('mvd-1', 'Stay hydrated', done: true)];
      final list = at(15, 0, state: NervousState.yellow, list: done);
      expect(list.map((s) => s.id), ['smallest', 'water', 'dump']);
      expect(list.first.title, 'Pick the smallest thing you can do');
      expect((list.first.action as OpenToolAction).tool, PalTool.breakdown);
    });

    test('okay, an anchor in 25 minutes: one small thing, time called 5 min before', () {
      final lunch = anchor('a-1', 'Lunch', 12, 0);
      final first = at(11, 35, state: NervousState.green, anchors: [lunch]).first;
      expect(first.id, 'anchor:a-1');
      expect(first.title, 'One small thing before “Lunch”');
      expect(first.why, 'It starts in 25 min, so nothing big. I’ll call time 5 min before.');
      final sit = first.action as SitAction;
      expect((sit.minutes, sit.label, sit.anchorId), (20, 'Before Lunch', 'a-1'));
    });

    test('an anchor in 5 minutes: get ready (the clock follows the skin)', () {
      final lunch = anchor('a-1', 'Lunch', 12, 0);
      final classic = at(11, 55, anchors: [lunch]).first;
      expect(classic.title, 'Get ready for “Lunch”');
      expect(classic.why, 'It starts in 5 min, at 12:00 PM.');
      expect(classic.action, isA<AckAction>());
      expect(at(11, 55, anchors: [lunch], signal: true).first.why, 'It starts in 5 min, at 12:00.');
      expect(at(12, 0, anchors: [lunch], signal: true).first.why, 'It’s at 12:00, right about now.');
    });

    test('an anchor done today, or more than 30 minutes away, is not suggested', () {
      final done = anchor('a-1', 'Lunch', 12, 0, doneOn: today);
      expect(at(11, 50, anchors: [done]).first.id, isNot('anchor:a-1'));
      final later = anchor('a-2', 'Gym', 13, 0);
      expect(at(11, 50, anchors: [later]).map((s) => s.id), isNot(contains('anchor:a-2')));
    });

    test('okay with something half-read: 25 minutes of reading with Pal', () {
      final doc = DocumentSummary(
        id: 'd1',
        title: 'Correlation plenoptic imaging with entangled photons',
        status: 'ready',
        readingProgress: 0.38,
        lastReadAt: DateTime(2026, 11, 18),
      );
      final first = at(10, 0, state: NervousState.green, reading: doc).first;
      expect(first.id, 'read:d1');
      expect(
        first.title,
        palSay(pal, 'focus', {'task': '“Correlation plenoptic imaging with…”'}),
      );
      expect(first.why, 'A good window for focus. You left off at 38%.');
      final read = first.action as ReadAction;
      expect((read.minutes, read.document.id), (25, 'd1'));
      expect(read.label, 'Reading Correlation plenoptic imaging with entangled photons');
    });

    test('not checked in, nothing waiting, morning: empty your head, then pick one', () {
      final list = at(9, 0, list: const []);
      expect(list.map((s) => s.id), ['dump', 'smallest', 'water']);
      expect(list.first.title, 'Empty your head for two minutes');
      expect(list[1].title, 'Pick one small thing for today');
      // At night the dump comes first, worded for winding down.
      expect(at(23, 30, list: const []).first.title, 'Write down tomorrow’s first step, then stop');
    });

    test('never empty, never twice the same step', () {
      for (final state in [null, ...NervousState.values]) {
        for (final h in [0, 7, 13, 19, 22]) {
          final list = at(h, 0, state: state, anchors: [anchor('a', 'X', h, 10)]);
          expect(list, isNotEmpty);
          expect(list.map((s) => s.id).toSet().length, list.length);
        }
      }
    });

    test('the reading to suggest: the most recently read unfinished one', () {
      DocumentSummary d(String id, double p, int day) => DocumentSummary(
        id: id,
        title: id,
        status: 'ready',
        readingProgress: p,
        lastReadAt: DateTime(2026, 11, day),
      );
      expect(unfinishedReading([d('a', 0.5, 10), d('b', 0.2, 12), d('c', 1, 13), d('n', 0, 14)])?.id, 'b');
      expect(unfinishedReading([d('c', 1, 13)]), isNull);
    });

    test('night is 22:00–05:59', () {
      expect(partOfDay(DateTime(2026, 1, 1, 5, 59)), DayPart.night);
      expect(partOfDay(DateTime(2026, 1, 1, 6)), DayPart.morning);
      expect(partOfDay(DateTime(2026, 1, 1, 12)), DayPart.afternoon);
      expect(partOfDay(DateTime(2026, 1, 1, 18)), DayPart.evening);
      expect(partOfDay(DateTime(2026, 1, 1, 22)), DayPart.night);
    });
  });

  group('Break it down', () {
    test('the server’s own case: 3–7 clean steps of at most 12 words', () {
      // neuropal-backend/test/pal.test.js, "breakdown returns 3–7 clean steps".
      final steps = cleanSteps([
        '1. Open the file',
        '- write one sentence about the very long thing that goes on and on and on forever',
        '',
        'Step 3: Take a two minute break',
        'open the file!',
        {'text': '• Save it'},
        'Read it once',
        'Send it',
        'Celebrate',
        'One more',
      ]);
      expect(steps, [
        'Open the file',
        'Write one sentence about the very long thing that goes on',
        'Take a two minute break',
        'Save it',
        'Read it once',
        'Send it',
        'Celebrate',
      ]);
      expect(cleanSteps(['Just do it']), isNull);
      expect(cleanSteps('not a list'), isNull);
      expect(cleanSteps([{'step': 'a'}, {'title': 'b'}, {'text': '', 'step': 'c'}]), ['A', 'B', 'C']);
    });

    test('a step is never longer than a task title: what shows is what the day gets', () {
      // 12 words, 148 characters: within the word cap, over the day's 120.
      const long = 'Recalibrate the time-to-digital-converter coincidence windows before '
          'reacquiring correlation-plenoptic-imaging datasets using entangled photon-pairs';
      final steps = cleanSteps([long, 'Open the file', 'Save it'])!;
      expect(steps.first, cleanText(long, kTitleMax), reason: 'the day’s (and the server’s) cut');
      expect(
        steps.first,
        'Recalibrate the time-to-digital-converter coincidence windows before reacquiring '
        'correlation-plenoptic-imaging datasets',
      );
      expect(steps.first.length, lessThanOrEqualTo(kTitleMax));
    });

    test('offline steps: picked by the verb, else a start-small sequence', () {
      expect(localBreakdown('write the intro of my thesis').first, 'Open the document');
      expect(localBreakdown('read chapter 3').first, 'Open the reading at your page');
      expect(localBreakdown('email my supervisor').first, 'Open the message');
      expect(localBreakdown('clean the kitchen').first, 'Put on something to listen to');
      expect(localBreakdown('the paper').first, 'Get out what you need for it');
      for (final t in ['write', 'read', 'call mum', 'tax return', 'cook dinner', '???']) {
        final steps = localBreakdown(t);
        expect(steps.length, inInclusiveRange(3, 7), reason: t);
        for (final s in steps) {
          expect(s.split(' ').length, lessThanOrEqualTo(12), reason: s);
        }
      }
    });
  });

  test('the chat context: only what helps a short reply', () {
    final ctx = chatContext(
      state: NervousState.yellow,
      now: DateTime(2026, 11, 19, 12, 8),
      today: today,
      anchors: [
        anchor('a-0', 'Morning meds', 8, 0),
        anchor('a-1', 'Lunch break', 12, 30),
        anchor('a-2', 'Gym', 18, 0),
      ],
      tasks: tasks,
      pal: nerdy,
    );
    expect(ctx, {
      'state': 'yellow',
      'localTime': '12:08',
      'nextAnchor': {'title': 'Lunch break', 'at': '12:30', 'inMinutes': 22},
      'minimumDay': ['Stay hydrated', 'Walk'],
      'palName': 'Quark',
      'talkStyle': 'Nerdy',
      'people': true,
    });
    final none = chatContext(
      state: null,
      now: DateTime(2026, 11, 19, 23, 0),
      today: today,
      anchors: [anchor('a-0', 'Morning meds', 8, 0)],
      tasks: const [],
      pal: pal,
    );
    expect(none['state'], isNull);
    expect(none['nextAnchor'], isNull);
    expect(none['minimumDay'], isEmpty);
  });

  test('Sit with me counts in minutes, not seconds', () {
    const t = 1000000;
    expect(leftLabel(t, t), 'time’s up');
    expect(leftLabel(t, t + 5), 'time’s up');
    expect(leftLabel(t + 30000, t), 'under a minute left');
    expect(leftLabel(t + 61000, t), '2 min left');
    expect(leftLabel(t + 25 * 60000, t), '25 min left');
  });
}
