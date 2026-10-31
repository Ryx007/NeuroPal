import NPCore
import NPDay
import NPTheme
import SwiftUI

/// Pal as a buddy (PalBuddy.jsx): a small floating Pal that opens the
/// assistant. Its face mirrors the check-in; during "Sit with me" it becomes
/// a pill with the time left and stays up even when the bubble is hidden.
/// Drag it to either edge; it remembers its side and height.
///
/// It lays itself out inside whatever space it's given — overlay it on a
/// tab's content full-size (not pinned to a corner): it keeps inside the
/// safe area, so the tab bar and the status bar stay clear.
public struct PalBubble: View {
    @Environment(AppNavigator.self) private var nav
    @Environment(DayStore.self) private var day
    @Environment(AppPreferences.self) private var prefs
    @Environment(\.npTheme) private var theme

    /// Leading or trailing edge, and how far down (0 = top, 1 = bottom of
    /// the allowed band).
    @AppStorage("np.palBubble.leading") private var leading = false
    @AppStorage("np.palBubble.height") private var height = 1.0
    @State private var dragOffset: CGSize = .zero
    @GestureState private var dragging = false
    @State private var settled = 0

    private let size: CGFloat = 52
    /// Margin inside the safe area (which already keeps the tab bar and
    /// the status bar clear when the bubble is laid over a tab's content).
    private let margin: CGFloat = 12
    private let edge: CGFloat = 16

    public init() {}

    private var sit: SitSession? { day.day.sit }
    private var visible: Bool { !nav.palOpen && (!prefs.palBubbleHidden || sit != nil) }

    public var body: some View {
        GeometryReader { geo in
            if visible {
                TimelineView(.periodic(from: .now, by: 15)) { ctx in
                    bubble(now: ctx.date)
                        .highPriorityGesture(dragGesture(in: Area(geo)))
                        .offset(dragOffset)
                        .position(position(in: Area(geo)))
                }
                .transition(.opacity)
            }
        }
        // The keyboard covers the bubble instead of pushing it onto the field.
        .ignoresSafeArea(.keyboard)
        .animation(theme.animates ? .easeInOut(duration: 0.2) : nil, value: visible)
        .sensoryFeedback(.impact(weight: .light), trigger: settled)
        .onChange(of: dragging) { _, isDragging in
            // A drag the system cancelled: back to where it was.
            if !isDragging && dragOffset != .zero { withAnimation(snap) { dragOffset = .zero } }
        }
        .onAppear { day.pal = theme.appearance.pal }
    }

    private var snap: Animation? { theme.animates ? .spring(response: 0.35, dampingFraction: 0.82) : nil }

    // MARK: Placement

    /// Where the bubble may go: the container minus its safe-area insets.
    struct Area {
        var size: CGSize
        var insets: EdgeInsets
        init(_ geo: GeometryProxy) {
            size = geo.size
            insets = geo.safeAreaInsets
        }
    }

    private func band(_ area: Area) -> ClosedRange<CGFloat> {
        let top = area.insets.top + margin + size / 2
        let bottom = max(top, area.size.height - area.insets.bottom - margin - size / 2)
        return top...bottom
    }

    private func position(in area: Area) -> CGPoint {
        let b = band(area)
        let y = b.lowerBound + (b.upperBound - b.lowerBound) * min(1, max(0, height))
        let x = leading ? area.insets.leading + edge + width / 2
            : area.size.width - area.insets.trailing - edge - width / 2
        return CGPoint(x: x, y: y)
    }

    private var width: CGFloat {
        guard let status = status(now: Date()) else { return size }
        return size + 14 + CGFloat(status.short.count) * 8
    }

    private func dragGesture(in area: Area) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .updating($dragging) { _, state, _ in state = true }
            .onChanged { v in dragOffset = v.translation }
            .onEnded { v in
                let p = position(in: area)
                let x = p.x + v.translation.width
                let y = p.y + v.translation.height
                let b = band(area)
                withAnimation(snap) {
                    leading = x < area.size.width / 2
                    height = b.upperBound > b.lowerBound
                        ? Double((min(b.upperBound, max(b.lowerBound, y)) - b.lowerBound) / (b.upperBound - b.lowerBound)) : 1
                    dragOffset = .zero
                }
                settled += 1
            }
    }

    // MARK: Drawing

    /// The pill's words; `spoken` starts with the visible words (WCAG 2.5.3).
    private func status(now: Date) -> (short: String, spoken: String)? {
        guard let sit else { return nil }
        if !sit.isRunning { return ("Nice. Note it?", "Nice. Note it? Your session is done.") }
        if sit.checkIn == .asked { return ("Still with it?", "Still with it? Either answer is fine.") }
        let s = sit.endsAt.timeIntervalSince(now)
        if s < 60 { return ("<1 min", "Under a minute left, sitting with you.") }
        let m = sit.minutesLeft(at: now)
        return ("\(m) min", "\(m) min left, sitting with you.")
    }

    private func bubble(now: Date) -> some View {
        let pal = theme.appearance.pal
        let st = status(now: now)
        let sh = theme.isSignal ? max(3, theme.shadow) : 0
        let r = theme.isSignal ? theme.radiusControl : size / 2
        let shape = RoundedRectangle(cornerRadius: min(r, size / 2), style: .continuous)
        return Button {
            nav.open(.pal(sit != nil ? .sit : nil))
        } label: {
            HStack(spacing: 0) {
                PalAvatar(pal: pal, palette: theme.palette, mood: PalMood(day.day.state), size: size - 6,
                          motion: theme.motionLevel)
                    .frame(width: size - 4, height: size)
                if let st {
                    Text(st.short)
                        .font(theme.isSignal ? theme.font(.label, size: 12, relativeTo: .caption)
                              : theme.font(.bodySemi, size: 13, relativeTo: .caption))
                        .tracking(theme.isSignal ? 0.6 : 0)
                        .textCase(theme.isSignal ? .uppercase : nil)
                        .foregroundStyle(theme.onSurface)
                        .lineLimit(1)
                        .fixedSize()
                        .padding(.trailing, 14)
                }
            }
            .frame(minWidth: size, minHeight: size)
            .background(shape.fill(theme.isSignal ? theme.surfaceContainer : theme.surfaceContainer.opacity(0.94)))
            .overlay(shape.strokeBorder(theme.isSignal ? theme.control : theme.outline,
                                        lineWidth: theme.isSignal ? max(1.5, theme.border) : 1))
            .background(shape.fill(theme.shadowColor).offset(x: sh, y: sh))
            .shadow(color: theme.isSignal ? .clear : theme.shadowColor.opacity(0.28), radius: 10, y: 4)
            .contentShape(shape)
        }
        .buttonStyle(BubblePress(shift: sh))
        .accessibilityLabel(st.map { "\($0.spoken) Open \(pal.name), your assistant." } ?? "Open \(pal.name), your assistant")
        .accessibilityAction(named: leading ? "Move to the right edge" : "Move to the left edge") {
            withAnimation(snap) { leading.toggle() }
            settled += 1
        }
        .hoverEffect(.lift)
    }
}

/// Signal: the bubble sinks into its hard shadow when pressed.
private struct BubblePress: ButtonStyle {
    @Environment(\.npTheme) private var theme
    let shift: CGFloat
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .offset(x: configuration.isPressed ? shift : 0, y: configuration.isPressed ? shift : 0)
            .opacity(configuration.isPressed && shift == 0 ? 0.85 : 1)
    }
}
