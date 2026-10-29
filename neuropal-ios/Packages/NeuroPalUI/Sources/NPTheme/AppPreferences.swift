import Foundation
import Observation

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
    }

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
