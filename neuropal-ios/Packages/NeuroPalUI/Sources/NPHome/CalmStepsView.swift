import AVFoundation
import NPCore
import NPDay
import NPTheme
import SwiftUI

/// The calming steps (DBT TIPP), full screen, one step at a time, after
/// EmergencyScreen.jsx: Temperature, Intense exercise, Paced breathing,
/// Paired muscle relaxation. Never waits for the network or a sign-in —
/// nothing here talks to the server. "I'm OK for now" asks gently how you
/// are, then goes back to where you were.
public struct CalmStepsView: View {
    @Environment(AppNavigator.self) private var nav
    @Environment(DayStore.self) private var day
    @Environment(\.npTheme) private var theme
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var step = 0
    @State private var askingHowYouAre = false
    @State private var stillOverwhelmed = false
    @AccessibilityFocusState private var stepFocused: Bool
    @AccessibilityFocusState private var helpFocused: Bool

    public init() {}

    struct Step {
        let title: String
        let body: String
        let duration: String
        let symbol: String
    }

    static let steps: [Step] = [
        Step(title: "Temperature",
             body: "Splash cold water on your face or hold an ice pack to your eyes and cheeks. This cues the mammalian "
                + "dive reflex to lower heart rate.",
             duration: "60 seconds", symbol: "snowflake"),
        Step(title: "Intense exercise",
             body: "Engage in short, high-intensity movement. Burpees, jumping jacks, or running in place. Burn off the "
                + "excess sympathetic energy.",
             duration: "2 minutes", symbol: "figure.run"),
        Step(title: "Paced breathing",
             body: "Breathe in for 4 seconds, hold for 2, and exhale for 6. Focus on making your exhale longer than your "
                + "inhale to signal safety to your brain.",
             duration: "4 minutes", symbol: "wind"),
        Step(title: "Paired muscle relaxation",
             body: "Tense a muscle group as hard as you can for 5 seconds, then release completely. Notice the sensation "
                + "of tension leaving your body.",
             duration: "3 minutes", symbol: "hand.raised"),
    ]

    public var body: some View {
        ZStack {
            NPBackground()
            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    topBar(proxy)
                    if askingHowYouAre {
                        checkInPrompt.padding(.top, 24)
                    } else {
                        intro.padding(.top, 18)
                        stepCard.padding(.top, 22)
                        if step == 2 { BreathingGuide().padding(.top, 14) }
                        reassurance.padding(.top, 14)
                        progress.padding(.top, 22)
                        controls.padding(.top, 16)
                    }
                    helpLines.padding(.top, 26).id("help")
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            }
        }
        .onChange(of: step) { _, _ in announceStep() }
        .onAppear {
            // Mock screenshots only: -NPCalmStep 3 starts on that step.
            if !day.isPersistent, let n = DebugLaunch.int("NPCalmStep"), (1...4).contains(n) {
                step = n - 1
            }
            announceStep()
        }
    }

    // MARK: Parts

    private func topBar(_ proxy: ScrollViewProxy) -> some View {
        HStack(spacing: 10) {
            Button {
                leave()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close the calming steps")
            .keyboardShortcut(.cancelAction)
            if !typeSize.isAccessibilitySize {
                Text("NeuroPal")
                    .font(theme.font(.display, size: 14, relativeTo: .footnote))
                    .foregroundStyle(theme.accentText)
                    .accessibilityHidden(true)
            }
            Spacer()
            Button {
                withAnimation(theme.animates ? .easeInOut(duration: 0.3) : nil) { proxy.scrollTo("help", anchor: .top) }
                helpFocused = true
            } label: {
                Label("Call someone", systemImage: "phone")
                    .font(theme.font(.bodySemi, size: 14, relativeTo: .subheadline))
                    .foregroundStyle(theme.accentText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, 10)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Shows the people you can call")
        }
        .padding(.leading, -11)
        .padding(.top, 8)
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("CALMING STEPS")
                .font(theme.font(.label, size: 11, relativeTo: .caption))
                .tracking(2)
                .foregroundStyle(theme.accentText)
            Text("Let’s slow your body down")
                .font(theme.font(.display, size: 34, relativeTo: .largeTitle))
                .foregroundStyle(theme.onSurface)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text("When everything is too much, start with your body. One step at a time. Skip any step that isn’t "
                 + "right for you.")
                .font(theme.font(.body, size: 16, relativeTo: .body))
                .foregroundStyle(theme.onSurfaceVariant)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var stepCard: some View {
        let s = Self.steps[step]
        let head = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 14))
        return VStack(alignment: .leading, spacing: 14) {
            head {
                Image(systemName: s.symbol)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(theme.accentText)
                    .frame(width: 52, height: 52)
                    .background(theme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Step \(step + 1) of \(Self.steps.count)")
                        .font(theme.font(.label, size: 12, relativeTo: .caption))
                        .foregroundStyle(theme.onSurfaceVariant)
                    Text(s.title)
                        .font(theme.font(.display, size: 26, relativeTo: .title))
                        .foregroundStyle(theme.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(s.duration)
                        .font(theme.font(.mono, size: 13, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
            }
            Text(s.body)
                .font(theme.font(.body, size: 19, relativeTo: .body))
                .lineSpacing(5)
                .foregroundStyle(theme.onSurface)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.surfaceContainer, in: RoundedRectangle(cornerRadius: theme.skinRadius(24), style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.skinRadius(24), style: .continuous)
            .strokeBorder(theme.line, lineWidth: theme.isSignal ? theme.border : 1))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .accessibilityFocused($stepFocused)
    }

    private var reassurance: some View {
        Text("You are doing a great job managing this moment. This state is temporary and your body is capable of "
             + "finding its way back to calm.")
            .font(theme.font(.body, size: 15, relativeTo: .callout))
            .italic()
            .multilineTextAlignment(.center)
            .foregroundStyle(theme.onSurfaceVariant)
            .frame(maxWidth: .infinity)
            .padding(18)
            .background(theme.surfaceLow, in: RoundedRectangle(cornerRadius: theme.skinRadius(20), style: .continuous))
    }

    private var progress: some View {
        HStack(spacing: 6) {
            ForEach(0..<Self.steps.count, id: \.self) { i in
                Capsule()
                    .fill(i <= step ? theme.accent : theme.onSurface.opacity(0.14))
                    .frame(height: 4)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Step \(step + 1) of \(Self.steps.count)")
    }

    private var controls: some View {
        VStack(spacing: 12) {
            if step < Self.steps.count - 1 {
                Button {
                    step += 1
                } label: {
                    Label("Next step", systemImage: "arrow.right").frame(maxWidth: .infinity)
                }
                .buttonStyle(.npPrimary)
                .keyboardShortcut(.defaultAction)
            }
            HStack(spacing: 12) {
                if step > 0 {
                    Button {
                        step -= 1
                    } label: {
                        Label("Back", systemImage: "arrow.left").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.npSecondary)
                }
                Button {
                    askingHowYouAre = true
                } label: {
                    Text("I’m OK for now").frame(maxWidth: .infinity)
                }
                .buttonStyle(step == Self.steps.count - 1 ? AnyButtonStyle(.npPrimary) : AnyButtonStyle(.npSecondary))
            }
        }
    }

    /// "I'm OK for now" → a gentle check-in, then back where you were.
    private var checkInPrompt: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(stillOverwhelmed ? "That’s okay. Stay as long as you need." : "Glad you’re here. How are you now?")
                .font(theme.font(.display, size: 26, relativeTo: .title))
                .foregroundStyle(theme.onSurface)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($stepFocused)
            if stillOverwhelmed {
                Text("Start the steps again, or call someone below. Nothing else is needed from you.")
                    .font(theme.font(.body, size: 16, relativeTo: .body))
                    .foregroundStyle(theme.onSurfaceVariant)
                Button {
                    stillOverwhelmed = false
                    askingHowYouAre = false
                    step = 0
                } label: {
                    Label("Start the steps again", systemImage: "arrow.counterclockwise").frame(maxWidth: .infinity)
                }
                .buttonStyle(.npPrimary)
            } else {
                ForEach(NervousState.allCases, id: \.self) { s in
                    Button {
                        day.checkIn(s, level: s.middleLevel)
                        if s == .red {
                            stillOverwhelmed = true
                            AccessibilityNotification.Announcement("That’s okay. Stay as long as you need.").post()
                        } else {
                            leave()
                        }
                    } label: {
                        HStack(spacing: 12) {
                            StateGlyph(s, color: theme.homeTint(s), size: 16)
                                .frame(width: 40, height: 40)
                                .background(theme.homeTint(s).opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                            Text(s == .red ? "Still overwhelmed" : s.spokenLabel)
                                .font(theme.font(.bodySemi, size: 16, relativeTo: .body))
                                .foregroundStyle(theme.onSurface)
                            Spacer(minLength: 0)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, minHeight: 60)
                        .background(theme.surfaceContainer, in: RoundedRectangle(cornerRadius: theme.skinRadius(16),
                                                                                 style: .continuous))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(s == .red ? "Still overwhelmed" : s.spokenLabel)
                }
                Button("Not now") { leave() }
                    .font(theme.font(.bodySemi, size: 15, relativeTo: .body))
                    .foregroundStyle(theme.accentText)
                    .frame(minHeight: 44)
            }
        }
    }

    private var helpLines: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("If you need a person now")
                .font(theme.font(.displaySemi, size: 17, relativeTo: .headline))
                .foregroundStyle(theme.onSurface)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($helpFocused)
            ForEach(HelpLines.all) { line in
                Button {
                    if let url = line.url { openURL(url) }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "phone.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(theme.accentText)
                            .frame(width: 40, height: 40)
                            .background(theme.accent.opacity(0.12), in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(line.name): \(line.number)")
                                .font(theme.font(.bodySemi, size: 16, relativeTo: .body))
                                .foregroundStyle(theme.onSurface)
                            Text(line.note)
                                .font(theme.font(.body, size: 13, relativeTo: .footnote))
                                .foregroundStyle(theme.onSurfaceVariant)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(theme.surfaceLow, in: RoundedRectangle(cornerRadius: theme.skinRadius(16), style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Call \(line.name), \(line.number). \(line.note)")
            }
            Text(HelpLines.elsewhere)
                .font(theme.font(.body, size: 14, relativeTo: .callout))
                .foregroundStyle(theme.onSurfaceVariant)
        }
    }

    // MARK: -

    private func announceStep() {
        guard !askingHowYouAre else { return }
        let s = Self.steps[step]
        AccessibilityNotification.Announcement("Step \(step + 1) of \(Self.steps.count): \(s.title). \(s.duration).").post()
        stepFocused = true
    }

    /// Back where you were.
    private func leave() {
        if nav.calmOpen {
            nav.calmOpen = false
        } else {
            dismiss()
        }
    }
}

/// A button style chosen at run time.
struct AnyButtonStyle: ButtonStyle {
    private let make: (Configuration) -> AnyView
    init<S: ButtonStyle>(_ style: S) { make = { AnyView(style.makeBody(configuration: $0)) } }
    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}

/// The paced-breathing guide: in 4, hold 2, out 6. A circle that grows and
/// shrinks — or, with motion off, a still circle and the count in words.
/// Optional haptic pacing and spoken phases; nothing starts by itself.
struct BreathingGuide: View {
    @Environment(\.npTheme) private var theme
    @AppStorage("np.calm.haptics") private var haptics = false
    @AppStorage("np.calm.voice") private var voice = false
    @State private var startedAt: Date?
    @State private var speech = AVSpeechSynthesizer()

    private static let phases: [(name: String, seconds: Int)] = [("Breathe in", 4), ("Hold", 2), ("Breathe out", 6)]
    private static let cycle = 12

    var body: some View {
        VStack(spacing: 14) {
            if let startedAt {
                TimelineView(.animation(minimumInterval: theme.animates ? 1.0 / 30 : 0.5)) { ctx in
                    let t = ctx.date.timeIntervalSince(startedAt)
                    let (name, left, scale) = Self.state(at: t)
                    circle(scale: theme.animates ? scale : 0.8, name: name, count: left)
                        .sensoryFeedback(.impact(weight: .light, intensity: 0.6), trigger: Int(t)) { _, _ in haptics }
                        .onChange(of: name) { _, phase in
                            if voice { say(phase) }
                            AccessibilityNotification.Announcement(phase).post()
                        }
                }
                .frame(height: 220)
            } else {
                circle(scale: 0.8, name: "In 4 · hold 2 · out 6", count: nil).frame(height: 220)
            }
            HStack(spacing: 12) {
                Button {
                    startedAt = startedAt == nil ? Date() : nil
                    if startedAt == nil { speech.stopSpeaking(at: .word) } else if voice { say("Breathe in") }
                } label: {
                    Label(startedAt == nil ? "Start breathing" : "Pause", systemImage: startedAt == nil ? "play.fill" : "pause.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.npSecondary)
            }
            Toggle("Haptic pacing", isOn: $haptics)
            Toggle("Say the phases out loud", isOn: $voice)
        }
        .font(theme.font(.body, size: 15, relativeTo: .body))
        .foregroundStyle(theme.onSurface)
        .tint(theme.accentText)
        .onDisappear { speech.stopSpeaking(at: .immediate) }
    }

    private func circle(scale: CGFloat, name: String, count: Int?) -> some View {
        ZStack {
            Circle().fill(theme.accent.opacity(0.10)).frame(width: 200, height: 200)
            Circle()
                .fill(theme.accent.opacity(0.22))
                .overlay(Circle().strokeBorder(theme.accent.opacity(0.6), lineWidth: 2))
                .frame(width: 200 * scale, height: 200 * scale)
            VStack(spacing: 2) {
                Text(name)
                    .font(theme.font(.displaySemi, size: count == nil ? 15 : 20, relativeTo: .headline))
                    .multilineTextAlignment(.center)
                if let count {
                    Text("\(count)").font(theme.font(.mono, size: 28, relativeTo: .title)).monospacedDigit()
                }
            }
            .foregroundStyle(theme.onSurface)
            .padding(.horizontal, 24)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(count.map { "\(name), \($0)" } ?? "Breathing guide: in for 4, hold for 2, out for 6")
    }

    /// The phase, seconds left in it, and the circle's size at `t` seconds.
    static func state(at t: TimeInterval) -> (String, Int, CGFloat) {
        let x = t.truncatingRemainder(dividingBy: Double(cycle))
        if x < 4 { return ("Breathe in", Int((4 - x).rounded(.up)), 0.55 + 0.45 * ease(x / 4)) }
        if x < 6 { return ("Hold", Int((6 - x).rounded(.up)), 1) }
        return ("Breathe out", Int((12 - x).rounded(.up)), 1 - 0.45 * ease((x - 6) / 6))
    }

    private static func ease(_ p: Double) -> Double { 0.5 - 0.5 * cos(min(1, max(0, p)) * .pi) }

    private func say(_ text: String) {
        let u = AVSpeechUtterance(string: text)
        u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.85
        speech.stopSpeaking(at: .immediate)
        speech.speak(u)
    }
}
