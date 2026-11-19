import Foundation

/// What the voice reads: one entry per word (what to say, "" = silent) and
/// the units it speaks as single utterances. Built from the text reader's
/// ReadingText or from an EPUB chapter's token stream.
struct SpeechScript: @unchecked Sendable {
    /// Identifies the content (a document, or a document's EPUB chapter).
    let id: String
    let speech: [String]
    let units: [Range<Int>]
    /// Pause after each unit, seconds.
    let pauses: [Double]
    /// Lock screen title and subtitle.
    let title: String
    let subtitle: String?

    var count: Int { speech.count }

    /// The unit holding a word (units are ascending and contiguous).
    func unit(containing word: Int) -> Int {
        guard !units.isEmpty else { return 0 }
        var lo = 0
        var hi = units.count - 1
        var hit = 0
        while lo <= hi {
            let mid = (lo + hi) / 2
            if units[mid].lowerBound <= word {
                hit = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return hit
    }
}

extension ReadingText {
    func speechScript(subtitle: String?) -> SpeechScript {
        SpeechScript(id: documentID, speech: speech, units: units, pauses: unitPauses, title: title, subtitle: subtitle)
    }
}

/// How the voice sounds.
struct VoiceSettings: Equatable {
    var wordsPerMinute: Double = 180
    var pitch: Double = 1
    var voiceIdentifier: String?
    /// Screenshots and UI checks read silently.
    var muted = false
}
