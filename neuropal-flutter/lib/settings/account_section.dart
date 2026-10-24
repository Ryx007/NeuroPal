// Settings → Account: who is signed in on the current server, and Sign out.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../auth/auth_controller.dart';
import '../data/backend.dart';
import '../reader/reader_controller.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import 'settings_section.dart';

class AccountSection extends StatelessWidget {
  const AccountSection({super.key});

  /// Stops listening and saves the resume point while the session still
  /// works, then forgets the session (the app shows sign-in).
  static Future<void> _signOut(BuildContext context) async {
    final reader = context.read<ReaderController>();
    final auth = context.read<AuthController>();
    await reader.close();
    await auth.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final auth = context.watch<AuthController>();
    final backend = context.watch<Backend>();
    final where = backend.candidates
            .where((c) => c.base == auth.server)
            .firstOrNull
            ?.label ??
        'this server';
    final user = auth.user;

    final String title;
    final String detail;
    switch (auth.status) {
      case AuthStatus.open:
        title = 'No sign-in needed';
        detail =
            '$where is a single-user server: everything on it is yours, '
            'without an account.';
      case AuthStatus.signedIn:
        final who = user?.email ?? user?.name;
        title = who == null ? 'Signed in' : 'Signed in as $who';
        detail = user == null
            ? 'On $where. It can’t be reached right now to check the '
                  'account; your session stays saved on this phone.'
            : 'On $where. Your session is saved securely on this phone.';
      case AuthStatus.signedOut:
        // Only visible with the demo library on (otherwise the sign-in
        // screen covers Settings).
        title = 'Not signed in';
        detail =
            '$where needs a sign-in. The demo library works without one; '
            'turn it off to sign in.';
      case AuthStatus.unknown:
        title = auth.checking ? 'Checking your account…' : 'Not checked yet';
        detail = auth.checking
            ? 'Asking the server.'
            : 'No server answers right now, so the account can’t be '
                  'checked.';
    }

    return SettingsSection(
      title: 'Account',
      children: [
        Semantics(
          liveRegion: true,
          container: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: s.fonts.body(15, s.text, weight: FontWeight.w700),
              ),
              const SizedBox(height: 2),
              Text(detail, style: s.fonts.body(13.5, s.textMuted)),
            ],
          ),
        ),
        if (auth.status == AuthStatus.signedIn) ...[
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: NpButton(
              label: 'Sign out',
              icon: Icons.logout_rounded,
              kind: NpButtonKind.ghost,
              minHeight: 48,
              semanticLabel: 'Sign out of $where',
              onPressed: () => _signOut(context),
            ),
          ),
        ],
      ],
    );
  }
}
