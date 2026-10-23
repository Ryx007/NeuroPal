// Screen chrome shared by every screen: background, the status-bar band,
// the glass header bar and the left navigation drawer (NeuroPal never uses
// bottom tabs — a locked design directive).

import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/np_style.dart';
import 'np_background.dart';
import 'np_buttons.dart';
import 'np_drawer.dart';
import 'np_text.dart';

class NpScaffold extends StatelessWidget {
  const NpScaffold({
    super.key,
    required this.route,
    required this.header,
    required this.body,
    this.bottom,
  });

  /// The route name of this screen (marks it in the drawer).
  final String route;
  final Widget header;
  final Widget body;

  /// Optional bar under the body (e.g. the "now playing" bar).
  final Widget? bottom;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final bandIsDark =
        ThemeData.estimateBrightnessForColor(s.statusBand) == Brightness.dark;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: (bandIsDark
              ? SystemUiOverlayStyle.light
              : SystemUiOverlayStyle.dark)
          .copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: s.surface,
        drawer: NpDrawer(current: route),
        body: Stack(
          children: [
            const Positioned.fill(child: NpBackground()),
            Column(
              children: [
                header,
                Expanded(child: body),
                ?bottom, // `?` = only when there is one
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// The top bar: status band + glass bar with a menu button, a title and
/// actions on the right.
class NpHeader extends StatelessWidget {
  const NpHeader({super.key, required this.title, this.actions = const []});

  final Widget title;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final top = MediaQuery.paddingOf(context).top;
    final border = s.isSignal
        ? BorderSide(color: s.line, width: s.borderWidth)
        : BorderSide(color: s.line.withValues(alpha: 0.5));
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(height: top, color: s.statusBand),
        ClipRect(
          child: BackdropFilter(
            filter: ui.ImageFilter.blur(sigmaX: s.blurSigma, sigmaY: s.blurSigma),
            child: Container(
              constraints: const BoxConstraints(minHeight: 60),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: s.panel,
                border: Border(bottom: border),
              ),
              child: Row(
                children: [
                  const NpMenuButton(),
                  const SizedBox(width: 10),
                  Expanded(child: title),
                  for (final a in actions) ...[const SizedBox(width: 8), a],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Opens the navigation drawer.
class NpMenuButton extends StatelessWidget {
  const NpMenuButton({super.key});

  @override
  Widget build(BuildContext context) {
    return NpIconButton(
      icon: Icons.menu_rounded,
      semanticLabel: 'Open navigation',
      onPressed: () => Scaffold.maybeOf(context)?.openDrawer(),
    );
  }
}

/// The NeuroPal wordmark (Library header).
class NpBrand extends StatelessWidget {
  const NpBrand({super.key, this.live = false});

  final bool live;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Semantics(
      header: true,
      label: 'NeuroPal',
      excludeSemantics: true,
      child: Row(
        children: [
          Led(live: live),
          const SizedBox(width: 9),
          Flexible(
            child: Text(
              s.isSignal ? 'NEUROPAL' : 'NeuroPal',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: s.isSignal
                  ? s.fonts
                        .display(21, s.text)
                        .copyWith(letterSpacing: 21 * 0.04)
                  : s.fonts.display(19, s.accentText),
            ),
          ),
        ],
      ),
    );
  }
}

/// A screen title for the header (e.g. "Settings").
class NpHeaderTitle extends StatelessWidget {
  const NpHeaderTitle(this.text, {super.key, this.overline});

  final String text;
  final String? overline;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Semantics(
      header: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (overline != null) NpLabel(overline!, size: 10),
          Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: s.isSignal
                ? s.fonts.display(21, s.text)
                : s.fonts.display(19, s.text),
          ),
        ],
      ),
    );
  }
}
