// Talk and Break it down through the server, and the brain dump:
//   * a crisis-sounding message or task sends NO request (checked on the
//     fake client) and gets the careful reply; the server's own crisis
//     answer is passed on the same way;
//   * the chat keeps the last 30 messages (the sheet shows 10), across a
//     restart; "Clear chat" deletes the server's copy too;
//   * a failed answer is worded in Pal's voice; an answer that arrives
//     after the session ended is dropped.
// (The brain dump is part of the day: test/day_store_test.dart.)

import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neuropal/data/backend.dart';
import 'package:neuropal/day/day_models.dart';
import 'package:neuropal/day/day_store.dart';
import 'package:neuropal/pal/crisis.dart';
import 'package:neuropal/pal/pal_api.dart';
import 'package:neuropal/pal/pal_controller.dart';
import 'package:neuropal/pal/pal_logic.dart';
import 'package:neuropal/pal/pal_models.dart';
import 'package:neuropal/theme/pal.dart';
import 'package:neuropal/theme/tokens.g.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

class _NoTimer implements Timer {
  @override
  void cancel() {}
  @override
  bool get isActive => false;
  @override
  int get tick => 0;
}

late SharedPreferences prefs;
late List<http.Request> requests;
DateTime now = DateTime(2026, 11, 19, 12, 8);

List<http.Request> palRequests() => [
  for (final r in requests)
    if (r.url.path.startsWith('/api/pal/')) r,
];

Future<(PalController, DayStore)> boot({
  Map<String, Handler> routes = const {},
  http.Client? client,
  Duration delay = Duration.zero,
}) async {
  final backend = Backend(
    prefs: prefs,
    client: client ?? fakeBackend(routes: routes, requests: requests, delay: delay),
  );
  final day = DayStore(prefs: prefs, clock: () => now);
  final pal = PalController(
    prefs: prefs,
    day: day,
    api: PalApi(backend),
    look: () => normalizePal({'name': 'Quark', 'talk': 'Nerdy'}),
    timer: (_, _) => _NoTimer(),
  );
  addTearDown(pal.dispose);
  return (pal, day);
}

http.Response reply(String text, {bool crisis = false}) =>
    jsonResponse({'reply': text, 'crisis': crisis, 'provider': 'stub', 'model': 'stub-1'});

final nerdy = kPalLines['Nerdy']!;
const ctx = <String, Object?>{'state': null};

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    requests = [];
  });

  group('Talk', () {
    test('a crisis-sounding message is never sent: the careful reply, on the phone', () async {
      final (pal, _) = await boot(routes: {'POST /api/pal/chat': (_) => reply('should never be asked')});
      for (final m in ['I want to  die', 'kill\tmyself', 'voglio morire', 'I don’t want to be alive anymore']) {
        final r = await pal.sendChat(m, context: ctx);
        expect(r!.crisis, isTrue, reason: m);
        expect(r.local, isTrue);
        expect(r.text, kCrisisReply);
        expect(r.text, contains('local emergency number'));
      }
      expect(palRequests(), isEmpty, reason: 'nothing reached the server');
      expect(pal.chat.where((c) => !c.fromPal).map((c) => c.text).first, 'I want to die');
      expect(pal.chat.where((c) => c.crisis), hasLength(4));
    });

    test('the API itself refuses to send one too (no caller can get past it)', () async {
      final (pal, _) = await boot(routes: {'POST /api/pal/chat': (_) => reply('no')});
      final r = await pal.api.chat('honestly i might kms tonight', const {});
      expect((r.crisis, r.local, r.text), (true, true, kCrisisReply));
      final b = await pal.api.breakdown('I took all my pills');
      expect((b.crisis, b.reply), (true, kCrisisReply));
      expect(b.steps, isEmpty);
      expect(palRequests(), isEmpty);
    });

    test('a reply from the server, with today’s plan as the context', () async {
      final (pal, _) = await boot(routes: {'POST /api/pal/chat': (_) => reply('  Two minutes on the meds first.  ')});
      final context = chatContext(
        state: NervousState.yellow,
        now: now,
        today: '2026-11-19',
        anchors: const [],
        tasks: const [],
        pal: normalizePal({'name': 'Quark', 'talk': 'Nerdy'}),
      );
      final r = await pal.sendChat('What should I do first?', context: context);
      expect(r!.text, 'Two minutes on the meds first.');
      expect((r.fromPal, r.crisis, r.local), (true, false, false));
      final body = jsonDecode(palRequests().single.body) as Map;
      expect(body['message'], 'What should I do first?');
      expect(body['context'], {
        'state': 'yellow',
        'localTime': '12:08',
        'nextAnchor': null,
        'minimumDay': <String>[],
        'palName': 'Quark',
        'talkStyle': 'Nerdy',
        'people': true,
      });
    });

    test('the server’s own crisis answer is shown as a crisis', () async {
      final (pal, _) = await boot(routes: {'POST /api/pal/chat': (_) => reply('Careful words.', crisis: true)});
      final r = await pal.sendChat('a phrasing only the server knows', context: ctx);
      expect((r!.crisis, r.local, r.text), (true, false, 'Careful words.'));
    });

    test('keeps the last 30 messages, also after a restart', () async {
      var n = 0;
      final (pal, _) = await boot(routes: {'POST /api/pal/chat': (_) => reply('Reply ${++n}')});
      for (var i = 1; i <= 20; i++) {
        await pal.sendChat('Message $i', context: ctx);
      }
      expect(pal.chat, hasLength(kChatKeep));
      expect(pal.chat.first.text, 'Message 6');
      expect(pal.chat.last.text, 'Reply 20');
      final (again, _) = await boot();
      expect(again.chat.map((c) => c.text), pal.chat.map((c) => c.text));
      expect(kChatShown, 10);
    });

    test('a failed answer in Pal’s voice: offline, slow or failing, too much chat', () async {
      final (offline, _) = await boot(client: offlineBackend());
      expect((await offline.sendChat('hi', context: ctx))!.text, nerdy['talkOffline']);

      final (failing, _) = await boot(routes: {'POST /api/pal/chat': (_) => jsonResponse({'error': 'boom'}, 502)});
      final r = await failing.sendChat('hi', context: ctx);
      expect((r!.text, r.local), (nerdy['talkError'], true));

      final (busy, _) = await boot(
        routes: {
          'POST /api/pal/chat': (_) => jsonResponse({
            'error': 'That’s a lot of chat for one hour. Let’s pause here; the other tools still work.',
            'retryAfterSec': 600,
          }, 429),
        },
      );
      expect(
        (await busy.sendChat('hi', context: ctx))!.text,
        'That’s a lot of chat for one hour. Let’s pause here; the other tools still work.',
      );

      final (empty, _) = await boot(routes: {'POST /api/pal/chat': (_) => reply('   ')});
      expect((await empty.sendChat('hi', context: ctx))!.text, nerdy['talkError']);
    });

    test('an answer that arrives after the session ended is dropped', () async {
      final (pal, _) = await boot(
        routes: {'POST /api/pal/chat': (_) => reply('for the old session')},
        delay: const Duration(milliseconds: 50),
      );
      final pending = pal.sendChat('hello', context: ctx);
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(pal.sending, isTrue);
      pal.forgetSession(endSit: true);
      expect(await pending, isNull);
      expect(pal.chat, isEmpty);
      expect(pal.sending, isFalse);
    });

    test('Clear chat forgets it here and asks the server to forget its copy', () async {
      final (pal, _) = await boot(
        routes: {
          'POST /api/pal/chat': (_) => reply('Hi.'),
          'DELETE /api/pal/chat': (_) => jsonResponse({'deleted': 2}),
        },
      );
      await pal.sendChat('hello', context: ctx);
      expect(await pal.clearChat(), isTrue);
      expect(pal.chat, isEmpty);
      expect(palRequests().last.method, 'DELETE');
      expect(palRequests().last.url.path, '/api/pal/chat');

      final (offline, _) = await boot(client: offlineBackend());
      await offline.sendChat('x', context: ctx);
      expect(await offline.clearChat(), isFalse, reason: 'the server copy stays until it can be reached');
      expect(offline.chat, isEmpty);
    });
  });

  group('Break it down', () {
    test('the server’s steps, cleaned', () async {
      final (pal, _) = await boot(
        routes: {
          'POST /api/pal/breakdown': (_) => jsonResponse({
            'steps': ['1. Open the file', 'Read one page', '- Write one line'],
          }),
        },
      );
      final r = await pal.api.breakdown('  read the paper ');
      expect((r.crisis, r.offline), (false, null));
      expect(r.steps, ['Open the file', 'Read one page', 'Write one line']);
      expect(jsonDecode(palRequests().single.body), {'task': 'read the paper'});
    });

    test('the server’s crisis answer becomes the careful reply, not steps', () async {
      final (pal, _) = await boot(
        routes: {'POST /api/pal/breakdown': (_) => jsonResponse({'steps': [], 'crisis': true, 'reply': 'Careful.'})},
      );
      final r = await pal.api.breakdown('something only the server catches');
      expect((r.crisis, r.reply), (true, 'Careful.'));
      expect(r.steps, isEmpty);
    });

    test('without good steps from the server, Pal’s offline steps and the reason', () async {
      final cases = <(Map<String, Handler>?, OfflineReason)>[
        ({'POST /api/pal/breakdown': (_) => jsonResponse({'error': 'unusable'}, 502)}, OfflineReason.error),
        ({'POST /api/pal/breakdown': (_) => jsonResponse({'steps': ['Just do it']})}, OfflineReason.error),
        ({'POST /api/pal/breakdown': (_) => jsonResponse({'error': 'a lot'}, 429)}, OfflineReason.limited),
        (null, OfflineReason.offline),
      ];
      for (final (routes, reason) in cases) {
        final (pal, _) = routes == null ? await boot(client: offlineBackend()) : await boot(routes: routes);
        final r = await pal.api.breakdown('write the intro of my thesis');
        expect(r.offline, reason);
        expect(r.steps.first, 'Open the document');
      }
      expect(OfflineReason.offline.note, 'No server right now, so these are Pal’s offline steps.');
      expect(OfflineReason.quick.note, 'Quick steps, made on your phone.');
    });
  });

}
