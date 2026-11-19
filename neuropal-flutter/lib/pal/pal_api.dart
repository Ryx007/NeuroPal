// Pal's server calls (neuropal-backend/src/routes/pal.js, docs/BRAIN.md §4):
//   POST   /api/pal/breakdown  { task }              → { steps } | { crisis, reply }
//   POST   /api/pal/chat       { message, context }  → { reply, crisis }
//   DELETE /api/pal/chat                             → { deleted }
//
// Crisis safety is checked HERE as well as in the screens, so no caller can
// ever send a crisis-sounding text: it is answered on the phone with the
// careful reply, and no request leaves. The server's own `crisis: true`
// answer is passed on as a crisis too.

import '../data/backend.dart';
import '../theme/pal.dart';
import 'crisis.dart';
import 'pal_logic.dart';

class PalBreakdownResult {
  const PalBreakdownResult.steps(this.steps, {this.offline}) : crisis = false, reply = null;
  const PalBreakdownResult.crisis(String this.reply) : steps = const [], crisis = true, offline = null;

  final List<String> steps;

  /// Why these are Pal's offline steps (null: the server's own).
  final OfflineReason? offline;

  /// The task sounded like a crisis: no steps, the careful reply instead.
  final bool crisis;
  final String? reply;
}

class PalChatReply {
  const PalChatReply({required this.text, this.crisis = false, this.local = false});

  final String text;
  final bool crisis;

  /// Answered on the phone (a crisis message is never sent).
  final bool local;
}

String _cut(String s, int max) => s.length <= max ? s : s.substring(0, max);

/// Why a breakdown fell back to the offline steps.
OfflineReason offlineReasonFor(ApiException e) {
  if (e.status == 429) return OfflineReason.limited;
  if (e.unreachable && !e.timedOut) return OfflineReason.offline;
  return OfflineReason.error;
}

/// What Pal says when Talk couldn't get an answer.
String chatFallbackLine(PalSettings pal, ApiException e) {
  if (e.status == 429) {
    final said = e.message.trim();
    return said.isNotEmpty ? said : 'That’s a lot of chat for now. The other tools here still work.';
  }
  // Reachable but slow or failing is not "offline": say which.
  if (e.unreachable && !e.timedOut) return palSay(pal, 'talkOffline');
  return palSay(pal, 'talkError');
}

class PalApi {
  PalApi(this.backend);

  final Backend backend;

  /// A cloud model answers in seconds, a local one can take much longer;
  /// Break it down offers its quick steps while it waits.
  static const aiTimeout = Duration(seconds: 60);

  /// 3–7 small steps for [task]: the server's, or Pal's offline ones (with
  /// the reason), or — for a task that sounds like a crisis — the careful
  /// reply. Never throws.
  Future<PalBreakdownResult> breakdown(String task) async {
    final clean = _cut(task.trim(), kTaskMaxChars);
    // Safety first, on the phone: a crisis never becomes a to-do list,
    // and is never sent.
    if (looksLikeCrisis(clean)) return const PalBreakdownResult.crisis(kCrisisReply);
    try {
      final json = await backend.postJson('/api/pal/breakdown', {'task': clean}, timeout: aiTimeout);
      final m = json is Map ? json : const {};
      if (m['crisis'] == true) {
        final r = m['reply'];
        return PalBreakdownResult.crisis(r is String && r.trim().isNotEmpty ? r.trim() : kCrisisReply);
      }
      final steps = cleanSteps(m['steps']);
      return steps == null
          ? PalBreakdownResult.steps(localBreakdown(clean), offline: OfflineReason.error)
          : PalBreakdownResult.steps(steps);
    } on ApiException catch (e) {
      return PalBreakdownResult.steps(localBreakdown(clean), offline: offlineReasonFor(e));
    }
  }

  /// Pal's reply to [message]. A crisis-sounding message is answered here
  /// and never sent. Throws [ApiException] when the server can't answer
  /// (the caller words it in Pal's voice: [chatFallbackLine]).
  Future<PalChatReply> chat(String message, Map<String, Object?> context) async {
    final text = _cut(message.trim(), kMessageMaxChars);
    if (looksLikeCrisis(text)) {
      return const PalChatReply(text: kCrisisReply, crisis: true, local: true);
    }
    final json = await backend.postJson(
      '/api/pal/chat',
      {'message': text, 'context': context},
      timeout: aiTimeout,
    );
    final m = json is Map ? json : const {};
    final reply = m['reply'] is String ? (m['reply'] as String).trim() : '';
    if (reply.isEmpty) throw const ApiException('The server sent an empty reply.');
    return PalChatReply(text: reply, crisis: m['crisis'] == true);
  }

  /// Deletes the server's copy of the chat. True when it is gone.
  Future<bool> clearChat() async {
    try {
      await backend.deleteJson('/api/pal/chat', timeout: const Duration(seconds: 15));
      return true;
    } on ApiException {
      return false;
    }
  }
}
