// Route names and the drawer's navigation rule.
//
// The Library is the root. The Reader and Settings are pushed on top of it,
// so Android's back button always leads back to the Library.

import 'package:flutter/widgets.dart';

abstract final class AppRoutes {
  static const library = '/';
  static const reader = '/reader';
  static const settings = '/settings';
}

/// Switches to a top-level destination. [from] is the screen we are on
/// (choosing it again does nothing).
void goToRoute(BuildContext context, String route, {String? from}) {
  if (from == route) return;
  final navigator = Navigator.of(context);
  navigator.popUntil((r) => r.isFirst);
  if (route != AppRoutes.library) navigator.pushNamed(route);
}
