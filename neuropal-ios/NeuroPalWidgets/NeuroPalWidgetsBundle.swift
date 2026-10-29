import NPCore
import NPDay
import NPTokens
import SwiftUI
import WidgetKit

/// The widgets. SKELETON — owned by the Home+Pal agent: the check-in widget
/// (App Intents for Okay / Bit off; Overwhelmed opens neuropal://calm),
/// next anchor, continue reading, Pal. The Flutter app's extension
/// (neuropal-flutter/ios/NeuroPalWidget) is a working reference.
@main
struct NeuroPalWidgetsBundle: WidgetBundle {
    var body: some Widget {
        StateWidget()
    }
}

struct StateEntry: TimelineEntry {
    let date: Date
    let state: NervousState?
    let palette: Palette
}

struct StateProvider: TimelineProvider {
    func placeholder(in context: Context) -> StateEntry {
        StateEntry(date: Date(), state: nil, palette: .classicDefault)
    }

    func getSnapshot(in context: Context, completion: @escaping (StateEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StateEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .after(Date().addingTimeInterval(30 * 60))))
    }

    private func entry() -> StateEntry {
        let day = SharedContainer.read(DayData.self, from: DayStore.fileName)
        let look = SharedContainer.read(JSONValue.self, from: "appearance.json").map { Tokens.normalizeAppearance($0) }
        return StateEntry(date: Date(), state: day?.state, palette: Tokens.palette(for: look ?? .default))
    }
}

struct StateWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "io.neuropal.ios.state", provider: StateProvider()) { entry in
            VStack(alignment: .leading, spacing: 6) {
                Text("NeuroPal").font(.caption.weight(.semibold))
                Text(entry.state?.label ?? "How are you?").font(.headline)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .widgetURL(DeepLink.url(for: .tab(.home)))
            .containerBackground(for: .widget) { Color(hex: entry.palette.surface) }
            .foregroundStyle(Color(hex: entry.palette.onSurface))
        }
        .configurationDisplayName("Check-in")
        .description("How you are right now, one tap from your home screen.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

extension Color {
    /// "#RRGGBB" → Color (the widget doesn't link NPTheme).
    init(hex: String) {
        let v = UInt64(hex.dropFirst(), radix: 16) ?? 0
        self = Color(.sRGB, red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255,
                     blue: Double(v & 0xFF) / 255, opacity: 1)
    }
}
