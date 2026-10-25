import ActivityKit
import SwiftUI
import WidgetKit

// A focus block on the Lock Screen and in the Dynamic Island: a countdown,
// nothing else. The system draws the timer itself, so it keeps counting
// without the app running.

private func countdown(to end: Date) -> ClosedRange<Date> {
    // Text(timerInterval:) needs lower ≤ upper; an ended block shows 0:00.
    let now = Date()
    return min(now, end)...end
}

struct FocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            let t = WidgetTheme(SharedStore.load())
            let isWork = context.state.phase == "work"
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(isWork ? "FOCUS" : "BREAK")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(t.accentText)
                    Text(context.attributes.title)
                        .font(.headline)
                        .foregroundStyle(t.onSurface)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Text(timerInterval: countdown(to: context.state.endsAt), countsDown: true)
                    .monospacedDigit()
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(t.onSurface)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 104, alignment: .trailing)
            }
            .padding(16)
            .activityBackgroundTint(t.surface)
            .activitySystemActionForegroundColor(t.onSurface)
            .accessibilityElement(children: .combine)
        } dynamicIsland: { context in
            let isWork = context.state.phase == "work"
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(isWork ? "Focus" : "Break", systemImage: isWork ? "timer" : "cup.and.saucer")
                        .font(.caption)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: countdown(to: context.state.endsAt), countsDown: true)
                        .monospacedDigit()
                        .frame(width: 64, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.attributes.title)
                        .font(.caption)
                        .lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: isWork ? "timer" : "cup.and.saucer")
            } compactTrailing: {
                Text(timerInterval: countdown(to: context.state.endsAt), countsDown: true)
                    .monospacedDigit()
                    .frame(width: 44)
            } minimal: {
                Image(systemName: "timer")
            }
        }
    }
}
