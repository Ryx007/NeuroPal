import AVFoundation
import NPTheme
import NPTokens
import SwiftUI

/// Speaks Settings' samples ("Hear it"). One synthesizer per screen; stops
/// when the screen goes away.
@MainActor
@Observable
final class SpeechSampler: NSObject, AVSpeechSynthesizerDelegate {
    private(set) var speaking = false
    private let synthesizer = AVSpeechSynthesizer()

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func say(_ text: String, voice: String?, rate: Float, pitch: Float) {
        synthesizer.stopSpeaking(at: .immediate)
        let u = AVSpeechUtterance(string: text)
        if let voice, let v = AVSpeechSynthesisVoice(identifier: voice) {
            u.voice = v
        } else {
            u.voice = AVSpeechSynthesisVoice(language: AVSpeechSynthesisVoice.currentLanguageCode())
        }
        u.rate = min(AVSpeechUtteranceMaximumSpeechRate, max(AVSpeechUtteranceMinimumSpeechRate, rate))
        u.pitchMultiplier = min(2, max(0.5, pitch))
        speaking = true
        synthesizer.speak(u)
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        speaking = false
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }
}

/// The installed voices for the user's language, best first.
enum VoiceCatalog {
    struct Voice: Identifiable, Hashable {
        let id: String
        let name: String
        let language: String
        /// "Premium" | "Enhanced" | "" (compact)
        let quality: String
    }

    static func voices(language: String = AVSpeechSynthesisVoice.currentLanguageCode()) -> [Voice] {
        let prefix = language.split(separator: "-").first.map(String.init) ?? language
        let all = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix(prefix) }
        func rank(_ v: AVSpeechSynthesisVoice) -> Int {
            switch v.quality {
            case .premium: return 0
            case .enhanced: return 1
            default: return 2
            }
        }
        return all
            .sorted { a, b in
                if rank(a) != rank(b) { return rank(a) < rank(b) }
                if (a.language == language) != (b.language == language) { return a.language == language }
                return a.name < b.name
            }
            .map { v in
                Voice(id: v.identifier, name: v.name, language: v.language,
                      quality: v.quality == .premium ? "Premium" : v.quality == .enhanced ? "Enhanced" : "")
            }
    }

    static func name(of identifier: String?) -> String {
        guard let identifier, let v = AVSpeechSynthesisVoice(identifier: identifier) else { return "System default" }
        return v.name
    }
}

/// Reading: how the reader sounds and looks (Expo Settings → Reading,
/// Audio, VoicePicker). Every change applies at once; the samples play what
/// the reader will do.
struct ReadingSettingsView: View {
    @Environment(AppPreferences.self) private var prefs
    @Environment(\.npTheme) private var theme
    @State private var speech = SpeechSampler()

    static let sampleText = "In squeezed states of light, the noise of the electric field at certain phases falls below that of the vacuum state."

    /// nil = the skin's own body font.
    static let fontChoices: [String?] = [nil] + NPReaderFont.all.map { Optional($0.id) }

    var body: some View {
        @Bindable var prefs = prefs
        Form {
            Section {
                ReaderSample(prefs: prefs)
                    .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                    .listRowBackground(Color.clear)
            }

            Section {
                NavigationLink {
                    VoiceListView(speech: speech)
                } label: {
                    LabeledContent {
                        Text(VoiceCatalog.name(of: prefs.voiceIdentifier))
                            .font(theme.font(.body, size: 15, relativeTo: .body))
                            .foregroundStyle(theme.onSurfaceVariant)
                    } label: {
                        Text("Voice").font(theme.font(.bodySemi, size: 16, relativeTo: .body))
                    }
                }
                .frame(minHeight: 44)
                SliderRow(title: "Words per minute", value: $prefs.wordsPerMinute, range: AppPreferences.wordsPerMinuteRange,
                          step: 10, format: { "\(Int($0)) wpm" }, spoken: { "\(Int($0)) words per minute" })
                SliderRow(title: "Pitch", value: $prefs.pitch, range: 0.5...2.0, step: 0.05,
                          format: { String(format: "%.2f×", $0) }, spoken: { String(format: "%.2f times", $0) })
                Button {
                    if speech.speaking {
                        speech.stop()
                    } else {
                        speech.say(Self.sampleText, voice: prefs.voiceIdentifier, rate: prefs.speechRate, pitch: Float(prefs.pitch))
                    }
                } label: {
                    NPButtonLabel(speech.speaking ? "Stop" : "Hear it", systemImage: speech.speaking ? "stop.fill" : "speaker.wave.2.fill")
                }
                .buttonStyle(.npSecondary)
                .padding(.vertical, 4)
                .accessibilityHint("Reads a sample sentence at this speed and pitch")
            } header: {
                FormHeader("Voice")
            } footer: {
                WhyText("Premium and Enhanced voices sound the most natural. Add them in the Settings app: Accessibility, Spoken Content, Voices.")
            }
            .npFormRow()

            Section {
                ForEach(Self.fontChoices, id: \.self) { id in
                    fontRow(id)
                }
            } header: {
                FormHeader("Reading font")
            }
            .npFormRow()

            Section {
                SliderRow(title: "Text size", value: $prefs.readerFontSize, range: 14...32, step: 1,
                          format: { "\(Int($0)) pt" }, spoken: { "\(Int($0)) points" })
                SliderRow(title: "Line spacing", value: $prefs.readerLineSpacing, range: 0...20, step: 1,
                          format: { "+\(Int($0)) pt" }, spoken: { "\(Int($0)) extra points" })
                VStack(alignment: .leading, spacing: 8) {
                    NPLabel("Page")
                    NPFlowLayout(spacing: 6, lineSpacing: 6) {
                        ForEach(AppPreferences.ReaderBackground.allCases, id: \.self) { bg in
                            PageChip(background: bg, selected: prefs.readerBackground == bg) { prefs.readerBackground = bg }
                        }
                    }
                }
                .padding(.vertical, 6)
                Toggle(isOn: $prefs.followAlong) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Follow along").font(theme.font(.bodySemi, size: 16, relativeTo: .body))
                        Text("Keeps the word being read in view.")
                            .font(theme.font(.body, size: 13, relativeTo: .footnote))
                            .foregroundStyle(theme.onSurfaceVariant)
                    }
                }
                .npToggleTint()
                .frame(minHeight: 44)
            } header: {
                FormHeader("Page")
            } footer: {
                WhyText("The reader still follows the iPhone text size: these sizes grow with it.")
            }
            .npFormRow()
        }
        .npForm()
        .navigationTitle("Reading")
        .onDisappear { speech.stop() }
    }

    private func fontRow(_ id: String?) -> some View {
        let font = id.flatMap { i in NPReaderFont.all.first { $0.id == i } }
        let selected = prefs.readerFont == id || (id == nil && !NPReaderFont.all.contains { $0.id == prefs.readerFont })
        return Button {
            prefs.readerFont = id
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(font?.name ?? "The skin’s font")
                        .font(.custom(theme.readerFontName(id), size: 18, relativeTo: .body))
                        .foregroundStyle(theme.onSurface)
                    Text(font?.note ?? "Inter in Classic, Atkinson Hyperlegible Next in Signal.")
                        .font(theme.font(.body, size: 13, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                if selected {
                    Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)).foregroundStyle(theme.accentText)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// The sample paragraph in the chosen font, size, spacing and page.
private struct ReaderSample: View {
    @Environment(\.npTheme) private var theme
    let prefs: AppPreferences

    var body: some View {
        let colors = theme.readerColors(prefs.readerBackground)
        Text(ReadingSettingsView.sampleText)
            .font(theme.readerFont(prefs.readerFont, size: prefs.readerFontSize))
            .lineSpacing(prefs.readerLineSpacing)
            .foregroundStyle(colors.text)
            .frame(maxWidth: 680, alignment: .leading)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: theme.skinRadius(16), style: .continuous).fill(colors.page))
            .overlay(RoundedRectangle(cornerRadius: theme.skinRadius(16), style: .continuous)
                .strokeBorder(theme.isSignal ? theme.line : theme.outlineVariant.opacity(0.4), lineWidth: theme.isSignal ? max(1, theme.border) : 1))
            .accessibilityLabel("Sample text: \(ReadingSettingsView.sampleText)")
    }
}

/// A reader page colour, as a chip with its swatch.
private struct PageChip: View {
    @Environment(\.npTheme) private var theme
    let background: AppPreferences.ReaderBackground
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let colors = theme.readerColors(background)
        let shape = RoundedRectangle(cornerRadius: min(theme.radiusControl, 22), style: .continuous)
        Button(action: action) {
            HStack(spacing: 7) {
                Text("Aa")
                    .font(theme.font(.bodyBold, size: 13, relativeTo: .footnote))
                    .foregroundStyle(colors.text)
                    .frame(width: 30, height: 26)
                    .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(colors.page))
                    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(theme.outlineVariant, lineWidth: 1))
                if selected { Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)) }
                Text(background.title).font(theme.font(.bodySemi, size: 14, relativeTo: .subheadline))
            }
            .foregroundStyle(selected ? theme.selectionInk : theme.onSurface)
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            .background(shape.fill(selected ? theme.selectionFill : Color.clear))
            .overlay(shape.strokeBorder(selected ? (theme.isSignal ? theme.shadowColor : theme.accentText)
                                                 : (theme.isSignal ? theme.control : theme.outline.opacity(0.6)), lineWidth: 1.5))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Page: \(background.title)")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// Every installed voice for the language, best first, each with a sample.
struct VoiceListView: View {
    @Environment(AppPreferences.self) private var prefs
    @Environment(\.npTheme) private var theme
    let speech: SpeechSampler
    @State private var voices: [VoiceCatalog.Voice] = []
    @State private var showAll = false

    var body: some View {
        let better = voices.filter { !$0.quality.isEmpty }
        let shown = showAll || voices.count <= 8 ? voices : Array(voices.prefix(8))
        Form {
            Section {
                voiceRow(id: nil, name: "System default", sub: "The device’s voice for your language")
                ForEach(shown) { v in
                    voiceRow(id: v.id, name: v.name, sub: [v.language, v.quality].filter { !$0.isEmpty }.joined(separator: " · "))
                }
                if voices.count > 8 {
                    Button(showAll ? "Show fewer" : "Show all \(voices.count) voices") { showAll.toggle() }
                        .font(theme.font(.bodySemi, size: 15, relativeTo: .body))
                        .foregroundStyle(theme.accentText)
                        .frame(minHeight: 44)
                }
            } header: {
                FormHeader("Voices")
            } footer: {
                WhyText(better.isEmpty
                    ? "Only compact voices are installed. For a natural sound, add an Enhanced or Premium voice in the Settings app (Accessibility, Spoken Content, Voices), then pick it here."
                    : "\(better.count) higher-quality \(better.count == 1 ? "voice" : "voices") installed — these sound the most natural.")
            }
            .npFormRow()
        }
        .npForm()
        .navigationTitle("Voice")
        .task { voices = VoiceCatalog.voices() }
        .onDisappear { speech.stop() }
    }

    private func voiceRow(id: String?, name: String, sub: String) -> some View {
        let selected = prefs.voiceIdentifier == id
        return HStack(spacing: 10) {
            Button {
                prefs.voiceIdentifier = id
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                        .font(.system(size: 18))
                        .foregroundStyle(selected ? theme.accentText : theme.onSurfaceVariant)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(name).font(theme.font(.bodyMedium, size: 16, relativeTo: .body)).foregroundStyle(theme.onSurface)
                        if !sub.isEmpty {
                            Text(sub).font(theme.font(.body, size: 13, relativeTo: .footnote)).foregroundStyle(theme.onSurfaceVariant)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Use voice \(name)")
            .accessibilityValue(sub)
            .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
            Button {
                speech.say("This is how the reader will sound with this voice.", voice: id, rate: prefs.speechRate, pitch: Float(prefs.pitch))
            } label: {
                Image(systemName: "speaker.wave.2.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(theme.accentText)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Hear \(name)")
        }
    }
}
