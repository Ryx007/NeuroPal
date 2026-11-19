// Keeps a text field within what the day keeps (DAY-SYNC §8 "Text
// limits"), so what you see in the field is what is saved and synced: a
// cut never happens silently later.
//
// Why not just `maxLength`: Flutter's maxLength counts grapheme clusters,
// while the store and the server count UTF-16 units (an emoji is two, a
// family emoji up to eleven). A field that takes 120 emoji would lose half
// of them on save. This formatter cuts where the store cuts and never
// splits a surrogate pair; otherwise it behaves like maxLength on Android
// (full and typing on: nothing changes; a paste keeps its start). Fields
// keep `maxLength` as well, for the screen reader's "maximum length"; this
// one is always the stricter.

import 'dart:math' as math;

import 'package:flutter/services.dart';

class TextLimit extends TextInputFormatter {
  const TextLimit(this.max);

  /// The most UTF-16 units the field takes.
  final int max;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final text = newValue.text;
    if (text.length <= max) return newValue;
    // Already full (or one unit short, which an emoji can't fill) and
    // typing on with nothing selected: nothing changes.
    final had = oldValue.text.length;
    if (had <= max && had >= max - 1 && oldValue.selection.isCollapsed) {
      return oldValue;
    }
    // A paste or a long edit: keep the start, as the store would.
    var end = max;
    final last = text.codeUnitAt(end - 1);
    if (last >= 0xD800 && last <= 0xDBFF) end -= 1;
    final cut = text.substring(0, end);
    final composing = newValue.composing;
    return TextEditingValue(
      text: cut,
      selection: newValue.selection.copyWith(
        baseOffset: math.min(newValue.selection.start, end),
        extentOffset: math.min(newValue.selection.end, end),
      ),
      composing: !composing.isCollapsed && end > composing.start
          ? TextRange(start: composing.start, end: math.min(composing.end, end))
          : TextRange.empty,
    );
  }
}
