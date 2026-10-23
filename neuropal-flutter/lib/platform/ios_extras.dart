import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';

/// The Dart side of the iOS-only extras (ios/Runner/NeuroPalIOSExtras.swift):
/// Home/Lock Screen widgets and the focus Live Activity.
///
/// Every call is a silent no-op on Android, web and tests, and never throws:
/// widgets are a nicety, they must not break the app.
class IosExtras {
  IosExtras._();

  static const MethodChannel _channel = MethodChannel('io.neuropal/ios_extras');

  /// True only on iOS; everything here is a no-op elsewhere (and in tests).
  static bool get enabled => !kIsWeb && Platform.isIOS;
  static bool get _enabled => enabled;

  /// Share the latest look + state + reading position with the widgets.
  /// Keys match `SharedStore.Snapshot` in the widget extension; any key may
  /// be left out (the widget falls back field by field).
  static Future<void> updateWidget({
    required String skin,
    required Map<String, String> palette,
    double? radius,
    double? border,
    double? shadow,
    String? state,
    String? readingId,
    String? readingTitle,
    double? readingProgress,
    String? palName,
  }) async {
    if (!_enabled) return;
    final snapshot = <String, Object?>{
      'skin': skin,
      'palette': palette,
      'radius': ?radius,
      'border': ?border,
      'shadow': ?shadow,
      'state': ?state,
      'readingId': ?readingId,
      'readingTitle': ?readingTitle,
      'readingProgress': ?readingProgress,
      'palName': ?palName,
    };
    try {
      await _channel.invokeMethod<void>('updateWidget', jsonEncode(snapshot));
    } on Object {
      // No widget extension on this build — fine.
    }
  }

  /// A check-in tapped on the Home Screen widget since the app last looked
  /// ("green" / "yellow" / "red"), or null. Reading it clears it.
  static Future<String?> takePendingState() async {
    if (!_enabled) return null;
    try {
      return await _channel.invokeMethod<String>('takePendingState');
    } on Object {
      return null;
    }
  }

  /// Show a focus block on the Lock Screen / Dynamic Island (iOS 16.2+).
  /// Returns false when Live Activities are off or unsupported.
  static Future<bool> startFocus({required String title, required DateTime endsAt, String phase = 'work'}) async {
    if (!_enabled) return false;
    try {
      return await _channel.invokeMethod<bool>('startFocus', {
            'title': title,
            'endsAtMs': endsAt.millisecondsSinceEpoch,
            'phase': phase,
          }) ??
          false;
    } on Object {
      return false;
    }
  }

  static Future<void> updateFocus({required DateTime endsAt, String phase = 'work'}) async {
    if (!_enabled) return;
    try {
      await _channel.invokeMethod<void>('updateFocus', {'endsAtMs': endsAt.millisecondsSinceEpoch, 'phase': phase});
    } on Object {
      // ignore
    }
  }

  static Future<void> endFocus() async {
    if (!_enabled) return;
    try {
      await _channel.invokeMethod<void>('endFocus');
    } on Object {
      // ignore
    }
  }
}
