// Sign in to the NeuroPal server, or create an account on it.
//
// Shown INSTEAD of the app while the server needs a sign-in and there is no
// valid session (auth_controller.dart). It never appears for a single-user
// (LOCAL_MODE) server, and never just because the network is down.
//
// Accessibility: every field has a visible label (also its screen-reader
// name) and an autofill hint; a problem is written under the field it is
// about and announced (Android reads the field's error live region; iOS
// gets an announcement); the server's answer appears in a banner screen
// readers read out; every control is at least 48 dp.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../data/backend.dart';
import '../data/settings_controller.dart';
import '../settings/backend_section.dart';
import '../theme/np_style.dart';
import '../widgets/np_background.dart';
import '../widgets/np_banner.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_panel.dart';
import '../widgets/np_pressable.dart';
import '../widgets/np_scaffold.dart';
import '../widgets/np_sheet.dart';
import '../widgets/np_text.dart';
import 'auth_controller.dart';

final _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+$');

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _invite = TextEditingController();
  late final Map<AuthField, FocusNode> _focus = {
    for (final f in AuthField.values) f: FocusNode(),
  };

  bool _create = false;
  bool _showPassword = false;
  bool _busy = false;
  Map<AuthField, String> _errors = const {};

  /// The server's answer when it isn't about one field.
  AuthFailure? _failure;

  @override
  void initState() {
    super.initState();
    // After a session ended: the same account, most likely.
    final email = context.read<AuthController>().lastEmail;
    if (email != null) _email.text = email;
  }

  @override
  void dispose() {
    for (final c in [_name, _email, _password, _invite]) {
      c.dispose();
    }
    for (final f in _focus.values) {
      f.dispose();
    }
    super.dispose();
  }

  Map<AuthField, String> _validate({required bool create, required bool invite}) {
    final errors = <AuthField, String>{};
    final email = _email.text.trim();
    if (email.isEmpty) {
      errors[AuthField.email] = 'Enter your email address.';
    } else if (!_emailPattern.hasMatch(email)) {
      errors[AuthField.email] = 'That doesn’t look like an email address.';
    }
    final password = _password.text;
    if (password.isEmpty) {
      errors[AuthField.password] =
          create ? 'Choose a password.' : 'Enter your password.';
    } else if (create && password.length < 8) {
      errors[AuthField.password] = 'Use at least 8 characters.';
    } else if (password.length > 200) {
      errors[AuthField.password] = 'Use at most 200 characters.';
    }
    if (create && invite && _invite.text.trim().isEmpty) {
      errors[AuthField.inviteCode] = 'Enter the invite code.';
    }
    return errors;
  }

  Future<void> _submit() async {
    if (_busy) return;
    final auth = context.read<AuthController>();
    final config = auth.config;
    final create = _create && (config?.canRegister ?? true);
    final shown = {
      AuthField.email,
      AuthField.password,
      if (create) AuthField.name,
      if (create && (config == null || config.needsInvite)) AuthField.inviteCode,
    };
    final errors = _validate(
      create: create,
      invite: config?.needsInvite ?? false,
    );
    setState(() {
      _errors = errors;
      _failure = null;
    });
    if (errors.isNotEmpty) {
      // Field order, so the first problem on screen gets the focus.
      final first = AuthField.values.firstWhere(errors.containsKey);
      _focus[first]!.requestFocus();
      _announce(errors[first]!);
      return;
    }

    setState(() => _busy = true);
    final failure = create
        ? await auth.register(
            email: _email.text,
            password: _password.text,
            name: _name.text,
            inviteCode: _invite.text,
          )
        : await auth.signIn(email: _email.text, password: _password.text);
    if (!mounted) return;
    if (failure == null) {
      // Signed in: the app takes over from this screen (unless the server
      // changed meanwhile and wants its own sign-in). Offer to save the
      // password in the phone's password manager.
      TextInput.finishAutofillContext();
      setState(() => _busy = false);
      return;
    }
    // About a field on screen → under that field; anything else → banner.
    final field = shown.contains(failure.field) ? failure.field : null;
    setState(() {
      _busy = false;
      if (field != null) {
        _errors = {field: failure.message};
      } else {
        _failure = failure;
      }
    });
    if (field != null) {
      _focus[field]!.requestFocus();
      _announce(failure.message);
    }
    // Refused sign-up: the server's rules may have changed (e.g. closed).
    if (create && failure.field != AuthField.email) unawaited(auth.check());
  }

  /// Field errors are a live region on Android already (Flutter's own
  /// input decorator); iOS needs them announced.
  void _announce(String message) {
    if (MediaQuery.maybeSupportsAnnounceOf(context) ?? false) {
      unawaited(
        SemanticsService.sendAnnouncement(
          View.of(context),
          message,
          Directionality.of(context),
        ),
      );
    }
  }

  void _toggleMode() {
    setState(() {
      _create = !_create;
      _errors = const {};
      _failure = null;
    });
  }

  void _clearError(AuthField field) {
    if (!_errors.containsKey(field)) return;
    setState(() => _errors = Map.of(_errors)..remove(field));
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final auth = context.watch<AuthController>();
    final config = auth.config;
    final canCreate = config?.canRegister ?? true;
    final create = _create && canCreate;
    // Unknown rules (an older server): offer the code field, optional.
    final showInvite = create && (config == null || config.needsInvite);

    final bandIsDark =
        ThemeData.estimateBrightnessForColor(s.statusBand) == Brightness.dark;
    final top = MediaQuery.paddingOf(context).top;

    final String lead;
    if (!create) {
      lead =
          'Your library, reading progress and look are kept on your '
          'NeuroPal server. Sign in to pick up where you left off.';
    } else if (config?.needsInvite ?? false) {
      lead =
          'New accounts on this server need an invite code from the '
          'person who runs it.';
    } else {
      lead = 'Choose the email and password you’ll sign in with.';
    }

    final form = <Widget>[
      if (_failure != null) ...[
        _FailureBanner(failure: _failure!, creating: create),
        const SizedBox(height: 14),
      ],
      if (create) ...[
        _field(
          field: AuthField.name,
          controller: _name,
          label: 'Name (optional)',
          autofill: const [AutofillHints.name],
          capitalization: TextCapitalization.words,
          next: AuthField.email,
        ),
        const SizedBox(height: 14),
      ],
      _field(
        field: AuthField.email,
        controller: _email,
        label: 'Email',
        hint: 'you@example.com',
        keyboard: TextInputType.emailAddress,
        autofill: const [AutofillHints.email, AutofillHints.username],
        next: AuthField.password,
      ),
      const SizedBox(height: 14),
      _field(
        field: AuthField.password,
        controller: _password,
        label: 'Password',
        helper: create ? 'At least 8 characters.' : null,
        obscure: !_showPassword,
        autofill: [
          create ? AutofillHints.newPassword : AutofillHints.password,
        ],
        next: showInvite ? AuthField.inviteCode : null,
        suffix: _PasswordToggle(
          visible: _showPassword,
          onPressed: () => setState(() => _showPassword = !_showPassword),
        ),
      ),
      if (showInvite) ...[
        const SizedBox(height: 14),
        _field(
          field: AuthField.inviteCode,
          controller: _invite,
          label: config == null
              ? 'Invite code (if the server asks for one)'
              : 'Invite code',
        ),
      ],
      const SizedBox(height: 18),
      NpButton(
        label: _busy
            ? (create ? 'Creating your account…' : 'Signing in…')
            : (create ? 'Create account' : 'Sign in'),
        icon: _busy ? null : Icons.arrow_forward_rounded,
        expand: true,
        onPressed: _busy ? null : _submit,
      ),
    ];

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: (bandIsDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark)
          .copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: s.surface,
        body: Stack(
          children: [
            const Positioned.fill(child: NpBackground()),
            Column(
              children: [
                Container(height: top, color: s.statusBand),
                Expanded(
                  child: SafeArea(
                    top: false,
                    child: Center(
                      child: SingleChildScrollView(
                        keyboardDismissBehavior:
                            ScrollViewKeyboardDismissBehavior.onDrag,
                        padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 460),
                          child: AutofillGroup(
                            // Only a successful sign-in offers to save the
                            // password (see _submit), never leaving early.
                            onDisposeAction: AutofillContextAction.cancel,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const NpBrand(),
                                const SizedBox(height: 26),
                                NpLabel(create ? 'New account' : 'Account'),
                                const SizedBox(height: 6),
                                Semantics(
                                  header: true,
                                  child: Text(
                                    create ? 'Create an account' : 'Sign in',
                                    style: s.isSignal
                                        ? s.fonts.display(40, s.text)
                                        : s.fonts.display(32, s.text),
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  lead,
                                  style: s.fonts.body(15, s.textMuted),
                                ),
                                const SizedBox(height: 18),
                                if (auth.notice != null && !create) ...[
                                  NpBanner(
                                    icon: Icons.lock_clock_outlined,
                                    title: auth.notice!,
                                  ),
                                  const SizedBox(height: 14),
                                ],
                                NpPanel(
                                  padding: const EdgeInsets.fromLTRB(
                                    16,
                                    16,
                                    16,
                                    18,
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: form,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                if (canCreate)
                                  Center(
                                    child: NpButton(
                                      label: create
                                          ? 'I already have an account'
                                          : 'Create an account',
                                      kind: NpButtonKind.ghost,
                                      minHeight: 48,
                                      onPressed: _busy ? null : _toggleMode,
                                    ),
                                  )
                                else
                                  Text(
                                    'This server isn’t taking new accounts.',
                                    textAlign: TextAlign.center,
                                    style: s.fonts.body(14, s.textMuted),
                                  ),
                                const SizedBox(height: 28),
                                const _ServerPanel(),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _field({
    required AuthField field,
    required TextEditingController controller,
    required String label,
    String? hint,
    String? helper,
    TextInputType? keyboard,
    Iterable<String>? autofill,
    TextCapitalization capitalization = TextCapitalization.none,
    bool obscure = false,
    Widget? suffix,
    AuthField? next,
  }) {
    final s = NpStyle.of(context);
    return TextField(
      controller: controller,
      focusNode: _focus[field],
      keyboardType: keyboard,
      autofillHints: autofill,
      textCapitalization: capitalization,
      obscureText: obscure,
      autocorrect: false,
      enableSuggestions: field == AuthField.name,
      textInputAction: next == null ? TextInputAction.done : TextInputAction.next,
      style: s.fonts.body(16, s.text),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        helperText: helper,
        helperStyle: s.fonts.body(13, s.textMuted),
        helperMaxLines: 3,
        errorText: _errors[field],
        errorStyle: s.fonts.body(13.5, s.error, weight: FontWeight.w600),
        errorMaxLines: 3,
        suffixIcon: suffix,
      ),
      onChanged: (_) => _clearError(field),
      onSubmitted: (_) {
        if (next == null) {
          unawaited(_submit());
        } else {
          _focus[next]!.requestFocus();
        }
      },
    );
  }
}

/// Show / hide the password. The app's pressable (label, focus ring,
/// 48 dp) without NpIconButton's Signal fill, which would cover the
/// field's border.
class _PasswordToggle extends StatelessWidget {
  const _PasswordToggle({required this.visible, required this.onPressed});

  final bool visible;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final label = visible ? 'Hide password' : 'Show password';
    return NpPressable(
      onTap: onPressed,
      semanticLabel: label,
      tooltip: label,
      focusRadius: 24,
      minSize: const Size(48, 48),
      builder: (context, pressed, focused) => Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: pressed ? s.accentGlow : Colors.transparent,
        ),
        child: Icon(
          visible ? Icons.visibility_off_outlined : Icons.visibility_outlined,
          size: 22,
          color: s.isSignal ? s.text : s.accentText,
        ),
      ),
    );
  }
}

/// The server's answer to a failed attempt, read out by screen readers.
class _FailureBanner extends StatelessWidget {
  const _FailureBanner({required this.failure, required this.creating});

  final AuthFailure failure;
  final bool creating;

  @override
  Widget build(BuildContext context) {
    final wait = failure.retryAfter;
    var message = failure.message;
    if (wait != null) {
      final at = TimeOfDay.fromDateTime(DateTime.now().add(wait));
      message = '$message You can try again at ${at.format(context)}.';
    }
    return NpBanner(
      title: creating ? 'Couldn’t create the account' : 'Couldn’t sign in',
      message: message,
    );
  }
}

/// Which server this is and whether it answers — plus the ways out: another
/// address (the Settings connection panel, in a sheet) or the demo library.
class _ServerPanel extends StatelessWidget {
  const _ServerPanel();

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final backend = context.watch<Backend>();
    final active = backend.active;
    final String line;
    switch (backend.state) {
      case BackendState.checking:
        line = 'Checking the connection…';
      case BackendState.online:
        final host = Uri.tryParse(active!.base)?.host ?? active.base;
        line = '${active.label} · $host';
      case BackendState.offline:
        line = 'No server answers right now';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          container: true,
          label: 'Server: $line',
          excludeSemantics: true,
          child: Row(
            children: [
              Led(on: backend.isOnline),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const NpLabel('Server'),
                    const SizedBox(height: 2),
                    Text(line, style: s.fonts.mono(13, s.textMuted)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            NpButton(
              label: 'Change server',
              icon: Icons.dns_outlined,
              kind: NpButtonKind.ghost,
              minHeight: 48,
              onPressed: () => showNpSheet<void>(
                context,
                title: 'Backend connection',
                builder: (_) => const SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(18, 4, 18, 20),
                  child: BackendConnectionBody(),
                ),
              ),
            ),
            NpButton(
              label: 'Try the demo library',
              icon: Icons.science_outlined,
              kind: NpButtonKind.ghost,
              minHeight: 48,
              semanticLabel: 'Try the demo library (offline, no account)',
              onPressed: () =>
                  context.read<SettingsController>().setDemoMode(true),
            ),
          ],
        ),
      ],
    );
  }
}
