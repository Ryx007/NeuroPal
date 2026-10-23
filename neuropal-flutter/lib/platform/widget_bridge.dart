import 'dart:async';

import '../theme/appearance_controller.dart';
import 'ios_extras.dart';

/// Keeps the iOS widgets in step with the app: the current look (so the
/// widgets wear the same skin and accent) and the document being read.
/// Pushes are debounced; on Android, web and in tests this does nothing.
class WidgetBridge {
  WidgetBridge._();

  static final WidgetBridge instance = WidgetBridge._();

  Map<String, Object?>? _look;
  String? _readingId;
  String? _readingTitle;
  double? _readingProgress;
  Timer? _debounce;

  void attach(AppearanceController appearance) {
    if (!IosExtras.enabled) return;
    void sync() {
      final p = appearance.palette;
      _look = {
        'skin': p.skin,
        'palette': <String, String>{
          'surface': p.surface,
          'surfaceContainer': p.surfaceContainer,
          'onSurface': p.onSurface,
          'onSurfaceVariant': p.onSurfaceVariant,
          'outline': p.outline,
          'accentFill': p.accentFill,
          'accentInk': p.accentInk,
          'accentText': p.accentText,
          'line': p.line,
          'shadowColor': p.shadowColor,
        },
        'radius': p.shape.radius.toDouble(),
        'border': p.shape.border.toDouble(),
        'shadow': p.shape.shadow.toDouble(),
      };
      _schedule();
    }

    appearance.addListener(sync);
    sync();
  }

  void setReading({required String id, required String title, required double progress}) {
    if (!IosExtras.enabled) return;
    _readingId = id;
    _readingTitle = title;
    _readingProgress = progress;
    _schedule();
  }

  void _schedule() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), _push);
  }

  void _push() {
    final look = _look;
    if (look == null) return;
    unawaited(
      IosExtras.updateWidget(
        skin: look['skin']! as String,
        palette: look['palette']! as Map<String, String>,
        radius: look['radius'] as double?,
        border: look['border'] as double?,
        shadow: look['shadow'] as double?,
        readingId: _readingId,
        readingTitle: _readingTitle,
        readingProgress: _readingProgress,
      ),
    );
  }
}
