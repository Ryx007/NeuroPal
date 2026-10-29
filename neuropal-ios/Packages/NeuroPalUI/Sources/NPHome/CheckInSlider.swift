import NPCore
import NPDay
import NPTheme
import SwiftUI

/// "How are you feeling right now?" as a real slider (StateSlider.jsx). One
/// 0–100 track in three regions — Okay / Bit off / Overwhelmed. Drag the knob
/// or tap anywhere on the track: the region it rests in becomes the state and
/// the exact level is kept too. A haptic tick marks each region change while
/// dragging. VoiceOver adjusts it one state at a time and hears the state's
/// name. Landing in Overwhelmed never opens anything by itself: the tile
/// offers the calming steps (`onEnterRed`).
struct CheckInSlider: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Environment(\.dynamicTypeSize) private var typeSize

    /// Words and glyphs under the regions (large tiles).
    var legend = false
    /// The knob while a finger drags it (the Signal dial follows it).
    @Binding var live: Double?
    /// A check-in just landed in Overwhelmed from another state.
    var onEnterRed: () -> Void = {}

    @State private var width: CGFloat = 0
    @State private var bubbleWidth: CGFloat = 0
    @State private var direction: Direction = .undecided
    @State private var commits = 0
    @GestureState private var dragging = false
    @ScaledMetric(relativeTo: .caption) private var lane: CGFloat = 26

    private enum Direction { case undecided, horizontal, vertical }

    private let knob: CGFloat = 30
    private let track: CGFloat = 44
    private let bandHeight: CGFloat = 8
    private static let edges = [0, NervousState.lowerEdge, NervousState.upperEdge, 1]

    private var lineY: CGFloat { lane + track / 2 }
    private var span: CGFloat { max(0, width - knob) }
    private var stored: Double? { day.sliderLevel }
    private var position: Double? { live ?? stored }
    private var region: NervousState? { position.map(NervousState.forLevel) }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ZStack(alignment: .topLeading) {
                bands
                Rectangle()
                    .fill(theme.outline)
                    .frame(width: span, height: 1)
                    .offset(x: knob / 2, y: lineY - bandHeight / 2 + bandHeight + 2)
                if theme.isSignal { ticks }
                bubble
                knobView
            }
            .frame(maxWidth: .infinity, minHeight: lane + track, maxHeight: lane + track, alignment: .topLeading)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { p in commit(level(at: p.x)) }
            .simultaneousGesture(drag)
            .onChange(of: dragging) { _, isDragging in
                if !isDragging {
                    live = nil
                    direction = .undecided
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("How you feel")
            .accessibilityValue(stored.map { NervousState.forLevel($0).label } ?? "Not checked in yet")
            .accessibilityHint("Swipe up or down to move between Okay, Bit off and Overwhelmed.")
            .accessibilityAdjustableAction { dir in
                let now = day.day.state
                if dir == .increment {
                    step(to: now.map { $0.next ?? $0 } ?? .green)
                } else {
                    step(to: now.map { $0.previous ?? $0 } ?? .green)
                }
            }
            .sensoryFeedback(.selection, trigger: live.map(NervousState.forLevel)) { old, new in
                old != nil && new != nil && old != new
            }
            .sensoryFeedback(.impact(weight: .light), trigger: commits)
            .animation(theme.animates ? .spring(response: 0.32, dampingFraction: 0.86) : nil, value: stored)

            if legend { legendRow }
        }
    }

    // MARK: Interaction

    private var drag: some Gesture {
        DragGesture(minimumDistance: 6, coordinateSpace: .local)
            .updating($dragging) { _, state, _ in state = true }
            .onChanged { v in
                if direction == .undecided {
                    direction = abs(v.translation.width) >= abs(v.translation.height) ? .horizontal : .vertical
                }
                guard direction == .horizontal else { return }
                live = level(at: v.location.x)
            }
            .onEnded { v in
                guard direction == .horizontal else { return }
                commit(level(at: v.location.x))
                live = nil
            }
    }

    private func level(at x: CGFloat) -> Double {
        guard span > 0 else { return 0.5 }
        return Double(min(1, max(0, (x - knob / 2) / span)))
    }

    /// A drag or tap: the region decides the state; the level is kept.
    private func commit(_ level: Double) {
        let snapped = Double(NervousState.value(level)) / 100
        let before = day.day.state
        let state = NervousState.forLevel(snapped)
        day.checkIn(state, level: snapped)
        commits += 1
        if state == .red && before != .red { onEnterRed() }
    }

    /// VoiceOver: one whole state at a time (the knob rests mid-region).
    private func step(to state: NervousState) {
        guard state != day.day.state else { return }
        let before = day.day.state
        day.checkIn(state, level: state.middleLevel)
        commits += 1
        if state == .red && before != .red { onEnterRed() }
    }

    // MARK: Drawing

    private var bands: some View {
        let gap: CGFloat = theme.isSignal ? 2 : 3
        return ForEach(Array(NervousState.allCases.enumerated()), id: \.element) { i, s in
            let x0 = knob / 2 + Self.edges[i] * span + (i > 0 ? gap / 2 : 0)
            let x1 = knob / 2 + Self.edges[i + 1] * span - (i < 2 ? gap / 2 : 0)
            let r = theme.isSignal ? min(2, theme.radiusControl) : bandHeight / 2
            let active = position != nil && region == s
            RoundedRectangle(cornerRadius: r, style: .continuous)
                .fill(theme.homeTint(s))
                .overlay {
                    if theme.isSignal && s == .red {
                        HazardStripes().fill(theme.shadowColor.opacity(0.6))
                            .clipShape(RoundedRectangle(cornerRadius: r, style: .continuous))
                    }
                }
                .frame(width: max(0, x1 - x0), height: bandHeight)
                .opacity(active ? 1 : 0.55)
                .animation(theme.animates ? .easeOut(duration: 0.16) : nil, value: active)
                .offset(x: x0, y: lineY - bandHeight / 2)
        }
    }

    /// Signal's tick ruler under the knob.
    private var ticks: some View {
        Path { p in
            for k in 1..<30 where k != 10 && k != 20 {
                let x = knob / 2 + CGFloat(k) / 30 * span
                p.addRect(CGRect(x: x - 0.75, y: lineY - 4 - 7, width: 1.5, height: 7))
            }
        }
        .fill(theme.outline)
        .overlay(
            Path { p in
                for e in Self.edges {
                    let x = knob / 2 + e * span
                    p.addRect(CGRect(x: x - 1, y: lineY - 4 - 15, width: 2, height: 15))
                }
            }
            .fill(theme.onSurfaceVariant))
        .allowsHitTesting(false)
    }

    private var bubbleText: String {
        guard let position, let region else { return "Drag or tap to check in" }
        return "\(region.label) · \(NervousState.value(position))"
    }

    private var bubble: some View {
        let tint = theme.homeTint(region)
        let x = knob / 2 + (position ?? 0.5) * span - bubbleWidth / 2
        let clamped = min(max(0, x), max(0, width - bubbleWidth))
        return HStack(spacing: 5) {
            if let region { StateGlyph(region, color: tint, size: theme.isSignal ? 9 : 11) }
            Text(bubbleText)
                .font(theme.isSignal ? theme.font(.label, size: 11, relativeTo: .caption)
                      : theme.font(.bodySemi, size: 12, relativeTo: .caption))
                .tracking(theme.isSignal ? 1 : 0)
                .textCase(theme.isSignal ? .uppercase : nil)
                .foregroundStyle(theme.onSurface)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(.horizontal, 8)
        .frame(minHeight: lane - 4)
        .background {
            if theme.isSignal {
                let r = min(4, (theme.radiusControl * 0.4).rounded())
                RoundedRectangle(cornerRadius: r).fill(theme.shadowColor).offset(x: 2, y: 2)
                RoundedRectangle(cornerRadius: r).fill(theme.surfaceContainer)
                RoundedRectangle(cornerRadius: r)
                    .strokeBorder(live != nil && region != nil ? tint : theme.control, lineWidth: 1.5)
            } else {
                Capsule().fill(theme.surfaceHigh)
                Capsule().strokeBorder(live != nil && region != nil ? tint.opacity(0.7) : theme.outlineVariant.opacity(0.5),
                                       lineWidth: 1)
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { bubbleWidth = $0 }
        .opacity(bubbleWidth > 0 ? 1 : 0)
        .offset(x: clamped)
        .allowsHitTesting(false)
    }

    private var knobView: some View {
        let tint = theme.homeTint(region)
        return ZStack {
            if theme.isSignal {
                let sh = min(3, max(2, theme.shadow))
                Circle().fill(theme.shadowColor).offset(x: sh, y: sh).padding(1)
                Circle()
                    .fill(RadialGradient(colors: [theme.surfaceHighest, theme.surfaceLowest],
                                         center: UnitPoint(x: 0.38, y: 0.32), startRadius: 0, endRadius: knob * 0.75))
                    .padding(1.5)
                Circle().strokeBorder(region != nil ? tint : theme.control, lineWidth: 2).padding(1.5)
            } else {
                Circle()
                    .fill(theme.surfaceHighest)
                    .shadow(color: region != nil ? tint.opacity(0.35) : theme.shadowColor.opacity(0.35), radius: 6, y: 2)
                Circle().strokeBorder(region != nil ? tint : theme.outline, lineWidth: 2.5)
            }
            if let region {
                StateGlyph(region, color: tint, size: theme.isSignal ? 11 : 13)
            } else {
                Circle().fill(theme.onSurfaceVariant).frame(width: 6, height: 6)
            }
        }
        .frame(width: knob, height: knob)
        .scaleEffect(live != nil && theme.animates ? 1.08 : 1)
        .offset(x: (position ?? 0.5) * span, y: lineY - knob / 2)
        .allowsHitTesting(false)
    }

    /// Words + glyphs under each region. Decorative for VoiceOver: the
    /// slider's own value already says the region. At the accessibility
    /// text sizes the words can't fit under their regions, so only the
    /// glyphs stay (the buttons above say the words).
    private var legendRow: some View {
        let words = !typeSize.isAccessibilitySize
        return HStack(spacing: 0) {
            ForEach(Array(NervousState.allCases.enumerated()), id: \.element) { i, s in
                let on = position != nil && region == s
                HStack(spacing: 4) {
                    StateGlyph(s, color: theme.homeTint(s), size: words ? (theme.isSignal ? 9 : 11) : 16)
                    if words {
                        Text(s.label)
                            .font(theme.isSignal ? theme.font(.label, size: 10.5, relativeTo: .caption2)
                                  : theme.font(.bodyMedium, size: 12, relativeTo: .caption))
                            .tracking(theme.isSignal ? 1 : 0)
                            .textCase(theme.isSignal ? .uppercase : nil)
                            .foregroundStyle(on ? theme.onSurface : theme.onSurfaceVariant)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                }
                .frame(width: max(0, (Self.edges[i + 1] - Self.edges[i]) * span))
                .padding(.top, words ? 0 : 4)
            }
        }
        .padding(.leading, knob / 2)
        .accessibilityHidden(true)
    }
}

/// Signal's state dial (the S-Today knob): its pointer follows the slider,
/// 0–1 sweeping −75°…+75°; unset rests to the left. Decorative.
struct StateDial: View {
    @Environment(\.npTheme) private var theme
    var position: Double?
    var size: CGFloat = 104

    private var angle: Double { position.map { -75 + 150 * $0 } ?? -110 }

    var body: some View {
        let c = size / 2
        let r = c - 15
        let pointer = r - 9
        ZStack {
            Path { p in
                for i in 0...26 {
                    let a = (-135 + Double(i) * 270 / 26) * .pi / 180
                    let r1 = c - 2
                    let r2 = c - (i % 13 == 0 ? 11 : 7)
                    p.move(to: CGPoint(x: c + r1 * sin(a), y: c - r1 * cos(a)))
                    p.addLine(to: CGPoint(x: c + r2 * sin(a), y: c - r2 * cos(a)))
                }
            }
            .stroke(theme.outline, lineWidth: 1.6)
            Circle().fill(theme.shadowColor).frame(width: 2 * r, height: 2 * r).offset(x: 3, y: 3)
            Circle()
                .fill(RadialGradient(colors: [theme.surfaceHighest, theme.surfaceLowest], center: UnitPoint(x: 0.38, y: 0.32),
                                     startRadius: 0, endRadius: r * 1.5))
                .overlay(Circle().stroke(theme.line, lineWidth: 2))
                .frame(width: 2 * r, height: 2 * r)
            Circle().stroke(theme.onSurface.opacity(0.08), lineWidth: 1.5).frame(width: 2 * (r - 7), height: 2 * (r - 7))
            Path { p in
                p.move(to: CGPoint(x: c, y: c - 7))
                p.addLine(to: CGPoint(x: c, y: c - pointer))
            }
            .stroke(theme.accentFill, style: StrokeStyle(lineWidth: 4, lineCap: .round))
            .rotationEffect(.degrees(angle))
            .animation(theme.animates ? .spring(response: 0.4, dampingFraction: 0.8) : nil, value: angle)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
