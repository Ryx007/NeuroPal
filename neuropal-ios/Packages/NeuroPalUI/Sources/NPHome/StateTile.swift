import NPCore
import NPDay
import NPTheme
import SwiftUI

/// The check-in tile: three state buttons (one tap), the slider under them,
/// today's check-ins, and — while overwhelmed — the calming steps one tap
/// away. Nothing opens by itself. HomeScreen.jsx StateTile / SignalStateTile.
struct StateTile: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Environment(AppNavigator.self) private var nav
    @Environment(\.dynamicTypeSize) private var typeSize

    let size: String
    /// Signal's "> message" line (large tile).
    var message: String?

    @State private var live: Double?
    @AccessibilityFocusState private var calmFocused: Bool

    private var state: NervousState? { day.day.state }

    var body: some View {
        if theme.isSignal {
            SignalPanel(padding: size == "L" ? 14 : 12) { content }
        } else if size == "L" {
            ClassicCard(fill: theme.surfaceLow, radius: 26, padding: 20) { content }
        } else {
            content
        }
    }

    @ViewBuilder private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if size == "L" {
                if theme.isSignal && !typeSize.isAccessibilitySize {
                    HStack(alignment: .center, spacing: 12) {
                        StateDial(position: live ?? day.sliderLevel)
                        buttons(compact: false)
                    }
                    .padding(.top, 12)
                } else {
                    buttons(compact: false).padding(.top, 14)
                }
            } else {
                buttons(compact: !typeSize.isAccessibilitySize)
            }
            CheckInSlider(legend: size == "L", live: $live, onEnterRed: enteredRed)
                .padding(.top, size == "L" ? 14 : 8)
            if size != "S" { HistoryStrip().padding(.top, 10) }
            if theme.isSignal, size == "L", let message {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(">").font(theme.font(.label, size: 14, relativeTo: .body)).foregroundStyle(theme.accentText)
                        .accessibilityHidden(true)
                    Text(message).font(theme.font(.body, size: 14, relativeTo: .body)).foregroundStyle(theme.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 10)
            }
            if state == .red {
                Button {
                    nav.open(.calm)
                } label: {
                    Label("Open the calming steps", systemImage: "leaf")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.npPrimary)
                .accessibilityFocused($calmFocused)
                .padding(.top, 14)
            }
        }
    }

    @ViewBuilder private var header: some View {
        if size == "L" {
            if theme.isSignal {
                HStack {
                    SkinLabel("How are you feeling right now?").accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 8)
                    MonoText("CH·01", size: 10.5).accessibilityHidden(true)
                }
            } else {
                Text("How are you feeling right now?")
                    .font(theme.font(.displaySemi, size: 16, relativeTo: .headline))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .accessibilityAddTraits(.isHeader)
            }
        } else if size == "M" {
            Group {
                if theme.isSignal {
                    SkinLabel("How are you feeling?")
                } else {
                    Text("How are you feeling?")
                        .font(theme.font(.bodySemi, size: 13, relativeTo: .subheadline))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .padding(.leading, 4)
                }
            }
            .accessibilityAddTraits(.isHeader)
            .padding(.bottom, 8)
        }
    }

    /// The three one-tap check-ins: a column of rows (L) or a row of three (M/S).
    @ViewBuilder private func buttons(compact: Bool) -> some View {
        let layout = compact ? AnyLayout(HStackLayout(spacing: 8)) : AnyLayout(VStackLayout(spacing: theme.isSignal ? 8 : 10))
        layout {
            ForEach(NervousState.allCases, id: \.self) { s in
                StateButton(state: s, selected: state == s, compact: compact) { pick(s) }
                    .keyboardShortcut(KeyEquivalent(Character(String(s.index + 1))), modifiers: .command)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("How are you feeling right now?")
    }

    private func pick(_ s: NervousState) {
        let before = state
        day.checkIn(s, level: s.middleLevel)
        if s == .red && before != .red { enteredRed() }
    }

    /// Overwhelmed: say where the calming steps are and move VoiceOver to
    /// the button — but never open them uninvited.
    private func enteredRed() {
        AccessibilityNotification.Announcement("Overwhelmed. The calming steps are one tap away.").post()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(700))
            calmFocused = true
        }
    }
}

private extension NervousState {
    var index: Int { NervousState.allCases.firstIndex(of: self) ?? 0 }
}

/// One state button, both skins (StateOption / StateButton).
private struct StateButton: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    let state: NervousState
    let selected: Bool
    let compact: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            if theme.isSignal { signal } else { classic }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(state.spokenLabel)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .hoverEffect(.highlight)
    }

    private var tint: Color { theme.homeTint(state) }

    @ViewBuilder private var classic: some View {
        if compact {
            VStack(spacing: 4) {
                StateGlyph(state, color: tint, size: 16)
                Text(state.label)
                    .font(theme.font(.bodySemi, size: 12, relativeTo: .caption))
                    .foregroundStyle(theme.onSurface)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 4)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(selected ? tint.opacity(0.14) : theme.surfaceContainer,
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(selected ? tint : theme.outlineVariant.opacity(0.4), lineWidth: selected ? 2 : 1))
            .contentShape(Rectangle())
        } else {
            // At the accessibility sizes the words get the room (no chevron,
            // a smaller glyph tile) so "overwhelmed" never breaks mid-word.
            let big = typeSize.isAccessibilitySize
            HStack(spacing: big ? 10 : 12) {
                StateGlyph(state, color: tint, size: big ? 14 : 18)
                    .frame(width: big ? 32 : 44, height: big ? 32 : 44)
                    .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: big ? 9 : 12, style: .continuous))
                Text(state.spokenLabel)
                    .font(theme.font(.bodySemi, size: 15, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if selected || !big {
                    Image(systemName: selected ? "checkmark" : "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(selected ? tint : theme.outlineVariant)
                        .accessibilityHidden(true)
                }
            }
            .padding(big ? 10 : 14)
            .background(selected ? tint.opacity(0.08) : theme.surfaceContainer,
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(selected ? tint.opacity(0.4) : Color.clear, lineWidth: 1))
            .contentShape(Rectangle())
        }
    }

    @ViewBuilder private var signal: some View {
        let r = (theme.radiusControl * 0.6).rounded()
        let sh = selected ? min(4, theme.shadow) : 0
        let fg = selected ? theme.accentInk : theme.onSurface
        Group {
            if compact {
                VStack(spacing: 4) {
                    StateGlyph(state, color: fg, size: 12)
                    Text(state.label)
                        .font(theme.font(.bodyBold, size: 12.5, relativeTo: .caption))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                .padding(6)
                .frame(maxWidth: .infinity, minHeight: 56)
            } else {
                HStack(spacing: 10) {
                    StateGlyph(state, color: fg, size: 12)
                    Text(state.buttonLabel)
                        .font(theme.font(.bodyBold, size: 15, relativeTo: .body))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if !selected {
                        Circle().strokeBorder(theme.onSurfaceVariant, lineWidth: 1.5).frame(width: 10, height: 10)
                            .accessibilityHidden(true)
                    }
                }
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity, minHeight: 46)
            }
        }
        .foregroundStyle(fg)
        .background(selected ? theme.accentFill : theme.surfaceContainer.opacity(0.55),
                    in: RoundedRectangle(cornerRadius: r, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: r, style: .continuous)
            .strokeBorder(selected ? theme.shadowColor : theme.control, lineWidth: 1.5))
        .background(RoundedRectangle(cornerRadius: r, style: .continuous).fill(theme.shadowColor).offset(x: sh, y: sh))
        .contentShape(Rectangle())
    }
}

/// Today's check-ins as a row of glyphs and times.
struct HistoryStrip: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day

    var body: some View {
        let today = Array(day.day.checkins(on: Date()).suffix(8))
        if !today.isEmpty {
            HStack(spacing: 8) {
                Text("Today")
                    .font(theme.isSignal ? theme.font(.label, size: 10.5, relativeTo: .caption2)
                          : theme.font(.bodyMedium, size: 12, relativeTo: .caption))
                    .tracking(theme.isSignal ? 1 : 0)
                    .textCase(theme.isSignal ? .uppercase : nil)
                    .foregroundStyle(theme.onSurfaceVariant)
                WrapLayout(spacing: 6, lineSpacing: 6) {
                    ForEach(today) { c in
                        HStack(spacing: 4) {
                            StateGlyph(c.state, color: theme.homeTint(c.state), size: 9)
                            MonoText(c.at.formatted(date: .omitted, time: .shortened), size: 11)
                        }
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(theme.surfaceHigh.opacity(theme.isSignal ? 0.6 : 1),
                                    in: RoundedRectangle(cornerRadius: theme.isSignal ? 3 : 8, style: .continuous))
                    }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Today’s check-ins: " + today.map {
                "\($0.state.label) at \($0.at.formatted(date: .omitted, time: .shortened))"
            }.joined(separator: ", "))
        }
    }
}
