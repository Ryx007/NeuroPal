import NPCore
import NPDay
import NPTheme
import SwiftUI

// MARK: - Focus

/// Focus: the "Sit with me" block — Pal keeps you company while you work.
/// (In the Expo app this tile showed the Toolbox pomodoro, which shares its
/// clock with "Sit with me"; here the block IS the sit.)
struct FocusTile: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Environment(AppNavigator.self) private var nav

    let size: String
    var half = false
    let now: Date

    private var sit: SitSession? { day.day.sit }
    private var running: Bool { sit?.isRunning == true }

    private var title: String {
        guard let sit else { return "Ready" }
        if !sit.isRunning { return "Done" }
        return sit.checkIn == .asked ? "Still with it?" : "Focus block"
    }

    private var status: String {
        guard let sit else { return "25 min block" }
        if !sit.isRunning { return "Want to note it?" }
        return sit.leftLabel(at: now)
    }

    var body: some View {
        if size == "S" {
            OneLineTile(symbol: running ? "waveform" : "timer", label: "Focus", value: "\(title) · \(status)") {
                nav.open(.pal(.sit))
            }
        } else {
            Button {
                nav.open(.pal(.sit))
            } label: {
                if theme.isSignal { signal } else { classic }
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Focus: \(title), \(status). Opens Sit with me")
            .accessibilityAddTraits(.isButton)
            .hoverEffect(.lift)
        }
    }

    private var classic: some View {
        ClassicCard(fill: theme.surfaceContainer, radius: 22, padding: 16) {
            HStack(spacing: 14) {
                Image(systemName: running ? "waveform" : "timer")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(theme.accentText)
                    .frame(width: 52, height: 52)
                    .overlay(Circle().strokeBorder(running ? theme.accent : theme.outlineVariant, lineWidth: 3))
                VStack(alignment: .leading, spacing: 4) {
                    SkinLabel("Focus")
                    Text(running ? "\(title) · \(status)" : sit == nil ? "25 min block ready" : "\(title). \(status)")
                        .font(theme.font(.displaySemi, size: 17, relativeTo: .headline))
                        .foregroundStyle(theme.onSurface)
                    if size == "L" {
                        Text(sit.flatMap { $0.label.isEmpty ? nil : "Working on: \($0.label)" } ?? "Quiet company while you work")
                            .font(theme.font(.body, size: 12.5, relativeTo: .footnote))
                            .foregroundStyle(theme.onSurfaceVariant)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(theme.outline)
            }
        }
    }

    private var signal: some View {
        SignalPanel {
            HStack {
                SkinLabel("Focus")
                Spacer()
                Circle().fill(running ? theme.accentFill : theme.outline).frame(width: 8, height: 8)
            }
            FocusScope(running: running).padding(.top, 10)
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(theme.font(.bodyBold, size: 15, relativeTo: .body))
                        .foregroundStyle(theme.onSurface)
                        .lineLimit(2)
                    MonoText(status).lineLimit(1).minimumScaleFactor(0.75)
                }
                Spacer(minLength: 0)
                Image(systemName: running ? "waveform" : "play.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(theme.onSurface)
                    .frame(width: 44, height: 44)
                    .overlay(RoundedRectangle(cornerRadius: theme.radiusControl, style: .continuous)
                        .strokeBorder(theme.control, lineWidth: 1.5))
            }
            .padding(.top, 10)
        }
    }
}

/// Signal's Lissajous "scope": it drifts slowly while a block runs; still at
/// rest, and when motion is off. Decorative.
private struct FocusScope: View {
    @Environment(\.npTheme) private var theme
    let running: Bool

    var body: some View {
        let moving = running && theme.animates
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !moving)) { context in
            let speed = theme.motionLevel == "Calm" ? 0.35 : 0.8
            let phase = moving ? context.date.timeIntervalSinceReferenceDate * speed : 0.6
            Canvas { ctx, size in
                let grid = Color(token: theme.palette.grid).opacity(0.12)
                for y in [0.25, 0.5, 0.75] {
                    var p = Path()
                    p.move(to: CGPoint(x: 0, y: size.height * y))
                    p.addLine(to: CGPoint(x: size.width, y: size.height * y))
                    ctx.stroke(p, with: .color(grid), lineWidth: 0.5)
                }
                for x in [0.25, 0.5, 0.75] {
                    var p = Path()
                    p.move(to: CGPoint(x: size.width * x, y: 0))
                    p.addLine(to: CGPoint(x: size.width * x, y: size.height))
                    ctx.stroke(p, with: .color(grid), lineWidth: 0.5)
                }
                var trace = Path()
                for k in 0...120 {
                    let t = Double(k) / 120 * .pi * 2
                    let pt = CGPoint(x: size.width * (0.5 + 0.44 * sin(3 * t + phase)),
                                     y: size.height * (0.5 + 0.39 * sin(2 * t)))
                    if k == 0 { trace.move(to: pt) } else { trace.addLine(to: pt) }
                }
                ctx.stroke(trace, with: .color(theme.accentFill.opacity(0.9)), lineWidth: 1.4)
            }
        }
        .frame(height: 64)
        .background(theme.surfaceLowest.opacity(0.7))
        .clipShape(RoundedRectangle(cornerRadius: (theme.radiusControl * 0.5).rounded(), style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: (theme.radiusControl * 0.5).rounded(), style: .continuous)
            .strokeBorder(theme.line, lineWidth: 1))
        .accessibilityHidden(true)
    }
}

// MARK: - Minimum viable day

/// The minimum viable day: 3–5 things, checked off, re-set every morning.
struct MvdTile: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day

    let size: String
    @Binding var editing: Bool
    var onOpenSheet: () -> Void = {}

    private var tasks: [DayTask] { day.day.tasks }
    private var remaining: Int { day.day.remainingTasks }
    private var remainingWords: String { remaining == 0 ? "All done" : "\(remaining) left" }

    var body: some View {
        if size == "S" {
            OneLineTile(symbol: "checklist", label: theme.isSignal ? "Min. day" : "Minimum day", value: remainingWords.lowercased(),
                        spoken: "Minimum viable day: \(remaining == 0 ? "all done" : "\(remaining) of \(tasks.count) left")") {
                onOpenSheet()
            }
        } else if theme.isSignal {
            SignalPanel { MvdList(size: size, editing: $editing) }
        } else {
            MvdList(size: size, editing: $editing)
        }
    }
}

/// The checklist itself (the tile, and the sheet behind the S tile).
struct MvdList: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day

    let size: String
    @Binding var editing: Bool

    @State private var newTask = ""
    @FocusState private var addFocused: Bool

    private var tasks: [DayTask] { day.day.tasks }
    private var remaining: Int { day.day.remainingTasks }

    var body: some View {
        let shown = size == "M" && !editing ? Array(tasks.prefix(3)) : tasks
        let hidden = tasks.count - shown.count
        VStack(alignment: .leading, spacing: 0) {
            header
            VStack(spacing: theme.isSignal ? 0 : 10) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { i, t in
                    MvdRow(task: t, first: i == 0, editing: editing)
                }
            }
            .padding(.top, theme.isSignal ? 6 : 12)
            if tasks.isEmpty && !editing {
                Text("Nothing here yet. Pick three small things that would make today count.")
                    .font(theme.font(.body, size: 14, relativeTo: .body))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .padding(.vertical, 6)
            }
            if hidden > 0 {
                Button("+ \(hidden) more") { editing = true }
                    .font(theme.font(theme.isSignal ? .bodyBold : .bodySemi, size: 13, relativeTo: .subheadline))
                    .foregroundStyle(theme.accentText)
                    .frame(minHeight: 44)
                    .accessibilityLabel("Show \(hidden) more")
            }
            if editing { addRow.padding(.top, theme.isSignal ? 8 : 2) }
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            if theme.isSignal {
                SkinLabel("Minimum viable day").accessibilityAddTraits(.isHeader)
                Spacer(minLength: 4)
                Text(remaining == 0 ? "DONE" : "\(remaining) LEFT")
                    .font(theme.font(.label, size: 11, relativeTo: .caption))
                    .tracking(1)
                    .foregroundStyle(theme.accentText)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .overlay(Rectangle().strokeBorder(theme.accentText, lineWidth: 1.5))
                    .accessibilityLabel(remaining == 0 ? "All done" : "\(remaining) \(remaining == 1 ? "task" : "tasks") left")
            } else {
                // One line when it fits; otherwise the count goes under the
                // title and both may wrap (never wider than the screen).
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) { classicTitle.lineLimit(1); classicCount.lineLimit(1); Spacer(minLength: 0) }
                    VStack(alignment: .leading, spacing: 2) { classicTitle; classicCount }
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            Button(editing ? "Done" : "Edit") {
                editing.toggle()
                if !editing { addFocused = false }
            }
            .font(theme.font(theme.isSignal ? .bodyBold : .bodySemi, size: 13, relativeTo: .subheadline))
            .foregroundStyle(theme.isSignal ? theme.onSurface : (editing ? theme.accentText : theme.onSurfaceVariant))
            .padding(.horizontal, 12)
            .frame(minWidth: 44, minHeight: 44)
            .background {
                if !theme.isSignal {
                    Capsule().fill(editing ? theme.accent.opacity(0.16) : theme.surfaceContainer).padding(.vertical, 6)
                }
            }
            .accessibilityLabel(editing ? "Done editing tasks" : "Edit tasks")
        }
    }

    private var classicTitle: some View {
        Text("Minimum viable day")
            .font(theme.font(.displaySemi, size: 16, relativeTo: .headline))
            .foregroundStyle(theme.onSurfaceVariant)
            .accessibilityAddTraits(.isHeader)
    }

    private var classicCount: some View {
        Text(remaining == 0 ? "ALL DONE" : "\(remaining) \(remaining == 1 ? "TASK" : "TASKS") REMAINING")
            .font(theme.font(.bodyMedium, size: 11, relativeTo: .caption))
            .tracking(1.6)
            .foregroundStyle(theme.accentText)
    }

    @ViewBuilder private var addRow: some View {
        if day.day.canAddTask {
            HStack(spacing: 8) {
                TextField("Add a task for today…", text: $newTask)
                    .font(theme.font(.body, size: 14, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                    .focused($addFocused)
                    .submitLabel(.done)
                    .onSubmit(add)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 46)
                    .background(theme.isSignal ? Color.clear : theme.surfaceHigh,
                                in: RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 14, style: .continuous)
                        .strokeBorder(theme.isSignal ? theme.control : theme.outline, lineWidth: theme.isSignal ? 1.5 : 1))
                    .accessibilityLabel("New task title")
                Button(action: add) {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(theme.isSignal ? theme.accentInk : theme.accentText)
                        .frame(width: 46, height: 46)
                        .background(theme.isSignal ? theme.accentFill : theme.accent.opacity(0.16),
                                    in: RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 14,
                                                         style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(newTask.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .opacity(newTask.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
                .accessibilityLabel("Add task")
            }
        } else {
            Text("A minimum day holds up to five things. That’s plenty for today.")
                .font(theme.font(.body, size: 13, relativeTo: .footnote))
                .foregroundStyle(theme.onSurfaceVariant)
                .padding(.vertical, 6)
        }
    }

    private func add() {
        if day.addTask(newTask) {
            newTask = ""
            addFocused = day.day.canAddTask
        }
    }
}

private struct MvdRow: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    let task: DayTask
    let first: Bool
    let editing: Bool

    @State private var draft = ""
    @FocusState private var renaming: Bool

    var body: some View {
        HStack(spacing: 12) {
            if editing {
                checkbox.accessibilityHidden(true)
                TextField("Task", text: $draft)
                    .font(theme.font(theme.isSignal ? .bodyBold : .bodySemi, size: 15, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                    .focused($renaming)
                    .submitLabel(.done)
                    .onSubmit { day.renameTask(task.id, to: draft) }
                    .onChange(of: renaming) { _, on in if !on { day.renameTask(task.id, to: draft) } }
                    .accessibilityLabel("Rename \(task.title)")
                Button {
                    day.removeTask(task.id)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(theme.error)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove task \(task.title)")
            } else {
                Button {
                    day.toggleTask(task.id)
                } label: {
                    HStack(spacing: 12) {
                        checkbox
                        Text(task.title)
                            .font(theme.font(theme.isSignal ? .bodyBold : .bodySemi, size: 15, relativeTo: .body))
                            .foregroundStyle(task.done ? theme.onSurfaceVariant : theme.onSurface)
                            .strikethrough(task.done)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(task.title)
                .accessibilityValue(task.done ? "Done" : "Not done")
                .accessibilityAddTraits(.isButton)
                .accessibilityHint(task.done ? "Marks it as not done" : "Marks it as done")
                .contextMenu {
                    Button { day.toggleTask(task.id) } label: {
                        Label(task.done ? "Not done yet" : "Done", systemImage: task.done ? "arrow.uturn.backward" : "checkmark")
                    }
                    Button(role: .destructive) { day.removeTask(task.id) } label: { Label("Remove", systemImage: "trash") }
                }
            }
        }
        .padding(theme.isSignal ? EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0) : EdgeInsets(top: 12, leading: 14,
                                                                                                      bottom: 12, trailing: 14))
        .frame(minHeight: theme.isSignal ? 54 : 56)
        .background {
            if !theme.isSignal {
                RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.surfaceHigh)
            }
        }
        .overlay(alignment: .top) {
            if theme.isSignal && !first {
                Line().stroke(theme.outlineVariant, style: StrokeStyle(lineWidth: 1, dash: [4, 4])).frame(height: 1)
            }
        }
        .onAppear { draft = task.title }
        .onChange(of: task.title) { _, t in draft = t }
    }

    private var checkbox: some View {
        let size: CGFloat = theme.isSignal ? 26 : 32
        let r = theme.isSignal ? min(6, theme.radiusControl) : 10
        return ZStack {
            RoundedRectangle(cornerRadius: r, style: .continuous)
                .fill(task.done ? (theme.isSignal ? theme.accentFill : theme.accent) : Color.clear)
            RoundedRectangle(cornerRadius: r, style: .continuous)
                .strokeBorder(task.done ? (theme.isSignal ? theme.shadowColor : theme.accent)
                              : (theme.isSignal ? theme.control : theme.accent.opacity(0.5)), lineWidth: 2)
            if task.done {
                Image(systemName: "checkmark")
                    .font(.system(size: theme.isSignal ? 14 : 16, weight: .bold))
                    .foregroundStyle(theme.isSignal ? theme.accentInk : theme.onPrimary)
            }
        }
        .frame(width: size, height: size)
    }
}

private struct Line: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}

// MARK: - Reading

/// Continue reading: what you were last in, with its progress.
struct ReadingTile: View {
    @Environment(\.npTheme) private var theme
    @Environment(AppNavigator.self) private var nav

    let size: String
    var half = false
    let item: PalLogic.ReadingItem

    private var pct: Int { Int((min(1, max(0, item.progress)) * 100).rounded()) }
    private var verb: String { item.progress > 0 ? "Continue reading" : "Start reading" }

    var body: some View {
        if size == "S" {
            OneLineTile(symbol: "book", label: item.progress > 0 ? "Resume" : "Read", value: item.title,
                        spoken: "\(verb) \(item.title)") {
                nav.open(.reader(documentID: item.id))
            }
        } else {
            Button {
                nav.open(.reader(documentID: item.id))
            } label: {
                if theme.isSignal { signal } else { classic }
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(verb) \(item.title), \(pct) percent read")
            .accessibilityAddTraits(.isButton)
            .hoverEffect(.lift)
        }
    }

    private var classic: some View {
        ClassicCard(fill: theme.surfaceContainer, radius: 22, padding: 16) {
            HStack(spacing: 12) {
                Image(systemName: "book")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(theme.accentText)
                    .frame(width: 44, height: 44)
                    .background(theme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    SkinLabel(verb)
                    Text(item.title)
                        .font(theme.font(.displaySemi, size: 16, relativeTo: .headline))
                        .foregroundStyle(theme.onSurface)
                        .lineLimit(2)
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(theme.surfaceHigh)
                    Capsule().fill(theme.accent).frame(width: geo.size.width * min(1, max(0, item.progress)))
                }
            }
            .frame(height: 6)
            .padding(.top, 12)
        }
    }

    private var signal: some View {
        let segs = half ? 8 : 12
        let filled = Int((min(1, max(0, item.progress)) * Double(segs)).rounded())
        let pages = item.pageCount.flatMap { n in n > 0 ? "p. \(max(1, Int((item.progress * Double(n)).rounded()))) / \(n)" : nil }
            ?? "\(pct)%"
        let layout = half ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(spacing: 12))
        return SignalPanel {
            layout {
                Image(systemName: "book.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(theme.accentInk)
                    .frame(width: 44, height: 52)
                    .background(theme.accentFill, in: RoundedRectangle(cornerRadius: min(8, theme.radiusControl), style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: min(8, theme.radiusControl), style: .continuous)
                        .strokeBorder(theme.shadowColor, lineWidth: 1.5))
                VStack(alignment: .leading, spacing: 3) {
                    SkinLabel(verb)
                    Text(item.title)
                        .font(theme.font(.bodyBold, size: 15, relativeTo: .body))
                        .foregroundStyle(theme.onSurface)
                        .lineLimit(2)
                    HStack(spacing: 2) {
                        ForEach(0..<segs, id: \.self) { k in
                            Rectangle()
                                .fill(k < filled ? theme.accentFill : Color.clear)
                                .overlay(Rectangle().strokeBorder(theme.outline, lineWidth: k < filled ? 0 : 1.2))
                                .frame(width: 9, height: 9)
                        }
                        MonoText(pages, size: 11.5).padding(.leading, 4)
                    }
                    .padding(.top, 4)
                }
                if !half {
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.system(size: 16, weight: .semibold)).foregroundStyle(theme.onSurface)
                }
            }
        }
    }
}

// MARK: - Pal's note

/// Pal's note: a line in the user's talk style; opens Pal.
struct PalTile: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Environment(AppNavigator.self) private var nav

    let size: String
    var half = false

    private var pal: Appearance.Pal { theme.appearance.pal }

    private var line: String {
        if day.day.state == .red { return "Nothing needed right now. Breathe with me if you like." }
        if let t = day.day.tasks.first(where: { !$0.done }) { return PalLogic.palLine(pal, task: "“\(t.title)”") }
        return PalLogic.palLine(pal, task: "your next task")
    }

    var body: some View {
        let small = size == "S"
        TileFrame(classicFill: theme.surfaceContainer, classicRadius: 22, padding: small ? 12 : 14) {
            Button {
                nav.open(.pal(nil))
            } label: {
                HStack(spacing: 12) {
                    PalAvatar(pal: pal, palette: theme.palette, mood: PalMood(day.day.state), size: small ? 44 : 72,
                              motion: theme.motionLevel)
                    Text("\(Text("\(pal.name):").font(theme.font(.bodyBold, size: small ? 13.5 : 15, relativeTo: .body))) \(line)")
                        .font(theme.font(.body, size: small ? 13.5 : 15, relativeTo: .body))
                        .foregroundStyle(theme.onSurface)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if !half {
                        Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(theme.outline)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(pal.name): \(line)")
            .accessibilityHint("Opens \(pal.name), your assistant")
            .accessibilityAddTraits(.isButton)
            if !small {
                Button("Build your Pal") { nav.open(.tab(.settings)) }
                    .font(theme.font(.bodySemi, size: 13, relativeTo: .subheadline))
                    .foregroundStyle(theme.accentText)
                    .frame(minHeight: 44)
                    .padding(.leading, half ? 0 : 84)
                    .accessibilityLabel("Build your Pal, \(pal.name), in Settings")
            }
        }
    }
}
