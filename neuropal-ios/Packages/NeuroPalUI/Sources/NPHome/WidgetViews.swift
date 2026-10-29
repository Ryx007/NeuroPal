import NPCore
import NPDay
import NPTheme
import SwiftUI
import WidgetKit

// The widgets' content, drawn here so the widget extension (which links
// NPHome) and the app's widget gallery (-NPScreen widgets) show exactly the
// same thing. The extension adds the container background, the timeline
// and the App Intent buttons; these views only draw.

/// Everything a widget shows, from the shared container.
public struct HomeWidgetModel: Sendable {
    public var state: NervousState?
    /// Slider level of the current state (for the lock-screen gauge).
    public var level: Double?
    public var next: DayAnchor?
    public var later: [DayAnchor]
    public var reading: PalLogic.ReadingItem?
    public var appearance: Appearance
    public var now: Date
    /// False until the app has saved a day (the widget asks to open it once).
    public var synced: Bool

    public init(day: DayData?, appearance: Appearance, reading: PalLogic.ReadingItem?, now: Date = Date()) {
        var d = day ?? .starter
        d.rollOver(now: now) // yesterday's done/skipped don't count
        state = d.state
        level = d.sliderLevel
        next = d.nextAnchor(now: now)
        later = d.anchorsAfterNext(now: now, limit: 2)
        self.reading = reading
        self.appearance = appearance
        self.now = now
        synced = day != nil
    }

    /// From the App Group: day.json, appearance.json, reading.json.
    public static func load(now: Date = Date()) -> HomeWidgetModel {
        let look = SharedContainer.read(JSONValue.self, from: ThemeStore.fileName).map { Tokens.normalizeAppearance($0) }
        let reading = ReadingSnapshot.load().map {
            PalLogic.ReadingItem(id: $0.documentID, title: $0.title, progress: $0.progress, lastReadAt: $0.updatedAt)
        }
        return HomeWidgetModel(day: DayFile.load(), appearance: look ?? .default, reading: reading, now: now)
    }

    public var theme: NPTheme { NPTheme(palette: Tokens.palette(for: appearance), appearance: appearance) }

    /// Minutes until the next anchor (negative once it has started).
    public var nextMinutes: Int? { next.map { DayData.minutesUntil($0, now: now) } }

    /// When the widget should next redraw: the next whole 5 minutes, an
    /// anchor time, or midnight — whichever comes first.
    public var refreshDates: [Date] {
        let cal = Calendar.current
        var dates: [Date] = []
        for k in 1...24 {
            if let d = cal.date(byAdding: .minute, value: 5 * k, to: now) { dates.append(d) }
        }
        return dates
    }
}

/// How a check-in button behaves: the widget wraps the label in an App
/// Intent button (or a Link for Overwhelmed); the gallery in a plain Button.
public typealias WidgetCheckInAction = (NervousState, AnyView) -> AnyView

public enum WidgetFamilySize: Sendable { case small, medium }

// MARK: - Check-in

public struct CheckInWidgetView: View {
    let model: HomeWidgetModel
    let size: WidgetFamilySize
    let action: WidgetCheckInAction

    public init(model: HomeWidgetModel, size: WidgetFamilySize, action: @escaping WidgetCheckInAction) {
        self.model = model
        self.size = size
        self.action = action
    }

    public var body: some View {
        let theme = model.theme
        Group {
            if size == .small {
                VStack(spacing: 6) {
                    ForEach(NervousState.allCases, id: \.self) { s in
                        action(s, AnyView(StateWidgetButton(state: s, selected: model.state == s, compact: true, theme: theme)))
                    }
                }
            } else {
                HStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 8) {
                            PalFigure(pal: model.appearance.pal, palette: theme.palette, mood: PalMood(model.state), size: 42)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(model.appearance.pal.name)
                                    .font(theme.font(.displaySemi, size: 15, relativeTo: .headline))
                                    .foregroundStyle(theme.onSurface)
                                    .lineLimit(1)
                                StateLine(state: model.state, theme: theme)
                            }
                        }
                        Spacer(minLength: 0)
                        AnchorLine(model: model, theme: theme)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(spacing: 6) {
                        ForEach(NervousState.allCases, id: \.self) { s in
                            action(s, AnyView(StateWidgetButton(state: s, selected: model.state == s, compact: false,
                                                                 theme: theme)))
                        }
                    }
                    .frame(width: 168)
                }
            }
        }
        .environment(\.npTheme, theme)
    }
}

/// One check-in button as drawn on a widget: glyph + word, the current
/// one filled and ticked (never colour alone).
struct StateWidgetButton: View {
    let state: NervousState
    let selected: Bool
    let compact: Bool
    let theme: NPTheme

    var body: some View {
        let fg = selected ? theme.accentInk : theme.onSurface
        let r: CGFloat = theme.isSignal ? max(3, theme.radiusControl * 0.5) : 12
        HStack(spacing: 7) {
            StateGlyph(state, color: fg, size: 10)
            Text(compact ? state.label : state.buttonLabel)
                .font(theme.font(theme.isSignal ? .bodyBold : .bodySemi, size: 13, relativeTo: .subheadline))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Spacer(minLength: 0)
            if selected {
                Image(systemName: "checkmark").font(.system(size: 11, weight: .bold))
            }
        }
        .foregroundStyle(fg)
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .frame(minHeight: 36)
        .background(selected ? theme.accentFill : theme.surfaceContainer, in: RoundedRectangle(cornerRadius: r, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: r, style: .continuous)
            .strokeBorder(selected ? theme.shadowColor : theme.line, lineWidth: 1.5))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(state == .red ? "\(state.spokenLabel). Opens the calming steps" : "Check in: \(state.spokenLabel)")
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }
}

private struct StateLine: View {
    let state: NervousState?
    let theme: NPTheme

    var body: some View {
        HStack(spacing: 5) {
            if let state {
                StateGlyph(state, color: theme.homeTint(state), size: 9)
                Text(state.label)
            } else {
                Text("How are you?")
            }
        }
        .font(theme.font(.bodyMedium, size: 12, relativeTo: .caption))
        .foregroundStyle(theme.onSurfaceVariant)
        .lineLimit(1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(state.map { "Checked in as \($0.label)" } ?? "No check-in yet")
    }
}

private struct AnchorLine: View {
    let model: HomeWidgetModel
    let theme: NPTheme

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let a = model.next, let m = model.nextMinutes {
                Text(theme.isSignal ? "NEXT" : "Next")
                    .font(theme.isSignal ? theme.font(.label, size: 10, relativeTo: .caption2)
                          : theme.font(.bodyMedium, size: 11, relativeTo: .caption2))
                    .foregroundStyle(theme.onSurfaceVariant)
                Text(a.title)
                    .font(theme.font(.bodySemi, size: 13, relativeTo: .footnote))
                    .foregroundStyle(theme.onSurface)
                    .lineLimit(1)
                Text("\(a.clock) · \(widgetRelative(m))")
                    .font(theme.font(.mono, size: 11, relativeTo: .caption2))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .lineLimit(1)
            } else {
                Text(model.synced ? "No more anchors today" : "Open NeuroPal once to sync your day")
                    .font(theme.font(.bodyMedium, size: 12, relativeTo: .caption))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .lineLimit(2)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.next.map { "Next anchor: \($0.title) at \($0.clock), \(widgetRelative(model.nextMinutes ?? 0, spoken: true))" }
                            ?? (model.synced ? "No more anchors today" : "Open NeuroPal once to sync your day"))
    }
}

/// "in 20 min" / "in 1 h 5 min" / "now" (relativeIn / relativeSpeech in widgets/model.js).
func widgetRelative(_ minutes: Int, spoken: Bool = false) -> String {
    if minutes <= 0 { return "now" }
    func unit(_ n: Int, _ short: String, _ long: String) -> String {
        spoken ? "\(n) \(long)\(n == 1 ? "" : "s")" : "\(n) \(short)"
    }
    if minutes < 60 { return "in " + unit(minutes, "min", "minute") }
    let h = minutes / 60
    let m = minutes % 60
    return m == 0 ? "in " + unit(h, "h", "hour") : "in " + unit(h, "h", "hour") + " " + unit(m, "min", "minute")
}

// MARK: - Next anchor

public struct NextAnchorWidgetView: View {
    let model: HomeWidgetModel
    let size: WidgetFamilySize

    public init(model: HomeWidgetModel, size: WidgetFamilySize) {
        self.model = model
        self.size = size
    }

    public var body: some View {
        let theme = model.theme
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    WidgetLabel("Next anchor", theme: theme)
                    Spacer(minLength: 4)
                    if let a = model.next {
                        Image(systemName: a.kind.symbol)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(theme.accentText)
                            .accessibilityHidden(true)
                    }
                }
                if let a = model.next, let m = model.nextMinutes {
                    let big = m <= 0 ? "NOW" : m < 100 ? "\(m)" : a.clock
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(big)
                            .font(theme.font(.display, size: m >= 100 ? 30 : 38, relativeTo: .largeTitle))
                            .foregroundStyle(theme.onSurface)
                            .minimumScaleFactor(0.6)
                            .lineLimit(1)
                        if m > 0 && m < 100 {
                            Text("MIN").font(theme.font(.label, size: 11, relativeTo: .caption2)).foregroundStyle(theme.onSurfaceVariant)
                        }
                    }
                    .padding(.top, 2)
                    Spacer(minLength: 0)
                    Text(a.title)
                        .font(theme.font(.bodySemi, size: 14, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurface)
                        .lineLimit(2)
                    Text(m >= 100 ? widgetRelative(m) : "\(a.clock) · \(windowLabel(a.flexMinutes))")
                        .font(theme.font(.mono, size: 11, relativeTo: .caption2))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .lineLimit(1)
                } else {
                    Spacer(minLength: 0)
                    Text(model.synced ? "No more anchors today" : "Open NeuroPal once to sync your day")
                        .font(theme.font(.bodySemi, size: 14, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurface)
                    if model.synced {
                        Text("Rest counts too.")
                            .font(theme.font(.body, size: 12, relativeTo: .caption))
                            .foregroundStyle(theme.onSurfaceVariant)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(spoken)
            if size == .medium {
                VStack(alignment: .leading, spacing: 8) {
                    WidgetLabel("Later", theme: theme)
                    if model.later.isEmpty {
                        Text("Nothing else timed today")
                            .font(theme.font(.body, size: 12, relativeTo: .caption))
                            .foregroundStyle(theme.onSurfaceVariant)
                    }
                    ForEach(model.later) { a in
                        HStack(spacing: 8) {
                            Text(a.clock).font(theme.font(.mono, size: 12, relativeTo: .caption)).foregroundStyle(theme.onSurfaceVariant)
                            Text(a.title).font(theme.font(.bodySemi, size: 13, relativeTo: .footnote)).foregroundStyle(theme.onSurface)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .accessibilityElement(children: .combine)
            }
        }
        .environment(\.npTheme, theme)
    }

    private var spoken: String {
        guard let a = model.next, let m = model.nextMinutes else {
            return model.synced ? "No more anchors today" : "Open NeuroPal once to sync your day"
        }
        return "Next anchor: \(a.title) at \(a.clock), \(widgetRelative(m, spoken: true)). Window \(windowLabel(a.flexMinutes))."
    }
}

// MARK: - Continue reading

public struct ReadingWidgetView: View {
    let model: HomeWidgetModel
    let size: WidgetFamilySize

    public init(model: HomeWidgetModel, size: WidgetFamilySize) {
        self.model = model
        self.size = size
    }

    public var body: some View {
        let theme = model.theme
        Group {
            if let r = model.reading {
                let pct = Int((min(1, max(0, r.progress)) * 100).rounded())
                HStack(alignment: .top, spacing: 12) {
                    if size == .medium {
                        Image(systemName: "book.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(theme.accentInk)
                            .frame(width: 52, height: 64)
                            .background(theme.accentFill, in: RoundedRectangle(cornerRadius: theme.isSignal ? 6 : 10,
                                                                              style: .continuous))
                            .accessibilityHidden(true)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        WidgetLabel("Continue reading", theme: theme)
                        Text(r.title)
                            .font(theme.font(.displaySemi, size: size == .small ? 15 : 17, relativeTo: .headline))
                            .foregroundStyle(theme.onSurface)
                            .lineLimit(size == .small ? 3 : 2)
                        Spacer(minLength: 0)
                        Segments(progress: r.progress, count: size == .small ? 8 : 12, theme: theme)
                        Text("\(pct)% read")
                            .font(theme.font(.mono, size: 11, relativeTo: .caption2))
                            .foregroundStyle(theme.onSurfaceVariant)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Continue reading \(r.title), \(pct) percent read")
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    WidgetLabel("Continue reading", theme: theme)
                    Spacer(minLength: 0)
                    Text("Nothing open yet")
                        .font(theme.font(.displaySemi, size: 15, relativeTo: .headline))
                        .foregroundStyle(theme.onSurface)
                    Text("Open a paper or a book in NeuroPal.")
                        .font(theme.font(.body, size: 12, relativeTo: .caption))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .accessibilityElement(children: .combine)
            }
        }
        .environment(\.npTheme, theme)
    }
}

private struct Segments: View {
    let progress: Double
    let count: Int
    let theme: NPTheme

    var body: some View {
        let filled = Int((min(1, max(0, progress)) * Double(count)).rounded())
        HStack(spacing: 2) {
            ForEach(0..<count, id: \.self) { k in
                Rectangle()
                    .fill(k < filled ? theme.accentFill : Color.clear)
                    .overlay(Rectangle().strokeBorder(theme.outline, lineWidth: k < filled ? 0 : 1))
                    .frame(width: 8, height: 8)
            }
        }
        .accessibilityHidden(true)
    }
}

private struct WidgetLabel: View {
    let text: String
    let theme: NPTheme
    init(_ text: String, theme: NPTheme) {
        self.text = text
        self.theme = theme
    }

    var body: some View {
        Text(text)
            .textCase(.uppercase)
            .font(theme.isSignal ? theme.font(.label, size: 10, relativeTo: .caption2) : theme.font(.bodySemi, size: 10,
                                                                                                   relativeTo: .caption2))
            .tracking(theme.isSignal ? 1.4 : 1.2)
            .foregroundStyle(theme.isSignal ? theme.outline : theme.accentText)
            .lineLimit(1)
    }
}

// MARK: - Lock Screen

/// Lock Screen, circular: the check-in as a gauge, with its glyph.
public struct StateAccessoryView: View {
    let model: HomeWidgetModel
    public init(model: HomeWidgetModel) { self.model = model }

    public var body: some View {
        // The arc shows the slider level; the centre the state's shape (the
        // slot is too small for the words — VoiceOver says them).
        Gauge(value: model.level ?? 0) {
            EmptyView()
        } currentValueLabel: {
            if let s = model.state {
                StateGlyphShape(s.shape).fill(.primary).frame(width: 18, height: 18)
            } else {
                Image(systemName: "questionmark")
            }
        }
        .gaugeStyle(.accessoryCircular)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.state.map { "Checked in as \($0.label)" } ?? "No check-in yet")
    }
}

/// Lock Screen, rectangular: the next anchor.
public struct AnchorAccessoryView: View {
    let model: HomeWidgetModel
    public init(model: HomeWidgetModel) { self.model = model }

    public var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let a = model.next, let m = model.nextMinutes {
                Label("Next anchor", systemImage: a.kind.symbol)
                    .font(.system(size: 12, weight: .semibold))
                    .widgetAccentable()
                Text(a.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                Text("\(a.clock) · \(widgetRelative(m))").font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1)
            } else {
                Label("Anchors", systemImage: "checkmark.circle")
                    .font(.system(size: 12, weight: .semibold))
                Text(model.synced ? "No more anchors today" : "Open NeuroPal once").font(.system(size: 14, weight: .semibold))
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.next.map { "Next anchor: \($0.title) at \($0.clock)" }
                            ?? (model.synced ? "No more anchors today" : "Open NeuroPal once to sync your day"))
    }
}
