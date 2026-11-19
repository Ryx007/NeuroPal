// The day's rules that are pure functions of the data and the time: the
// next anchor, minutes until it, and every time or date as words. Shared by
// Home, the anchors sheet and Settings (the sync status line).
//
// Clocks follow the skin, as in the other clients: Classic says "2:05 PM",
// Signal says "14:05".

import 'day_models.dart';

String _pad2(int n) => n.toString().padLeft(2, '0');

/// "14:05"
String hhmm(int hour, int minute) => '${_pad2(hour)}:${_pad2(minute)}';

/// "2:05 PM"
String time12(int hour, int minute) {
  final h = hour % 12 == 0 ? 12 : hour % 12;
  return '$h:${_pad2(minute)} ${hour >= 12 ? 'PM' : 'AM'}';
}

/// The skin's clock for a time of day.
String clockText(int hour, int minute, {required bool signal}) =>
    signal ? hhmm(hour, minute) : time12(hour, minute);

String anchorClock(DayAnchor a, {required bool signal}) =>
    clockText(a.hour, a.minute, signal: signal);

/// Minutes from [now] to the anchor's time today (negative once it passed).
int minutesUntil(DayAnchor a, DateTime now) =>
    a.minutesOfDay - (now.hour * 60 + now.minute);

/// Home's "Next anchor" (as in the Expo and web apps): the first anchor not
/// done today that is still ahead; else the last one not done (it is
/// happening now or overdue). [anchors] are the live ones, by time.
DayAnchor? nextAnchor(List<DayAnchor> anchors, DateTime now, String today) {
  final nowMin = now.hour * 60 + now.minute;
  final pending = [
    for (final a in anchors)
      if (a.doneOn != today) a,
  ];
  for (final a in pending) {
    if (a.minutesOfDay >= nowMin) return a;
  }
  return pending.isEmpty ? null : pending.last;
}

/// The calm countdown: minutes, never seconds. [big] + [unit] is the
/// Signal numeral ("25" MIN, "3" H, "NOW"); [words] says the same.
class Countdown {
  const Countdown(this.big, this.unit, this.words);

  final String big;
  final String unit;
  final String words;
}

Countdown countdown(int mins) {
  if (mins <= 0) return const Countdown('NOW', '', 'happening now');
  if (mins < 100) {
    return Countdown('$mins', 'MIN', 'in $mins ${mins == 1 ? 'minute' : 'minutes'}');
  }
  final h = (mins / 60).round();
  return Countdown('$h', 'H', 'in about $h ${h == 1 ? 'hour' : 'hours'}');
}

/// "± 30 min" / "± 1 h" / "exact time" (the window, in a line of text).
String windowLabel(int flex) {
  if (flex <= 0) return 'exact time';
  return flex >= 60 && flex % 60 == 0 ? '± ${flex ~/ 60} h' : '± $flex min';
}

/// The window choices as the editor names them.
String flexChoiceLabel(int m) {
  if (m == 0) return 'Exact time';
  if (m >= 60 && m % 60 == 0) {
    final h = m ~/ 60;
    return '± $h ${h == 1 ? 'hour' : 'hours'}';
  }
  return '± $m min';
}

/// The same, read out ("plus or minus 30 minutes").
String flexChoiceSpoken(int m) {
  if (m == 0) return 'Exact time';
  if (m >= 60 && m % 60 == 0) {
    final h = m ~/ 60;
    return 'Plus or minus $h ${h == 1 ? 'hour' : 'hours'}';
  }
  return 'Plus or minus $m minutes';
}

const List<String> _days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const List<String> _months = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', //
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];
const List<String> _weekdayNames = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/// Signal's date line: "THU · 19 NOV".
String dateLabel(DateTime d) =>
    '${_days[d.weekday - 1]} · ${d.day} ${_months[d.month - 1]}';

/// "Monday"
String weekdayName(DateTime d) => _weekdayNames[d.weekday - 1];

/// "19 Nov"
String shortDate(DateTime d) {
  final m = _months[d.month - 1];
  return '${d.day} ${m[0]}${m.substring(1).toLowerCase()}';
}

bool sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// "Last check-in: Okay at 14:05" (+ " on Monday" when not today).
String lastCheckinLine(Checkin c, DateTime now, {required bool signal}) {
  final at = DateTime.fromMillisecondsSinceEpoch(c.atMs).toLocal();
  final local = now.toLocal();
  final clock = clockText(at.hour, at.minute, signal: signal);
  final when = sameDay(at, local) ? '' : ' on ${weekdayName(at)}';
  return 'Last check-in: ${c.state.word} at $clock$when';
}
