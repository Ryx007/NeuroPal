// Pal's "Talk" safety net, run BEFORE anything is sent. A copy of CRISIS in
// neuropal-backend/src/routes/pal.js (and the Expo app's palAssistant.js):
// keep the three identical — scripts/qa/web-shell-crisis.mjs compares this
// pattern with the backend's character for character. A match is never sent
// to the server: Pal answers with CRISIS_REPLY, the calming steps and help
// lines. English plus the languages the app's people write in (Italian,
// Spanish, French, German, romanised Hindi/Bengali). A safety net, not a
// clinical test: it can miss things, and the app says so.
// No imports: node loads this file directly in the check script.

export const CRISIS =
  /\b(suicid\w*|suizid\w*|kill(?:ing)? my ?self|(?<![\d.,]\s?)kms|end(?:ing)? (?:it all|my life|myself)|(?:want(?:ed)?|going|gonna|plan(?:ning)?|ready) to end it|take my (?:own )?life|want(?:ed)? to die|wish i (?:was|were) dead|better off (?:dead|without me)|no reason to (?:live|go on)|don'?t want to (?:live|be alive|exist|be here|wake up)|(?:nobody|no one|no-one) would (?:miss|care about|notice) me|can'?t go on|hang(?:ing)? my ?self|jump(?:ing)? (?:off|from) (?:a|the|this|my) (?:bridge|building|roof|cliff|balcony|tower)|(?:took|take|taking|swallow(?:ed|ing)?) (?:all|a bunch|too many|the whole (?:bottle|pack|box)) (?:of )?(?:my |the |those )?(?:pills|meds|tablets)|self[- ]?harm\w*|hurt(?:ing)? my ?self|cut(?:ting)? my ?self|overdos\w*|uccider(?:mi|si)|ammazzarmi|farla finita|voglio morire|vorrei morire|togliermi la vita|farmi del male|non voglio (?:pi[uù] )?vivere|quiero morir(?:me)?|matarme|quitarme la vida|je veux mourir|me tuer|en finir avec (?:la vie|tout)|ich will (?:nicht mehr leben|sterben)|mich umbringen|khudkushi|aa?tm(?:a|o)?h(?:a|o)tya|marna chaht[ai]|mar jaa?na chaht[ai]|more jete chai)\b/i;

export function looksLikeCrisis(text: string): boolean {
  return CRISIS.test(String(text || "").replace(/[’‘]/g, "'"));
}

// The server's careful reply, worded for the web (a click, not a tap).
export const CRISIS_REPLY =
  "I’m really glad you told me. I can’t help with this on my own, and you deserve real support right now. If you might act on these thoughts or you’re in danger, call your local emergency number now, or go to someone you trust. The calming steps are one click away.";
