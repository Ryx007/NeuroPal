// Reads out what Pal says by itself — Sit with me's halfway question and its
// end — on whatever screen is open (it sits above the navigator, once). A
// line said while no screen reader listens is simply not spoken.

import 'dart:async';

import 'package:flutter/semantics.dart';
import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import 'pal_controller.dart';

class PalNewsReader extends StatefulWidget {
  const PalNewsReader({super.key, required this.child});

  final Widget child;

  @override
  State<PalNewsReader> createState() => _PalNewsReaderState();
}

class _PalNewsReaderState extends State<PalNewsReader> {
  PalController? _pal;
  int _spoken = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final pal = context.read<PalController>();
    if (pal == _pal) return;
    _pal?.removeListener(_onPal);
    _pal = pal..addListener(_onPal);
    _spoken = pal.news?.id ?? 0;
  }

  @override
  void dispose() {
    _pal?.removeListener(_onPal);
    super.dispose();
  }

  void _onPal() {
    final news = _pal?.news;
    if (news == null || news.id == _spoken || !mounted) return;
    _spoken = news.id;
    if (MediaQuery.maybeSupportsAnnounceOf(context) ?? false) {
      unawaited(
        SemanticsService.sendAnnouncement(
          View.of(context),
          news.text,
          Directionality.maybeOf(context) ?? TextDirection.ltr,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
