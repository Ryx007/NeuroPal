import AppIntents
import SwiftUI
import WidgetKit

// Green / yellow / red check-in from the Home Screen (Module 2), three taps,
// no app launch. Every option carries a shape as well as a word, so the
// state never depends on colour alone.

struct SetStateIntent: AppIntent {
    static var title: LocalizedStringResource = "Check in"
    static var description = IntentDescription("Tell NeuroPal how you feel right now.")

    @Parameter(title: "State")
    var state: String

    init() {}

    init(state: String) {
        self.state = state
    }

    func perform() async throws -> some IntentResult {
        SharedStore.setState(state)
        return .result()
    }
}

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snap: SharedStore.Snapshot
    var theme: WidgetTheme { WidgetTheme(snap) }
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: .now, snap: .fallback)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: .now, snap: SharedStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let entry = SnapshotEntry(date: .now, snap: SharedStore.load())
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(30 * 60))))
    }
}

struct StateOption: Identifiable {
    let id: String
    let label: String
    let short: String
    let spoken: String

    static let all = [
        StateOption(id: "green", label: "I feel okay", short: "Okay", spoken: "I feel okay"),
        StateOption(id: "yellow", label: "A bit off", short: "Bit off", spoken: "Feeling a bit off"),
        StateOption(id: "red", label: "Overwhelmed", short: "Overwhelmed", spoken: "Help, I'm overwhelmed"),
    ]
}

struct TriangleShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

struct StateGlyph: View {
    let id: String
    let color: Color

    var body: some View {
        switch id {
        case "green": Circle().fill(color)
        case "yellow": TriangleShape().fill(color)
        default: Rectangle().fill(color)
        }
    }
}

struct StateWidgetView: View {
    let entry: SnapshotEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let t = entry.theme
        VStack(alignment: .leading, spacing: 6) {
            Text(family == .systemSmall ? "HOW ARE YOU?" : "HOW ARE YOU FEELING RIGHT NOW?")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(t.onSurfaceVariant)
                .lineLimit(1)
            ForEach(StateOption.all) { option in
                let on = entry.snap.state == option.id
                Button(intent: SetStateIntent(state: option.id)) {
                    HStack(spacing: 7) {
                        StateGlyph(id: option.id, color: on ? t.accentInk : t.onSurface)
                            .frame(width: 9, height: 9)
                        Text(family == .systemSmall ? option.short : option.label)
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Spacer(minLength: 0)
                    }
                    .foregroundStyle(on ? t.accentInk : t.onSurface)
                    .padding(.horizontal, 8)
                    .frame(maxWidth: .infinity, minHeight: 30)
                    .background(
                        RoundedRectangle(cornerRadius: t.controlRadius, style: .continuous)
                            .fill(on ? t.accentFill : t.surfaceContainer)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: t.controlRadius, style: .continuous)
                            .stroke(on ? t.shadow : t.line, lineWidth: 1.5)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(option.spoken)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

struct StateWidget: Widget {
    let kind = "NeuroPalState"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            StateWidgetView(entry: entry)
                .containerBackground(for: .widget) { entry.theme.surface }
        }
        .configurationDisplayName("Check in")
        .description("Okay, a bit off or overwhelmed, in one tap.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
