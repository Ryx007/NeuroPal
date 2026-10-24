// The Library's state: the document list, loading and error status.
//
// While any document is still being processed on the backend (pending →
// parsing → chunking → embedding), the list refreshes itself every few
// seconds so statuses move on their own, like the Expo library.

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../data/backend.dart';
import '../data/models.dart';
import '../services.dart';

class LibraryController extends ChangeNotifier {
  LibraryController(this.services) {
    _demo = services.settings.demoMode;
    _wasOnline = services.backend.isOnline;
    services.settings.addListener(_onSettingsChanged);
    services.backend.addListener(_onBackendChanged);
  }

  final AppServices services;

  static const pollInterval = Duration(seconds: 4);

  List<DocumentSummary> _docs = const [];
  bool _loading = false;
  bool _loadedOnce = false;
  ApiException? _error;
  Timer? _poll;
  late bool _demo;
  late bool _wasOnline;
  bool _disposed = false;

  /// Bumped by [clear]: answers to loads started before it are dropped.
  int _epoch = 0;

  List<DocumentSummary> get documents => _docs;
  bool get loading => _loading;

  /// True after the first load attempt finished (successfully or not).
  bool get loadedOnce => _loadedOnce;
  ApiException? get error => _error;
  bool get isDemo => services.settings.demoMode;

  /// Loads the list. [quiet] refreshes keep the current list on screen and
  /// don't show the loading state (used by the background poll).
  Future<void> refresh({bool quiet = false}) async {
    if (_loading) {
      _reloadPending = true; // e.g. demo toggled mid-load: load again after
      return;
    }
    _loading = true;
    final epoch = _epoch;
    if (!quiet) _notify();
    final source = services.source;
    List<DocumentSummary>? docs;
    ApiException? error;
    try {
      docs = await source.listDocuments();
    } on ApiException catch (e) {
      error = e;
    }
    // Cleared meanwhile (signed out): this answer belongs to the old session.
    if (epoch != _epoch) return;
    _loading = false;
    _loadedOnce = true;
    if (source == services.source) {
      if (docs != null) {
        _docs = docs;
        _error = null;
      } else {
        _error = error;
        if (!quiet) _docs = const [];
      }
    }
    if (_reloadPending || source != services.source) {
      _reloadPending = false;
      unawaited(refresh());
      return;
    }
    _schedulePoll();
    _notify();
  }

  bool _reloadPending = false;

  /// Forgets the list (the session ended): the next person to sign in
  /// never sees it, and the next Library visit loads afresh.
  void clear() {
    _epoch++;
    _poll?.cancel();
    _poll = null;
    _docs = const [];
    _error = null;
    _loading = false;
    _loadedOnce = false;
    _reloadPending = false;
    _notify();
  }

  void _schedulePoll() {
    final needed =
        !isDemo && _error == null && _docs.any((d) => d.isProcessing);
    if (needed && _poll == null) {
      _poll = Timer.periodic(pollInterval, (_) => refresh(quiet: true));
    } else if (!needed) {
      _poll?.cancel();
      _poll = null;
    }
  }

  void _onSettingsChanged() {
    if (services.settings.demoMode == _demo) return;
    _demo = services.settings.demoMode;
    _docs = const [];
    _error = null;
    unawaited(refresh());
  }

  void _onBackendChanged() {
    final online = services.backend.isOnline;
    // Came back online after a failure: reload without being asked.
    if (online && !_wasOnline && !isDemo && (_error != null || _docs.isEmpty)) {
      unawaited(refresh());
    }
    _wasOnline = online;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _poll?.cancel();
    services.settings.removeListener(_onSettingsChanged);
    services.backend.removeListener(_onBackendChanged);
    super.dispose();
  }
}
