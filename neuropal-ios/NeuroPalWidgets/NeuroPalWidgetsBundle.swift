import NPCore
import NPDay
import NPHome
import NPTheme
import SwiftUI
import WidgetKit

/// NeuroPal's widgets. Their content views live in NPHome (WidgetViews.swift)
/// so the app's widget gallery (-NPScreen widgets) draws exactly the same;
/// this extension adds the timelines, the container backgrounds, the deep
/// links and the check-in App Intent. Everything is read from the App
/// Group: day.json (NPDay), appearance.json (the look), reading.json (the reader).
@main
struct NeuroPalWidgetsBundle: WidgetBundle {
    init() {
        // The extension has no UIAppFonts: borrow the skins' fonts from the
        // containing app (system fonts if that fails — still readable).
        NPFonts.registerBundledFonts()
    }

    var body: some Widget {
        CheckInWidget()
        NextAnchorWidget()
        ReadingWidget()
        StateAccessoryWidget()
        AnchorAccessoryWidget()
    }
}

// MARK: - Timeline

struct DayEntry: TimelineEntry {
    let date: Date
    let model: HomeWidgetModel
}

/// One timeline for every widget: an entry now and every five minutes for
/// two hours (anchor countdowns stay honest), then WidgetKit asks again.
/// The app also reloads all timelines whenever it changes the day.
struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry {
        DayEntry(date: Date(), model: Self.sample(Date()))
    }

    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) {
        let now = Date()
        completion(DayEntry(date: now, model: context.isPreview ? Self.sample(now) : HomeWidgetModel.load(now: now)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        let now = Date()
        let day = DayFile.load()
        let look = SharedContainer.read(JSONValue.self, from: ThemeStore.fileName).map { Tokens.normalizeAppearance($0) }
            ?? .default
        let reading = ReadingSnapshot.load().map {
            PalLogic.ReadingItem(id: $0.documentID, title: $0.title, progress: $0.progress, lastReadAt: $0.updatedAt)
        }
        let first = HomeWidgetModel(day: day, appearance: look, reading: reading, now: now)
        let entries = [DayEntry(date: now, model: first)] + first.refreshDates.map {
            DayEntry(date: $0, model: HomeWidgetModel(day: day, appearance: look, reading: reading, now: $0))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }

    /// The widget gallery's preview: a day with a check-in and a paper.
    static func sample(_ now: Date) -> HomeWidgetModel {
        var day = DayData.starter
        day.recordCheckIn(.yellow, at: now, now: now)
        return HomeWidgetModel(day: day, appearance: .default,
                               reading: .init(id: "sample", title: "Correlation plenoptic imaging with entangled photons",
                                              progress: 0.42),
                               now: now)
    }
}

// MARK: - Check-in

struct CheckInWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "io.neuropal.ios.checkin", provider: DayProvider()) { entry in
            CheckInEntryView(entry: entry)
        }
        .configurationDisplayName("Check-in")
        .description("Okay, a bit off or overwhelmed, in one tap.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct CheckInEntryView: View {
    let entry: DayEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        CheckInWidgetView(model: entry.model, size: family == .systemSmall ? .small : .medium) { state, label in
            if state == .red {
                // Opens the calming steps; never records anything on its own.
                AnyView(Link(destination: DeepLink.url(for: .calm)) { label })
            } else {
                AnyView(Button(intent: CheckInIntent(state: state)) { label }.buttonStyle(.plain))
            }
        }
        .containerBackground(for: .widget) { entry.model.theme.surface }
        .widgetURL(DeepLink.url(for: .tab(.home)))
    }
}

// MARK: - Next anchor

struct NextAnchorWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "io.neuropal.ios.anchor", provider: DayProvider()) { entry in
            NextAnchorEntryView(entry: entry)
        }
        .configurationDisplayName("Next anchor")
        .description("The next timed thing of your day, with its window.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct NextAnchorEntryView: View {
    let entry: DayEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        NextAnchorWidgetView(model: entry.model, size: family == .systemSmall ? .small : .medium)
            .containerBackground(for: .widget) { entry.model.theme.surface }
            .widgetURL(DeepLink.url(for: .tab(.home)))
    }
}

// MARK: - Continue reading

struct ReadingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "io.neuropal.ios.reading", provider: DayProvider()) { entry in
            ReadingEntryView(entry: entry)
        }
        .configurationDisplayName("Continue reading")
        .description("Jump back into what you were reading.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct ReadingEntryView: View {
    let entry: DayEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        ReadingWidgetView(model: entry.model, size: family == .systemSmall ? .small : .medium)
            .containerBackground(for: .widget) { entry.model.theme.surface }
            .widgetURL(entry.model.reading.map { DeepLink.url(for: .reader(documentID: $0.id)) }
                       ?? DeepLink.url(for: .tab(.library)))
    }
}

// MARK: - Lock Screen

struct StateAccessoryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "io.neuropal.ios.state-accessory", provider: DayProvider()) { entry in
            StateAccessoryView(model: entry.model)
                .containerBackground(for: .widget) { AccessoryWidgetBackground() }
                .widgetURL(DeepLink.url(for: .tab(.home)))
        }
        .configurationDisplayName("Check-in")
        .description("How you checked in last.")
        .supportedFamilies([.accessoryCircular])
    }
}

struct AnchorAccessoryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "io.neuropal.ios.anchor-accessory", provider: DayProvider()) { entry in
            AnchorAccessoryView(model: entry.model)
                .containerBackground(for: .widget) { Color.clear }
                .widgetURL(DeepLink.url(for: .tab(.home)))
        }
        .configurationDisplayName("Next anchor")
        .description("The next timed thing of your day.")
        .supportedFamilies([.accessoryRectangular])
    }
}
