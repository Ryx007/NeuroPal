import Foundation

// Pal's crisis safety net — the SAME pattern as the server
// (neuropal-backend/src/routes/pal.js, CRISIS) and the Expo app
// (neuropal-expo-app/src/services/palAssistant.js), copied byte for byte.
// PalLogicTests checks that all three stay identical; when the server's
// pattern changes, paste the new source here (between #" and "#).
// The JavaScript flavour is turned into ICU with the same meaning by
// JSRegex.icuPattern (\b, \w, \d and \s keep their ASCII/JavaScript sets).

extension PalLogic {
    /// The JavaScript source of CRISIS (the part between the slashes; flag `i`).
    public static let crisisPatternSource = #"\b(suicid\w*|suizid\w*|kill(?:ing)? my ?self|(?<![\d.,]\s?)kms|end(?:ing)? (?:it all|my life|myself)|(?:want(?:ed)?|going|gonna|plan(?:ning)?|ready) to end it|take my (?:own )?life|want(?:ed)? to die|wish i (?:was|were) dead|better off (?:dead|without me)|no reason to (?:live|go on)|don'?t want to (?:live|be alive|exist|be here|wake up)|(?:nobody|no one|no-one) would (?:miss|care about|notice) me|can'?t go on|hang(?:ing)? my ?self|jump(?:ing)? (?:off|from) (?:a|the|this|my) (?:bridge|building|roof|cliff|balcony|tower)|(?:took|take|taking|swallow(?:ed|ing)?) (?:all|a bunch|too many|the whole (?:bottle|pack|box)) (?:of )?(?:my |the |those )?(?:pills|meds|tablets)|self[- ]?harm\w*|hurt(?:ing)? my ?self|cut(?:ting)? my ?self|overdos\w*|uccider(?:mi|si)|ammazzarmi|farla finita|voglio morire|vorrei morire|togliermi la vita|farmi del male|non voglio (?:pi[uù] )?vivere|quiero morir(?:me)?|matarme|quitarme la vida|je veux mourir|me tuer|en finir avec (?:la vie|tout)|ich will (?:nicht mehr leben|sterben)|mich umbringen|khudkushi|aa?tm(?:a|o)?h(?:a|o)tya|marna chaht[ai]|mar jaa?na chaht[ai]|more jete chai)\b"#
}
