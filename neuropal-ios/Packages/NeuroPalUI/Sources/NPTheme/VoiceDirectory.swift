import AVFoundation
import Foundation

/// Every installed speech voice, grouped by language: the reading's
/// languages first (the document's when it's known, then the device's),
/// then all the others by language name; the best quality first in each
/// group. So an Italian-language phone can still pick an English voice for
/// an English paper. Both voice pickers (the reader's and Settings') use it.
public enum VoiceDirectory {
    public struct Voice: Identifiable, Hashable, Sendable {
        /// AVSpeechSynthesisVoice identifier.
        public let id: String
        public let name: String
        /// BCP 47, e.g. "en-GB".
        public let language: String
        /// "English (United Kingdom)", in the device's language.
        public let region: String
        /// "Premium" | "Enhanced" | "" (compact)
        public let quality: String
    }

    public struct Group: Identifiable, Hashable, Sendable {
        /// The language code, e.g. "en".
        public let id: String
        /// "English", in the device's language.
        public let title: String
        public let voices: [Voice]
    }

    /// `preferring`: language codes to put first, in order ("en", "it-IT"…);
    /// the device's language is always added after them.
    public static func groups(preferring languages: [String] = []) -> [Group] {
        let device = AVSpeechSynthesisVoice.currentLanguageCode()
        var order: [String] = []
        for code in (languages + [device]).map(base) where !order.contains(code) { order.append(code) }

        var byLanguage: [String: [AVSpeechSynthesisVoice]] = [:]
        for voice in AVSpeechSynthesisVoice.speechVoices() {
            byLanguage[base(voice.language), default: []].append(voice)
        }
        func group(_ code: String) -> Group {
            let voices = (byLanguage[code] ?? []).sorted { a, b in
                if rank(a) != rank(b) { return rank(a) < rank(b) }
                if (a.language == device) != (b.language == device) { return a.language == device }
                return a.name.localizedStandardCompare(b.name) == .orderedAscending
            }
            return Group(id: code, title: title(code), voices: voices.map(voice))
        }
        let first = order.filter { byLanguage[$0] != nil }.map(group)
        let rest = byLanguage.keys.filter { !order.contains($0) }.map(group)
            .sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        return first + rest
    }

    /// How many of the first groups are the preferred languages.
    public static func preferredCount(_ groups: [Group], preferring languages: [String] = []) -> Int {
        let wanted = Set((languages + [AVSpeechSynthesisVoice.currentLanguageCode()]).map(base))
        return groups.prefix { wanted.contains($0.id) }.count
    }

    /// "en-GB" → "en".
    public static func base(_ language: String) -> String {
        (language.split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map(String.init) ?? language).lowercased()
    }

    static func title(_ code: String) -> String {
        guard let name = Locale.current.localizedString(forLanguageCode: code), !name.isEmpty else { return code }
        return name.prefix(1).uppercased() + name.dropFirst()
    }

    static func rank(_ v: AVSpeechSynthesisVoice) -> Int {
        switch v.quality {
        case .premium: return 0
        case .enhanced: return 1
        default: return 2
        }
    }

    static func voice(_ v: AVSpeechSynthesisVoice) -> Voice {
        Voice(id: v.identifier, name: v.name, language: v.language,
              region: Locale.current.localizedString(forIdentifier: v.language) ?? v.language,
              quality: v.quality == .premium ? "Premium" : v.quality == .enhanced ? "Enhanced" : "")
    }
}
