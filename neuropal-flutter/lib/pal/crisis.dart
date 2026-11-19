// Pal's safety net, run on the phone BEFORE any text leaves it: "Talk" and
// "Break it down" check every message first, and one that sounds like a
// crisis is never sent to the server or a model. Pal answers on the phone
// with the careful reply, the help lines and the way to the calming steps.
//
// The pattern is a copy of CRISIS in neuropal-backend/src/routes/pal.js,
// byte for byte, with the same flag (`i` = caseSensitive: false; no `u`, so
// \w and \b are ASCII, as in the server). test/pal_crisis_test.dart reads the
// server's file and fails if the two ever differ. The text is normalised the
// way the server does it before testing: runs of whitespace (tabs,
// newlines, non-breaking spaces) become one space, the ends are trimmed,
// and curly apostrophes become straight ones.
//
// A safety net, not a clinical test: it can miss phrasings, and Talk says so.

/// The server's CRISIS pattern (between the slashes), unchanged.
const String kCrisisPattern =
    r"\b(suicid\w*|suizid\w*|kill(?:ing)? my ?self|(?<![\d.,]\s?)kms|end(?:ing)? (?:it all|my life|myself)|(?:want(?:ed)?|going|gonna|plan(?:ning)?|ready) to end it|take my (?:own )?life|want(?:ed)? to die|wish i (?:was|were) dead|better off (?:dead|without me)|no reason to (?:live|go on)|don'?t want to (?:live|be alive|exist|be here|wake up)|(?:nobody|no one|no-one) would (?:miss|care about|notice) me|can'?t go on|hang(?:ing)? my ?self|jump(?:ing)? (?:off|from) (?:a|the|this|my) (?:bridge|building|roof|cliff|balcony|tower)|(?:took|take|taking|swallow(?:ed|ing)?) (?:all|a bunch|too many|the whole (?:bottle|pack|box)) (?:of )?(?:my |the |those )?(?:pills|meds|tablets)|self[- ]?harm\w*|hurt(?:ing)? my ?self|cut(?:ting)? my ?self|overdos\w*|uccider(?:mi|si)|ammazzarmi|farla finita|voglio morire|vorrei morire|togliermi la vita|farmi del male|non voglio (?:pi[uù] )?vivere|quiero morir(?:me)?|matarme|quitarme la vida|je veux mourir|me tuer|en finir avec (?:la vie|tout)|ich will (?:nicht mehr leben|sterben)|mich umbringen|khudkushi|aa?tm(?:a|o)?h(?:a|o)tya|marna chaht[ai]|mar jaa?na chaht[ai]|more jete chai)\b";

/// The pattern with the server's flags (`/…/i`).
final RegExp kCrisis = RegExp(kCrisisPattern, caseSensitive: false);

final RegExp _whitespace = RegExp(r'\s+');
final RegExp _curlyApostrophes = RegExp('[\u2019\u2018]');

/// The text as the server tests it: `\s+` collapsed to one space, trimmed,
/// ’ and ‘ mapped to '. (The ends are trimmed by hand: Dart's trim() also
/// removes U+0085, JavaScript's doesn't, and after the collapse any
/// whitespace left at an end is exactly one space.)
String normalizeForCrisis(String text) {
  var s = text.replaceAll(_whitespace, ' ');
  if (s.startsWith(' ')) s = s.substring(1);
  if (s.endsWith(' ')) s = s.substring(0, s.length - 1);
  return s.replaceAll(_curlyApostrophes, "'");
}

/// True when [text] sounds like a crisis: don't send it anywhere.
bool looksLikeCrisis(String text) => kCrisis.hasMatch(normalizeForCrisis(text));

/// The server's careful reply, word for word (it already says "tap").
const String kCrisisReply =
    'I’m really glad you told me. I can’t help with this on my own, and you deserve real support right now. If you might act on these thoughts or you’re in danger, call your local emergency number now, or go to someone you trust. The calming steps in the app are one tap away.';
