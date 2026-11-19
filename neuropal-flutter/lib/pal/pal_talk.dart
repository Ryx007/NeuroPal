// "Talk": a short chat with Pal (POST /api/pal/chat). The last 10 messages
// show (30 are kept); the field is docked under them. While overwhelmed, a
// line that can't scroll away points to the calming steps (on a sheet too
// short for that, it sits right above the field instead).
//
// CRISIS SAFETY: every message is checked on the phone first. One that
// sounds like a crisis is never sent: Pal answers here with the careful
// reply, the way to the calming steps and people to call, and a screen
// reader hears it straight away. The server's own crisis answer is shown
// the same way. Replies from the server are shown as plain text.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../day/day_models.dart';
import '../day/day_store.dart';
import '../theme/np_style.dart';
import '../theme/pal.dart';
import '../widgets/np_buttons.dart';
import 'crisis.dart';
import 'pal_bits.dart';
import 'pal_controller.dart';
import 'pal_logic.dart';
import 'pal_models.dart';

class PalTalkPanel extends StatefulWidget {
  const PalTalkPanel({super.key, required this.pal, required this.onCalm});

  final PalSettings pal;
  final VoidCallback onCalm;

  @override
  State<PalTalkPanel> createState() => _PalTalkPanelState();
}

class _PalTalkPanelState extends State<PalTalkPanel> {
  final _draft = TextEditingController();
  final _field = FocusNode();
  final _scroll = ScrollController();
  bool _confirmClear = false;
  String? _cleared;
  int _seen = -1;
  double? _room;

  /// On the help under the newest message when that is Pal's careful reply.
  final _help = GlobalKey();

  @override
  void dispose() {
    _draft.dispose();
    _field.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Keeps the newest message in view. After Pal's careful reply, its help
  /// (the calming steps, then people to call) starts at the top, so a big
  /// text size or a short screen never leaves only the chat's last lines
  /// in view. (With room, that is the same as the end of the chat.)
  void _toEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      final help = _help.currentContext;
      if (help != null) {
        unawaited(Scrollable.ensureVisible(help));
      } else {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  Future<void> _send() async {
    final controller = context.read<PalController>();
    final text = _draft.text.trim();
    if (text.isEmpty || controller.sending) return;
    final pal = widget.pal;
    final store = context.read<DayStore>();
    _draft.clear();
    setState(() {
      _cleared = null;
      _confirmClear = false;
    });
    // The careful reply is read out at once; nothing else is.
    final crisis = looksLikeCrisis(text);
    if (!crisis) palAnnounce(context, '${pal.name} is thinking…');
    final reply = await controller.sendChat(
      text,
      context: chatContext(
        state: store.state,
        now: store.now(),
        today: store.today,
        anchors: store.anchors,
        tasks: store.tasks,
        pal: pal,
      ),
    );
    // Closed meanwhile: don't speak over whatever came next.
    if (!mounted || reply == null) return;
    palAnnounce(context, '${pal.name}: ${reply.text}', assertive: reply.crisis);
    if (reply.crisis) {
      // The keyboard goes down so the careful reply and the people to
      // call have the whole sheet.
      _field.unfocus();
    } else {
      _field.requestFocus();
    }
  }

  Future<void> _clear() async {
    final controller = context.read<PalController>();
    setState(() => _confirmClear = false);
    final gone = await controller.clearChat();
    if (!mounted) return;
    final line = gone
        ? 'Cleared here and on your server.'
        : 'Cleared on this phone. The server copy stays until it can be reached.';
    setState(() => _cleared = line);
    palAnnounce(context, line);
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final pal = widget.pal;
    final controller = context.watch<PalController>();
    final red = context.select<DayStore, bool>((d) => d.state == NervousState.red);
    final chat = controller.chat;
    final shown = chat.length > kChatShown ? chat.sublist(chat.length - kChatShown) : chat;
    final marker = chat.length * 2 + (controller.sending ? 1 : 0);
    if (marker != _seen) {
      _seen = marker;
      _toEnd();
    }
    final calmLine = PalCard(
      accent: true,
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(
            'If this feels like too much, the calming steps are here.',
            style: s.fonts.body(14.5, s.text, weight: FontWeight.w600),
          ),
          NpButton(
            label: 'Calming steps',
            icon: Icons.spa_outlined,
            semanticLabel: 'Open the calming steps',
            onPressed: widget.onCalm,
          ),
        ],
      ),
    );

    return LayoutBuilder(builder: (context, constraints) {
      // The keyboard (or the screen turning) changed the room: the newest
      // message stays in view.
      if (constraints.maxHeight != _room) {
        if (_room != null) _toEnd();
        _room = constraints.maxHeight;
      }
      // While overwhelmed, the line to the calming steps stays put above
      // the chat when there is room. On a short sheet (small phone, big
      // text, keyboard up) it is the last thing in the chat instead, right
      // above the field and in view with the newest message, so it never
      // pushes the field off the screen.
      final pinned = red && constraints.maxHeight >= 320 * palTextScale(context);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (pinned)
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 4, 18, 6),
              child: calmLine,
            ),
          Flexible(
            // Not a lazy list: at most ten messages, all built, so the
            // careful reply's help can always be scrolled to and every
            // message stays in the screen reader's reach.
            child: SingleChildScrollView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(18, 6, 18, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const PalTitle('Talk'),
                  PalIntro(palSay(pal, 'talk')),
                  const SizedBox(height: 12),
                  if (shown.isEmpty)
                    Text('No messages yet.', style: s.fonts.body(14.5, s.textMuted))
                  else
                    Semantics(
                      container: true,
                      label: 'Chat with ${pal.name}',
                      explicitChildNodes: true,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          for (final m in shown) ...[
                            _Message(
                              item: m,
                              pal: pal,
                              onCalm: widget.onCalm,
                              helpKey: identical(m, shown.last) && m.crisis ? _help : null,
                            ),
                            const SizedBox(height: 10),
                          ],
                        ],
                      ),
                    ),
                  if (controller.sending)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text('${pal.name} is thinking…', style: s.fonts.body(14.5, s.textMuted)),
                    ),
                  const SizedBox(height: 4),
                  Text(
                    'Talk sends your message and today’s plan to your NeuroPal server’s AI. '
                    'If a message sounds like a crisis, ${pal.name} answers on the phone and '
                    'doesn’t send it. This check can miss things.',
                    style: s.fonts.body(13, s.textMuted),
                  ),
                  if (chat.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    if (_confirmClear)
                      Wrap(
                        spacing: 10,
                        runSpacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text('Clear the whole chat?', style: s.fonts.body(14.5, s.text, weight: FontWeight.w600)),
                          NpButton(label: 'Yes, clear it', kind: NpButtonKind.ghost, onPressed: () => unawaited(_clear())),
                          NpButton(
                            label: 'Keep it',
                            kind: NpButtonKind.ghost,
                            onPressed: () => setState(() => _confirmClear = false),
                          ),
                        ],
                      )
                    else
                      Align(
                        alignment: Alignment.centerLeft,
                        child: NpButton(
                          label: 'Clear chat',
                          kind: NpButtonKind.ghost,
                          semanticLabel: 'Clear your chat with ${pal.name}',
                          onPressed: () => setState(() => _confirmClear = true),
                        ),
                      ),
                  ],
                  if (_cleared != null) ...[
                    const SizedBox(height: 6),
                    Text(_cleared!, style: s.fonts.body(13.5, s.textMuted)),
                  ],
                  if (red && !pinned) ...[const SizedBox(height: 12), calmLine],
                ],
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: s.line.withValues(alpha: 0.6))),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _draft,
                    focusNode: _field,
                    maxLength: kMessageMaxChars,
                    minLines: 1,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
                    textInputAction: TextInputAction.send,
                    style: s.fonts.body(16, s.text),
                    decoration: InputDecoration(
                      labelText: 'Message to ${pal.name}',
                      hintText: 'Message ${pal.name}',
                      counterText: '',
                    ),
                    onChanged: (_) => setState(() {}),
                    onSubmitted: (_) => unawaited(_send()),
                  ),
                ),
                const SizedBox(width: 8),
                NpIconButton(
                  icon: Icons.send_rounded,
                  semanticLabel: 'Send',
                  size: 48,
                  onPressed: _draft.text.trim().isEmpty || controller.sending
                      ? null
                      : () => unawaited(_send()),
                ),
              ],
            ),
          ),
        ],
      );
    });
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.item, required this.pal, required this.onCalm, this.helpKey});

  final PalChatItem item;

  /// Marks the careful reply's help (the chat scrolls to it).
  final Key? helpKey;
  final PalSettings pal;
  final VoidCallback onCalm;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final mine = !item.fromPal;
    final who = mine ? 'You' : pal.name;
    final radius = s.isSignal ? s.radiusMedium : 16.0;
    final bubble = Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: mine
            ? (s.isSignal ? s.accentFill : s.accentText.withValues(alpha: 0.16))
            : s.surfaceHigh,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(radius),
          topRight: Radius.circular(radius),
          bottomLeft: Radius.circular(!mine && !s.isSignal ? 6 : radius),
          bottomRight: Radius.circular(mine && !s.isSignal ? 6 : radius),
        ),
        border: s.isSignal ? Border.all(color: mine ? s.shadow : s.line, width: 1.5) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            who.toUpperCase(),
            style: s.fonts.label(mine && s.isSignal ? s.accentInk : s.textMuted, size: 10.5),
          ),
          const SizedBox(height: 2),
          // Server text is shown as text, never as markup.
          Text(
            item.text,
            style: s.fonts.body(15.5, mine && s.isSignal ? s.accentInk : s.text, height: 1.4),
          ),
        ],
      ),
    );
    return Column(
      crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        FractionallySizedBox(
          widthFactor: 0.88,
          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
          child: Align(
            alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
            child: Semantics(
              label: '$who: ${item.text}',
              excludeSemantics: true,
              child: bubble,
            ),
          ),
        ),
        if (item.crisis) ...[
          const SizedBox(height: 8),
          PalCrisisReply(key: helpKey, reply: item.text, onCalm: onCalm, showReply: false),
        ],
      ],
    );
  }
}
