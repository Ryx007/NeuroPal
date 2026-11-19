// Pal's note on Home: Pal's face and one line in Pal's talk style,
// mirroring the check-in (nothing asked of you while overwhelmed). The
// assistant itself arrives with the next build, so the tile only speaks.

import 'package:flutter/material.dart';

import '../pal/pal_avatar.dart';
import '../theme/np_style.dart';
import '../theme/pal.dart';
import 'home_bits.dart';

class PalTile extends StatelessWidget {
  const PalTile({
    super.key,
    required this.size,
    required this.pal,
    required this.mood,
    required this.line,
  });

  final String size;
  final PalSettings pal;
  final PalMood mood;
  final String line;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final small = size == 'S';
    return HomeTileFrame(
      padding: EdgeInsets.fromLTRB(14, small ? 10 : 14, 16, small ? 10 : 14),
      children: [
        MergeSemantics(
          child: Row(
            children: [
              PalAvatar(pal: pal, size: small ? 52 : 84, mood: mood),
              const SizedBox(width: 12),
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '${pal.name}: ',
                        style: s.fonts.body(
                          small ? 14 : 15.5,
                          s.text,
                          weight: FontWeight.w700,
                        ),
                      ),
                      TextSpan(text: line),
                    ],
                  ),
                  style: s.fonts.body(small ? 14 : 15.5, s.text, height: 1.4),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
