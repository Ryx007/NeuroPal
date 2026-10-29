import Foundation
import Observation
import SwiftUI

/// On-device preferences that aren't part of the synced look: how the
/// reader reads and looks, and Pal's bubble. Saved in UserDefaults.
/// Owned by the Theme+Settings agent (Settings edits these); the reader
/// and Pal read them. Add fields freely; don't rename existing ones.
@MainActor
@Observable
public final class AppPreferences {
    /// Background behind the reader's text.
    public enum ReaderBackground: String, CaseIterable, Codable, Sendable {
        /// The skin's surface.
        case theme
        case paper, sepia, dusk, night

        public var title: String {
            switch self {
            case .theme: return "Theme"
            case .paper: return "Paper"
            case .sepia: return "Sepia"
            case .dusk: return "Dusk"
            case .night: return "Night"
            }
        }
    }

    /// Words-per-minute range Settings offers.
    public static let wordsPerMinuteRange: ClosedRange<Double> = 100...400

    /// AVSpeechUtterance.rate for a words-per-minute setting — the ONE
    /// mapping both the reader and Settings' "Hear it" use. Approximate
    /// (voices differ): 0.5, the system default, reads about 180 wpm in
    /// English; the curve flattens above it as AVSpeech speeds up quickly.
    public nonisolated static func speechRate(forWordsPerMinute wpm: Double) -> Float {
        let points: [(wpm: Double, rate: Double)] = [(80, 0.30), (100, 0.36), (140, 0.44), (180, 0.50), (220, 0.535),
                                                     (260, 0.565), (300, 0.595), (350, 0.63), (400, 0.66), (500, 0.72)]
        guard let first = points.first, let last = points.last else { return 0.5 }
        if wpm <= first.wpm { return Float(first.rate) }
        if wpm >= last.wpm { return Float(last.rate) }
        for (a, b) in zip(points, points.dropFirst()) where wpm <= b.wpm {
            let t = (wpm - a.wpm) / (b.wpm - a.wpm)
            return Float(a.rate + (b.rate - a.rate) * t)
        }
        return 0.5
    }

    /// `speechRate(forWordsPerMinute:)` of the current setting.
    public var speechRate: Float { Self.speechRate(forWordsPerMinute: wordsPerMinute) }

    /// AVSpeechSynthesisVoice identifier; nil = the system default for the language.
    public var voiceIdentifier: String? { didSet { save() } }
    /// Read-aloud speed in words per minute (mapped onto AVSpeechUtterance.rate).
    public var wordsPerMinute: Double { didSet { save() } }
    /// 0.5…2.0 (AVSpeechUtterance.pitchMultiplier).
    public var pitch: Double { didSet { save() } }
    /// PostScript name of the reading font; nil = the skin's body font.
    public var readerFont: String? { didSet { save() } }
    /// Base point size of reader text (Dynamic Type still scales it).
    public var readerFontSize: Double { didSet { save() } }
    /// Extra line spacing, in points.
    public var readerLineSpacing: Double { didSet { save() } }
    public var readerBackground: ReaderBackground { didSet { save() } }
    /// Keep the highlighted word in view while reading aloud.
    public var followAlong: Bool { didSet { save() } }
    /// Hide Pal's floating bubble ("Sit with me" still shows it).
    public var palBubbleHidden: Bool { didSet { save() } }

    @ObservationIgnored private let defaults: UserDefaults?
    @ObservationIgnored private var loading = true
    private static let key = "np.preferences.v1"

    private struct Stored: Codable {
        var voiceIdentifier: String?
        var wordsPerMinute: Double?
        var pitch: Double?
        var readerFont: String?
        var readerFontSize: Double?
        var readerLineSpacing: Double?
        var readerBackground: ReaderBackground?
        var followAlong: Bool?
        var palBubbleHidden: Bool?
    }

    /// `defaults: nil` keeps everything in memory (previews, screenshots).
    public init(defaults: UserDefaults? = .standard) {
        self.defaults = defaults
        let s = defaults?.data(forKey: Self.key).flatMap { try? JSONDecoder().decode(Stored.self, from: $0) }
        voiceIdentifier = s?.voiceIdentifier
        wordsPerMinute = s?.wordsPerMinute ?? 180
        pitch = s?.pitch ?? 1.0
        readerFont = s?.readerFont
        readerFontSize = s?.readerFontSize ?? 19
        readerLineSpacing = s?.readerLineSpacing ?? 8
        readerBackground = s?.readerBackground ?? .theme
        followAlong = s?.followAlong ?? true
        palBubbleHidden = s?.palBubbleHidden ?? false
        loading = false
    }

    private func save() {
        guard !loading, let defaults else { return }
        let s = Stored(voiceIdentifier: voiceIdentifier, wordsPerMinute: wordsPerMinute, pitch: pitch, readerFont: readerFont,
                       readerFontSize: readerFontSize, readerLineSpacing: readerLineSpacing,
                       readerBackground: readerBackground, followAlong: followAlong, palBubbleHidden: palBubbleHidden)
        if let data = try? JSONEncoder().encode(s) { defaults.set(data, forKey: Self.key) }
    }
}

public extension NPTheme {
    /// Page and text colours of a reader background. `.theme` is the skin's
    /// own surface; the others are fixed reading papers (text ≥ 11.9:1).
    func readerColors(_ background: AppPreferences.ReaderBackground) -> (page: Color, text: Color) {
        switch background {
        case .theme: return (surface, onSurface)
        case .paper: return (Color(token: "#FBF8F1"), Color(token: "#1C1B19"))
        case .sepia: return (Color(token: "#F3EBDD"), Color(token: "#2A2418"))
        case .dusk: return (Color(token: "#26232E"), Color(token: "#E8E2D5"))
        case .night: return (Color(token: "#000000"), Color(token: "#D6D6D6"))
        }
    }

    /// Whether a reader background is dark (for the status bar / scheme).
    func readerIsDark(_ background: AppPreferences.ReaderBackground) -> Bool {
        switch background {
        case .theme: return palette.dark
        case .paper, .sepia: return false
        case .dusk, .night: return true
        }
    }
}
