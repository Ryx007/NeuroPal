import NPTheme
import SwiftUI

/// What the docked player shows.
struct PlayerState: Equatable {
    var playing: Bool
    /// "38% · Ch 2/6" (chapter-scoped, like the Expo player).
    var position: String
    /// The same for VoiceOver.
    var positionSpoken: String
    /// "3 min left" in this chapter.
    var timeLeft: String
    var timeLeftSpoken: String
    /// Progress through this chapter, 0…1.
    var fraction: Double
    var wordsPerMinute: Double
    var canStepBack: Bool
    var canStepForward: Bool
}

/// The docked read-aloud player (both skins): position and time left,
/// sentence and paragraph steps around a big play button, speed and
/// reading options. Every control is ≥ 44 pt with a VoiceOver label.
struct PlayerBar: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    let state: PlayerState
    var onToggle: () -> Void
    var onSentence: (_ forward: Bool) -> Void
    var onParagraph: (_ forward: Bool) -> Void
    var onSpeed: (Double) -> Void
    var onChapters: () -> Void
    var onOptions: () -> Void
    var onReadWithVoiceOver: () -> Void

    static let speeds: [Double] = [100, 120, 150, 180, 210, 240, 270, 300, 350, 400]

    var body: some View {
        VStack(spacing: 10) {
            if voiceOver { voiceOverRow }
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    positionButton
                    Spacer(minLength: 8)
                    timeLeft
                }
                VStack(alignment: .leading, spacing: 2) {
                    positionButton
                    timeLeft
                }
            }
            ProgressTrack(fraction: state.fraction)
                .accessibilityHidden(true)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 4) {
                    speedMenu
                    Spacer(minLength: 2)
                    transport
                    Spacer(minLength: 2)
                    optionsButton
                }
                VStack(spacing: 10) {
                    transport
                    HStack {
                        speedMenu
                        Spacer()
                        optionsButton
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .readerPanel()
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
        .sensoryFeedback(.selection, trigger: state.playing)
    }

    private var positionButton: some View {
        Button(action: onChapters) {
            HStack(spacing: 6) {
                Image(systemName: "list.bullet").accessibilityHidden(true)
                Text(state.position).lineLimit(1).fixedSize()
            }
            .font(theme.font(.mono, size: 12, relativeTo: .caption))
            .foregroundStyle(theme.accentText)
            .frame(minHeight: 32)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(state.positionSpoken)
        .accessibilityHint("Opens the contents")
    }

    private var timeLeft: some View {
        Text(state.timeLeft)
            .font(theme.font(.mono, size: 12, relativeTo: .caption))
            .foregroundStyle(theme.onSurfaceVariant)
            .lineLimit(1)
            .fixedSize()
            .accessibilityLabel(state.timeLeftSpoken)
    }

    private var transport: some View {
        HStack(spacing: 2) {
            Button { onParagraph(false) } label: { Label("Previous paragraph", systemImage: "backward.end.fill") }
                .buttonStyle(ReaderIconButtonStyle())
                .disabled(!state.canStepBack)
                .keyboardShortcut(.leftArrow, modifiers: .command)
            Button { onSentence(false) } label: { Label("Previous sentence", systemImage: "backward.fill") }
                .buttonStyle(ReaderIconButtonStyle())
                .disabled(!state.canStepBack)
                .keyboardShortcut(.leftArrow, modifiers: .option)
            Button(action: onToggle) {
                Label(state.playing ? "Pause" : "Read aloud", systemImage: state.playing ? "pause.fill" : "play.fill")
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(ReaderPlayButtonStyle())
            .padding(.horizontal, 6)
            .accessibilityValue(state.playing ? "Reading aloud" : "Paused")
            .keyboardShortcut(.space, modifiers: [])
            Button { onSentence(true) } label: { Label("Next sentence", systemImage: "forward.fill") }
                .buttonStyle(ReaderIconButtonStyle())
                .disabled(!state.canStepForward)
                .keyboardShortcut(.rightArrow, modifiers: .option)
            Button { onParagraph(true) } label: { Label("Next paragraph", systemImage: "forward.end.fill") }
                .buttonStyle(ReaderIconButtonStyle())
                .disabled(!state.canStepForward)
                .keyboardShortcut(.rightArrow, modifiers: .command)
        }
    }

    private var speedChoices: [Double] {
        let current = (state.wordsPerMinute / 10).rounded() * 10
        return Self.speeds.contains(current) ? Self.speeds : (Self.speeds + [current]).sorted()
    }

    private var speedMenu: some View {
        Menu {
            Picker("Reading speed", selection: Binding(
                get: { (state.wordsPerMinute / 10).rounded() * 10 },
                set: { onSpeed($0) })) {
                ForEach(speedChoices, id: \.self) { wpm in
                    Text("\(Int(wpm)) words per minute").tag(wpm)
                }
            }
            Divider()
            Button(action: onOptions) { Label("Voice and reading options", systemImage: "slider.horizontal.3") }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "gauge.with.dots.needle.33percent").accessibilityHidden(true)
                Text("\(Int(state.wordsPerMinute))")
                    .foregroundStyle(theme.accentText)
                Text("wpm")
            }
            .font(theme.font(.mono, size: 12, relativeTo: .caption))
            .foregroundStyle(theme.onSurfaceVariant)
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            .background(speedShape.fill(Ink(theme: theme).surfaceLowest.opacity(0.7)))
            .overlay(speedShape.strokeBorder(theme.isSignal ? theme.control : .clear, lineWidth: 1.5))
            .contentShape(speedShape)
        }
        .accessibilityLabel("Reading speed, \(Int(state.wordsPerMinute)) words per minute")
        .accessibilityHint("Choose how fast to read")
    }

    private var speedShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: theme.isSignal ? Ink(theme: theme).controlRadius : 22, style: .continuous)
    }

    private var optionsButton: some View {
        Button(action: onOptions) { Label("Reading options", systemImage: "textformat.size") }
            .buttonStyle(ReaderIconButtonStyle())
    }

    private var voiceOverRow: some View {
        HStack(spacing: 10) {
            Image(systemName: "accessibility")
                .foregroundStyle(theme.accentText)
                .accessibilityHidden(true)
            Text("VoiceOver is on.")
                .font(theme.font(.body, size: 13, relativeTo: .footnote))
                .foregroundStyle(theme.onSurfaceVariant)
            Spacer(minLength: 4)
            Button("Read with VoiceOver instead", action: onReadWithVoiceOver)
                .buttonStyle(ReaderChipStyle(selected: true))
        }
    }
}

/// A thin progress line (the position label carries the value for VoiceOver).
struct ProgressTrack: View {
    @Environment(\.npTheme) private var theme
    var fraction: Double
    var height: CGFloat = 4
    var tint: Color?

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(theme.surfaceHighest.opacity(0.7))
                Capsule()
                    .fill(tint ?? theme.accentFill)
                    .frame(width: max(fraction > 0 ? height : 0, geo.size.width * min(1, max(0, fraction))))
            }
        }
        .frame(height: height)
    }
}
