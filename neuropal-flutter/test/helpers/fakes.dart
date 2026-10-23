// Test doubles: a scriptable speech engine and an in-memory backend.

import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:neuropal/data/settings_controller.dart';
import 'package:neuropal/reader/speech_engine.dart';

/// A speech engine the test drives by hand: it records what it was asked
/// to say, and the test fires the engine's events (start, ranges, done).
class FakeSpeechEngine extends SpeechEngine {
  final List<String> spoken = [];
  int stops = 0;
  double? rate;
  double? pitch;
  VoiceChoice? voice;
  List<TtsVoice> voiceList = const [
    TtsVoice(name: 'en-us-x-iol-local', locale: 'en-US', quality: 'very high'),
    TtsVoice(name: 'it-it-x-kda-local', locale: 'it-IT', quality: 'high'),
  ];

  String get last => spoken.last;

  @override
  Future<void> init() async {}

  @override
  Future<void> setRate(double rate) async => this.rate = rate;

  @override
  Future<void> setPitch(double pitch) async => this.pitch = pitch;

  @override
  Future<void> setVoice(VoiceChoice? voice) async => this.voice = voice;

  @override
  Future<void> speak(String text) async => spoken.add(text);

  @override
  Future<void> stop() async => stops++;

  @override
  Future<List<TtsVoice>> voices() async => voiceList;

  // ---- events, fired by the test ----
  void fireStart() => onStart?.call();
  void fireComplete() => onComplete?.call();
  void fireRange(int start, int end, {String? text}) =>
      onProgress?.call(text ?? last, start, end);
  void fireError(String message) => onError?.call(message);
}

/// The JSON answer the backend's /healthz gives.
final _healthy = jsonEncode({'status': 'ok', 'uptime': 12.5});

/// A MockClient that serves [routes] (path → handler) on [reachableHosts]
/// and refuses connections to every other host.
http.Client fakeBackend({
  Set<String> reachableHosts = const {'ryx-mac-mini.tail73ed8.ts.net'},
  Map<String, http.Response Function(http.Request)> routes = const {},
  Duration delay = Duration.zero,
}) {
  return MockClient((request) async {
    if (delay > Duration.zero) await Future<void>.delayed(delay);
    if (!reachableHosts.contains(request.url.host)) {
      throw http.ClientException('Connection refused', request.url);
    }
    if (request.url.path == '/healthz') return http.Response(_healthy, 200);
    final key = '${request.method} ${request.url.path}';
    final handler = routes[key];
    if (handler != null) return handler(request);
    return http.Response(jsonEncode({'error': 'not found: $key'}), 404);
  });
}

/// A client for which every host is unreachable.
http.Client offlineBackend() => MockClient(
  (request) async => throw http.ClientException('Connection refused', request.url),
);

http.Response jsonResponse(Object? body, [int status = 200]) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
