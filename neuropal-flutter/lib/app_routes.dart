// Route names and the drawer's navigation rule.
//
// Home is the root. The Library, the Reader, Settings and the calming steps
// are pushed on top of it, so Android's back button always leads back to
// Home. While the server needs a sign-in, Sign-in is the root instead
// (lib/app.dart); the calming steps can still be pushed on top of it.

import 'package:flutter/widgets.dart';

abstract final class AppRoutes {
  static const home = '/';
  static const library = '/library';
  static const reader = '/reader';
  static const settings = '/settings';
  static const calm = '/calm';
  static const signIn = '/sign-in';
}

/// Switches to a top-level destination. [from] is the screen we are on
/// (choosing it again does nothing).
void goToRoute(BuildContext context, String route, {String? from}) {
  if (from == route) return;
  final navigator = Navigator.of(context);
  navigator.popUntil((r) => r.isFirst);
  if (route != AppRoutes.home) navigator.pushNamed(route);
}
