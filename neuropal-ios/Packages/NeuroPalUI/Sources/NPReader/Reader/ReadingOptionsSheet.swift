import AVFoundation
import NPTheme
import SwiftUI

/// The reader's quick options ("Aa"): voice, speed and pitch; text size,
/// spacing, font and page colour; following along. The same preferences
/// Settings edits (AppPreferences), within reach while reading.
struct ReadingOptionsSheet: View {
    @Environment(AppPreferences.self) private var prefs
    @Environment(\.npTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var prefs = prefs
        NavigationStack {
            Form {
                Section {
                    sliderRow("Speed", value: $prefs.wordsPerMinute, range: AppPreferences.wordsPerMinuteRange, step: 10,
                              shown: "\(Int(prefs.wordsPerMinute)) wpm",
                              spoken: "\(Int(prefs.wordsPerMinute)) words per minute")
                    NavigationLink {
                        VoicePicker(selection: $prefs.voiceIdentifier)
                    } label: {
                        LabeledContent("Voice", value: Self.voiceName(prefs.voiceIdentifier))
                            .font(theme.bodyFont)
                    }
                    sliderRow("Pitch", value: $prefs.pitch, range: 0.5...2, step: 0.05,
                              shown: Self.pitchName(prefs.pitch), spoken: Self.pitchName(prefs.pitch))
                } header: {
                    SkinLabel("Voice")
                }
                .listRowBackground(theme.surfaceHigh)

                Section {
                    Stepper(value: $prefs.readerFontSize, in: 14...34, step: 1) {
                        LabeledContent("Text size", value: "\(Int(prefs.readerFontSize)) pt")
                            .font(theme.bodyFont)
                    }
                    sliderRow("Line spacing", value: $prefs.readerLineSpacing, range: 0...20, step: 1,
                              shown: "\(Int(prefs.readerLineSpacing)) pt", spoken: "\(Int(prefs.readerLineSpacing)) points")
                    Picker(selection: $prefs.readerFont) {
                        Text("Same as the app").tag(String?.none)
                        ForEach(NPReaderFont.all) { option in
                            Text(option.name).tag(String?.some(option.id))
                        }
                    } label: {
                        Text("Font").font(theme.bodyFont)
                    }
                    Picker(selection: $prefs.readerBackground) {
                        ForEach(AppPreferences.ReaderBackground.allCases, id: \.self) { background in
                            Text(background.title).tag(background)
                        }
                    } label: {
                        Text("Page colour").font(theme.bodyFont)
                    }
                } header: {
                    SkinLabel("Page")
                }
                .listRowBackground(theme.surfaceHigh)

                Section {
                    Toggle(isOn: $prefs.followAlong) {
                        Text("Follow along while listening").font(theme.bodyFont)
                    }
                    .tint(theme.accentFill)
                } header: {
                    SkinLabel("Listening")
                } footer: {
                    Text("The page keeps the spoken word in view. Scrolling by hand pauses this for a few seconds.")
                        .font(theme.font(.body, size: 13, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
                .listRowBackground(theme.surfaceHigh)
            }
            .scrollContentBackground(.hidden)
            .background(theme.surfaceContainer)
            .foregroundStyle(theme.onSurface)
            .navigationTitle("Reading options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func sliderRow(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, step: Double,
                           shown: String, spoken: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title).font(theme.bodyFont)
                Spacer()
                Text(shown)
                    .font(theme.font(.mono, size: 13, relativeTo: .footnote))
                    .foregroundStyle(theme.accentText)
            }
            .accessibilityHidden(true)
            Slider(value: value, in: range, step: step) {
                Text(title)
            }
            .tint(theme.accentFill)
            .accessibilityValue(spoken)
        }
        .padding(.vertical, 4)
    }

    static func pitchName(_ pitch: Double) -> String {
        if abs(pitch - 1) < 0.03 { return "Normal" }
        return pitch < 1 ? "Lower (\(String(format: "%.2f", pitch))×)" : "Higher (\(String(format: "%.2f", pitch))×)"
    }

    static func voiceName(_ identifier: String?) -> String {
        guard let identifier, let voice = AVSpeechSynthesisVoice(identifier: identifier) else { return "System voice" }
        return voice.name
    }
}

/// Installed voices for the current language, best quality first, each
/// with a short sample.
struct VoicePicker: View {
    @Environment(\.npTheme) private var theme
    @Binding var selection: String?
    @State private var sampler = VoiceSampler()

    private var voices: [AVSpeechSynthesisVoice] {
        let language = String(AVSpeechSynthesisVoice.currentLanguageCode().prefix(2))
        return AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix(language) }
            .sorted {
                if $0.quality.rawValue != $1.quality.rawValue { return $0.quality.rawValue > $1.quality.rawValue }
                return $0.name < $1.name
            }
    }

    var body: some View {
        List {
            Section {
                row(identifier: nil, name: "System voice", detail: "The default voice for your language")
            }
            .listRowBackground(theme.surfaceHigh)
            Section {
                ForEach(voices, id: \.identifier) { voice in
                    row(identifier: voice.identifier, name: voice.name, detail: Self.detail(voice))
                }
            } header: {
                SkinLabel("Installed voices")
            } footer: {
                Text("More natural voices can be downloaded in the iPhone Settings app, under Accessibility, Spoken Content, Voices.")
                    .font(theme.font(.body, size: 13, relativeTo: .footnote))
                    .foregroundStyle(theme.onSurfaceVariant)
            }
            .listRowBackground(theme.surfaceHigh)
        }
        .scrollContentBackground(.hidden)
        .background(theme.surfaceContainer)
        .navigationTitle("Voice")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { sampler.stop() }
    }

    private func row(identifier: String?, name: String, detail: String) -> some View {
        let selected = selection == identifier
        return HStack(spacing: 12) {
            Button {
                selection = identifier
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(selected ? theme.accentText : theme.outline)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name).font(theme.bodyFont).foregroundStyle(theme.onSurface)
                        Text(detail)
                            .font(theme.font(.body, size: 12, relativeTo: .caption))
                            .foregroundStyle(theme.onSurfaceVariant)
                    }
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(selected ? .isSelected : [])
            Button {
                sampler.play(identifier)
            } label: {
                Label("Hear \(name)", systemImage: "play.circle")
            }
            .buttonStyle(ReaderIconButtonStyle(boxed: false))
        }
    }

    static func detail(_ voice: AVSpeechSynthesisVoice) -> String {
        let region = Locale.current.localizedString(forIdentifier: voice.language) ?? voice.language
        switch voice.quality.rawValue {
        case 3: return "Premium · \(region)"
        case 2: return "Enhanced · \(region)"
        default: return region
        }
    }
}

/// Plays a short sample of a voice (separate from the reader's voice).
@MainActor
@Observable
final class VoiceSampler {
    @ObservationIgnored private let synth = AVSpeechSynthesizer()

    func play(_ identifier: String?) {
        synth.stopSpeaking(at: .immediate)
        let u = AVSpeechUtterance(string: "This is how I sound when I read to you.")
        u.voice = ReadAloudPlayer.resolveVoice(identifier)
        synth.speak(u)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }
}
