// "Working on it" indicator that respects motion: a spinner normally, a
// still hourglass when motion is Still or the OS asks for reduced motion.

import 'package:flutter/material.dart';

import '../theme/np_style.dart';

class NpBusy extends StatelessWidget {
  const NpBusy({super.key, this.size = 32});

  final double size;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    if (s.still) {
      return Icon(Icons.hourglass_top_rounded, size: size, color: s.accentText);
    }
    return SizedBox(
      width: size,
      height: size,
      child: const CircularProgressIndicator(strokeWidth: 3),
    );
  }
}
