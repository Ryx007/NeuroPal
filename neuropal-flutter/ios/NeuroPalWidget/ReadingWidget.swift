import SwiftUI
import WidgetKit

// "Resume reading": the paper or book you were last in, with its progress.
// Tapping opens the app. (Opening straight into that document needs a deep
// link route in the Flutter app first — PLATFORM-PLAN §4, M2.)

struct ReadingWidgetView: View {
    let entry: SnapshotEntry
    @Environment(\.widgetFamily) private var family

    private var progress: Double { min(1, max(0, entry.snap.readingProgress ?? 0)) }
    private var title: String { entry.snap.readingTitle ?? "Nothing open yet" }

    var body: some View {
        let t = entry.theme
        if family == .accessoryRectangular {
            VStack(alignment: .leading, spacing: 2) {
                Text("RESUME").font(.system(size: 10, weight: .bold, design: .monospaced))
                Text(title).font(.headline).lineLimit(2)
                ProgressView(value: progress)
            }
            .accessibilityElement(children: .combine)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("RESUME READING")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(t.onSurfaceVariant)
                Text(title)
                    .font(.system(size: family == .systemSmall ? 14 : 16, weight: .bold))
                    .foregroundStyle(t.onSurface)
                    .lineLimit(family == .systemSmall ? 3 : 2)
                Spacer(minLength: 0)
                HStack(spacing: 2) {
                    let segs = family == .systemSmall ? 8 : 12
                    let filled = Int((progress * Double(segs)).rounded())
                    ForEach(0..<segs, id: \.self) { k in
                        Rectangle()
                            .fill(k < filled ? t.accentFill : Color.clear)
                            .overlay(Rectangle().stroke(t.outline, lineWidth: k < filled ? 0 : 1))
                            .frame(width: 8, height: 8)
                    }
                    Text("\(Int((progress * 100).rounded()))%")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(t.onSurfaceVariant)
                        .padding(.leading, 4)
                }
                .accessibilityHidden(true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Resume reading \(title), \(Int((progress * 100).rounded())) percent read")
        }
    }
}

struct ReadingWidget: Widget {
    let kind = "NeuroPalReading"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            ReadingWidgetView(entry: entry)
                .containerBackground(for: .widget) { entry.theme.surface }
        }
        .configurationDisplayName("Resume reading")
        .description("Jump back into what you were reading.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
