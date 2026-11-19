// Pal's note on Home: Pal's face and one line in Pal's talk style,
// mirroring the check-in (nothing asked of you while overwhelmed). The
// tile opens Pal, the assistant (as the web app's PalTile links to it).

import 'package:flutter/material.dart';

import '../pal/pal_avatar.dart';
import '../theme/np_style.dart';
import '../theme/pal.dart';
import '../widgets/np_pressable.dart';
import 'home_bits.dart';

class PalTile extends StatelessWidget {
  const PalTile({
    super.key,
    required this.size,
    required this.pal,
    required this.mood,
    required this.line,
    this.onOpen,
  });

  final String size;
  final PalSettings pal;
  final PalMood mood;
  final String line;

  /// Opens the assistant sheet.
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final small = size == 'S';
    final note = Row(
      children: [
        PalAvatar(pal: pal, size: small ? 52 : 84, mood: mood),
        const SizedBox(width: 12),
        Expanded(
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: '${pal.name}: ',
                  style: s.fonts.body(small ? 14 : 15.5, s.text, weight: FontWeight.w700),
                ),
                TextSpan(text: line),
              ],
            ),
            style: s.fonts.body(small ? 14 : 15.5, s.text, height: 1.4),
          ),
        ),
        if (onOpen != null) ...[
          const SizedBox(width: 6),
          Icon(Icons.chevron_right_rounded, size: 24, color: s.textMuted),
        ],
      ],
    );
    return HomeTileFrame(
      padding: EdgeInsets.fromLTRB(14, small ? 10 : 14, 16, small ? 10 : 14),
      children: [
        if (onOpen == null)
          MergeSemantics(child: note)
        else
          NpPressable(
            onTap: onOpen,
            // The visible words first (voice control), then where it goes.
            semanticLabel: '${pal.name}: $line Open ${pal.name}, your assistant',
            focusRadius: s.radiusMedium,
            builder: (context, pressed, focused) => note,
          ),
      ],
    );
  }
}
