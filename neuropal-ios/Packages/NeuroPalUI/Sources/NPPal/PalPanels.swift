import NPCore
import NPDay
import NPTheme
import SwiftUI

private func announce(_ text: String) {
    AccessibilityNotification.Announcement(text).post()
}

// MARK: - What now?

/// One next step for this moment, with its reason; "Another" moves on.
struct WhatNowPanel: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Environment(AppSession.self) private var session

    let show: (PalTool) -> Void
    let openCalm: () -> Void
    let openReader: (String) -> Void

    @State private var index = 0
    @State private var acked: String?
    @State private var reading: PalLogic.ReadingItem?

    private var pal: Appearance.Pal { theme.appearance.pal }

    var body: some View {
        TimelineView(.everyMinute) { ctx in
            let list = PalLogic.suggestions(state: day.day.state, now: ctx.date, anchors: day.day.anchors,
                                            tasks: day.day.tasks, reading: reading, pal: pal)
            let s = list[index % max(1, list.count)]
            VStack(alignment: .leading, spacing: 0) {
                PanelTitle("What now?")
                if day.day.state != .red { Intro(Tokens.palSay(pal, "now")).padding(.top, 4) }
                if day.day.state == nil {
                    Text("You haven’t checked in. How are you right now?")
                        .font(theme.font(.bodySemi, size: 14, relativeTo: .callout))
                        .foregroundStyle(theme.onSurface)
                        .padding(.top, 12)
                    CheckInRow(value: nil) { day.checkIn($0, level: $0.middleLevel) }.padding(.top, 10)
                }
                PalCard(accent: true) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(s.title)
                            .font(theme.font(.displaySemi, size: 19, relativeTo: .title3))
                            .foregroundStyle(theme.onSurface)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(s.why)
                            .font(theme.font(.body, size: 14, relativeTo: .callout))
                            .foregroundStyle(theme.onSurfaceVariant)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                    if acked == s.id {
                        Text(Tokens.palSay(pal, "ack"))
                            .font(theme.font(.bodySemi, size: 14.5, relativeTo: .callout))
                            .foregroundStyle(theme.accentText)
                            .padding(.top, 12)
                    }
                    WrapLayout(spacing: 10, lineSpacing: 10) {
                        if acked != s.id {
                            Button {
                                act(s)
                            } label: {
                                Label(primaryLabel(s), systemImage: primarySymbol(s))
                            }
                            .buttonStyle(.npPrimary)
                            .accessibilityLabel(primarySpoken(s))
                        }
                        Button("Another") {
                            acked = nil
                            index += 1
                            let next = list[index % max(1, list.count)]
                            announce("\(next.title). \(next.why)")
                        }
                        .buttonStyle(.npSecondary)
                        .accessibilityLabel("Another suggestion")
                    }
                    .padding(.top, 14)
                }
                .padding(.top, 14)
                if day.day.state == .red {
                    Intro("Nothing else is needed from you right now.", size: 13).padding(.top, 14)
                }
            }
        }
        .task(id: session.phase) {
            reading = await ReadingLookup.current(api: session.isSignedIn ? session.api : nil, useSnapshot: day.isPersistent)
        }
        .onChange(of: day.day.state) { _, _ in
            index = 0
            acked = nil
        }
    }

    private func primaryLabel(_ s: PalLogic.Suggestion) -> String {
        switch s.action {
        case .calm: return "Open the calming steps"
        case .ack: return "Okay"
        default: return "Start"
        }
    }

    private func primarySymbol(_ s: PalLogic.Suggestion) -> String {
        switch s.action {
        case .calm: return "leaf"
        case .ack: return "checkmark"
        default: return "arrow.right"
        }
    }

    private func primarySpoken(_ s: PalLogic.Suggestion) -> String {
        switch s.action {
        case .calm: return "Open the calming steps"
        case .ack: return "Okay"
        case .open(let t): return "Start: open \(t.title)"
        case .sit(let m, _, _, _): return "Start \(m) minutes with \(pal.name)"
        case .read(_, let m, _): return "Start: open the reader and \(m) minutes with \(pal.name)"
        }
    }

    private func act(_ s: PalLogic.Suggestion) {
        switch s.action {
        case .calm:
            openCalm()
        case .open(let t):
            show(t)
        case .ack:
            acked = s.id
            announce("\(pal.name): \(Tokens.palSay(pal, "ack"))")
        case .sit(let minutes, let label, let taskID, let anchorID):
            day.startSit(minutes: minutes, label: label, taskID: taskID, anchorID: anchorID)
            announce(Tokens.palSay(pal, "sitStart"))
            show(.sit)
        case .read(let id, let minutes, let label):
            day.startSit(minutes: minutes, label: label)
            openReader(id)
        }
    }
}

// MARK: - Break it down

/// Kept by the assistant view, so switching tools doesn't lose the steps.
@MainActor
@Observable
final class BreakdownModel {
    struct Outcome {
        var steps: [String]
        /// Why these are Pal's offline steps (nil = the server's).
        var note: String?
    }

    var task = ""
    var loading = false
    var slow = false
    var outcome: Outcome?
    var checked: Set<Int> = []
    var added: Set<Int> = []
    @ObservationIgnored private var request = 0

    static let slowLine = "Still thinking. Quick steps are ready if you’d rather not wait."

    func run(api: any NeuroPalAPI) async {
        let t = String(task.trimmingCharacters(in: .whitespacesAndNewlines).prefix(PalLogic.taskMaxChars))
        guard !t.isEmpty, !loading else { return }
        request += 1
        let token = request
        loading = true
        slow = false
        outcome = nil
        checked = []
        added = []
        announce("Making the steps…")
        let timer = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(6))
            guard let self, !Task.isCancelled, self.request == token, self.loading else { return }
            self.slow = true
            announce(Self.slowLine)
        }
        var result: Outcome
        do {
            let b = try await api.palBreakdown(task: t)
            if let steps = PalLogic.cleanSteps(b.steps) {
                result = Outcome(steps: steps, note: nil)
            } else {
                result = Outcome(steps: PalLogic.offlineSteps(for: t),
                                 note: "The server’s steps didn’t come out right, so these are Pal’s offline steps.")
            }
        } catch {
            result = Outcome(steps: PalLogic.offlineSteps(for: t), note: Self.why(error))
        }
        timer.cancel()
        guard request == token else { return } // "Use quick steps now" won meanwhile
        outcome = result
        loading = false
        slow = false
        announce("\(result.steps.count) small steps")
    }

    /// Don't wait for the server.
    func quick() {
        request += 1
        let steps = PalLogic.offlineSteps(for: task)
        outcome = Outcome(steps: steps, note: "Quick steps, made on this device.")
        loading = false
        slow = false
        checked = []
        added = []
        announce("\(steps.count) small steps")
    }

    /// The offline note, said plainly (SOURCE_NOTE in PalSheet.jsx).
    static func why(_ error: Error) -> String {
        switch error as? APIError {
        case .offline?: return "No server right now, so these are Pal’s offline steps."
        case .rateLimited?: return "Pal has done a lot of thinking for now, so these are offline steps."
        case .unauthorized?: return "You’re signed out, so these are Pal’s offline steps."
        default:
            if (error as? URLError) != nil { return "No server right now, so these are Pal’s offline steps." }
            return "The server didn’t answer well, so these are Pal’s offline steps."
        }
    }
}

/// Big task in, tiny steps out — from the server, or Pal's offline steps
/// (and it says which). The steps become a checklist.
struct BreakdownPanel: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Environment(AppSession.self) private var session
    @Bindable var model: BreakdownModel
    let onSit: () -> Void
    @FocusState private var fieldFocused: Bool
    @State private var autoRan = false

    private var pal: Appearance.Pal { theme.appearance.pal }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelTitle("Break it down")
            Intro(Tokens.palSay(pal, "breakdown")).padding(.top, 4)
            TextField("e.g. write the intro of my thesis", text: $model.task)
                .focused($fieldFocused)
                .submitLabel(.go)
                .onSubmit(run)
                .onChange(of: model.task) { _, t in
                    if t.count > PalLogic.taskMaxChars { model.task = String(t.prefix(PalLogic.taskMaxChars)) }
                }
                .palField()
                .accessibilityLabel("The task to break down")
                .padding(.top, 12)
            WrapLayout(spacing: 10, lineSpacing: 10) {
                Button(action: run) {
                    Label("Break it down", systemImage: "arrow.triangle.branch")
                }
                .buttonStyle(.npPrimary)
                .disabled(model.task.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.loading)
                if model.loading && model.slow {
                    Button("Use quick steps now") { model.quick() }.buttonStyle(.npSecondary)
                }
            }
            .padding(.top, 10)
            if model.loading {
                HStack(spacing: 8) {
                    ProgressView().tint(theme.accentText)
                    Text(model.slow ? BreakdownModel.slowLine : "Making the steps…")
                        .font(theme.font(.body, size: 14, relativeTo: .callout))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
                .padding(.top, 12)
                .accessibilityElement(children: .combine)
            }
            if let out = model.outcome { steps(out).padding(.top, 14) }
        }
        .onAppear {
            // Mock screenshots: a task given at launch runs once.
            if !autoRan, !model.task.isEmpty, model.outcome == nil, !day.isPersistent {
                autoRan = true
                run()
            }
        }
    }

    private func run() {
        fieldFocused = false
        let api = session.api
        Task { await model.run(api: api) }
    }

    private func steps(_ out: BreakdownModel.Outcome) -> some View {
        PalCard {
            Text("\(out.steps.count) small \(out.steps.count == 1 ? "step" : "steps")")
                .font(theme.font(.bodyBold, size: 15, relativeTo: .headline))
                .foregroundStyle(theme.onSurface)
                .accessibilityAddTraits(.isHeader)
            Text("Tick steps off as you go. The plus puts a step on today’s minimum day.")
                .font(theme.font(.body, size: 12.5, relativeTo: .footnote))
                .foregroundStyle(theme.onSurfaceVariant)
                .padding(.top, 2)
            VStack(spacing: 0) {
                ForEach(Array(out.steps.enumerated()), id: \.offset) { i, step in
                    let done = model.checked.contains(i)
                    let added = model.added.contains(i)
                    HStack(spacing: 10) {
                        Button {
                            if done { model.checked.remove(i) } else { model.checked.insert(i) }
                        } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Image(systemName: done ? "checkmark.square.fill" : "square")
                                    .font(.system(size: 20))
                                    .foregroundStyle(done ? theme.accentText : theme.onSurfaceVariant)
                                Text("\(i + 1)")
                                    .font(theme.font(.mono, size: 13, relativeTo: .footnote))
                                    .foregroundStyle(theme.accentText)
                                Text(step)
                                    .font(theme.font(.body, size: 15, relativeTo: .body))
                                    .foregroundStyle(done ? theme.onSurfaceVariant : theme.onSurface)
                                    .strikethrough(done)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Step \(i + 1): \(step)")
                        .accessibilityValue(done ? "Done" : "Not done")
                        .accessibilityAddTraits(.isButton)
                        Button {
                            if day.addTask(step) { model.added.insert(i) }
                        } label: {
                            Image(systemName: added ? "checkmark" : "plus")
                        }
                        .buttonStyle(IconActionStyle(done: added))
                        .disabled(added || !day.day.canAddTask)
                        .accessibilityLabel(added ? "Added “\(step)” to your minimum day"
                                            : day.day.canAddTask ? "Add “\(step)” to your minimum day"
                                            : "Your minimum day is full")
                    }
                    .padding(.vertical, 6)
                    .frame(minHeight: 52)
                    .overlay(alignment: .top) {
                        if i > 0 { Rectangle().fill(theme.outlineVariant.opacity(0.45)).frame(height: 1) }
                    }
                }
            }
            .padding(.top, 6)
            if let note = out.note {
                Text(note)
                    .font(theme.font(.body, size: 12.5, relativeTo: .footnote))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .padding(.top, 8)
            }
            if !day.day.canAddTask {
                Text("Your minimum day has five things already. That’s plenty.")
                    .font(theme.font(.body, size: 12.5, relativeTo: .footnote))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .padding(.top, 6)
            }
            if let first = out.steps.first {
                Button {
                    day.startSit(minutes: 10, label: first)
                    announce(Tokens.palSay(pal, "sitStart"))
                    onSit()
                } label: {
                    Label("Do step 1 with me", systemImage: "figure.mind.and.body")
                }
                .buttonStyle(.npSecondary)
                .accessibilityLabel("Do step 1, \(first), with \(pal.name) for 10 minutes")
                .padding(.top, 12)
            }
        }
    }
}

// MARK: - Brain dump

/// Get thoughts out of your head; sort them later, or never.
struct DumpPanel: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @State private var draft = ""
    @State private var status: String?
    @State private var undo: DumpItem?
    @FocusState private var focused: Bool

    private var pal: Appearance.Pal { theme.appearance.pal }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelTitle("Brain dump")
            Intro(Tokens.palSay(pal, "dump")).padding(.top, 4)
            HStack(alignment: .bottom, spacing: 8) {
                TextField("A thought, a worry, a to-do…", text: $draft)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit(add)
                    .palField()
                    .accessibilityLabel("New brain dump item")
                Button(action: add) {
                    Image(systemName: "plus").font(.system(size: 18, weight: .semibold))
                }
                .buttonStyle(IconActionStyle())
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Save to the brain dump")
            }
            .padding(.top, 12)
            if let status {
                HStack(spacing: 10) {
                    Text(status)
                        .font(theme.font(.body, size: 13, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurfaceVariant)
                    if let undo {
                        Button("Undo") {
                            day.restoreDump(undo)
                            self.undo = nil
                            tell("Back in the dump.")
                        }
                        .buttonStyle(TextActionStyle())
                        .accessibilityLabel("Undo: bring back “\(undo.text)”")
                    }
                }
                .padding(.top, 4)
            }
            if day.day.dump.isEmpty {
                Intro(Tokens.palSay(pal, "dumpEmpty")).padding(.top, 14)
            }
            LazyVStack(spacing: 10) {
                ForEach(day.day.dump) { item in
                    PalCard {
                        Text(item.text)
                            .font(theme.font(.body, size: 15, relativeTo: .body))
                            .foregroundStyle(theme.onSurface)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                        WrapLayout(spacing: 8, lineSpacing: 8) {
                            Button {
                                if day.addTask(item.text) {
                                    day.removeDump(item.id)
                                    undo = nil
                                    tell("Added to your minimum day.")
                                } else {
                                    tell("Your minimum day has five things already.")
                                }
                            } label: {
                                Label("Minimum day", systemImage: "text.badge.plus")
                            }
                            .buttonStyle(IconActionStyle())
                            .disabled(!day.day.canAddTask)
                            .accessibilityLabel(day.day.canAddTask ? "Add “\(item.text)” to your minimum day"
                                                : "Your minimum day is full")
                            Button {
                                if let gone = day.removeDump(item.id) {
                                    undo = gone
                                    tell("Deleted.")
                                }
                            } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(IconActionStyle())
                            .accessibilityLabel("Delete “\(item.text)”")
                        }
                        .padding(.top, 10)
                    }
                }
            }
            .padding(.top, 10)
        }
    }

    private func add() {
        guard day.addDump(draft) != nil else { return }
        draft = ""
        undo = nil
        tell("Saved.")
        focused = true
    }

    private func tell(_ text: String) {
        status = text
        announce(text)
    }
}

// MARK: - Sit with me

/// Body doubling: pick 10 / 25 / 45 minutes; Pal stays with a calm timer
/// (minutes, not ticking seconds), checks in now and then, and at the end
/// offers to note what you did.
struct SitPanel: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day

    var body: some View {
        if let sit = day.day.sit {
            if sit.isRunning { SitRunning(sit: sit) } else { SitEnded(sit: sit) }
        } else {
            SitPicker()
        }
    }
}

private struct SitPicker: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @State private var label = ""

    private var pal: Appearance.Pal { theme.appearance.pal }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelTitle("Sit with me")
            Intro(Tokens.palSay(pal, "sit")).padding(.top, 4)
            TextField("What are you working on? (optional)", text: $label)
                .submitLabel(.done)
                .onChange(of: label) { _, t in if t.count > 120 { label = String(t.prefix(120)) } }
                .palField()
                .accessibilityLabel("What you’re working on, optional")
                .padding(.top, 12)
            HStack(spacing: 10) {
                ForEach(PalLogic.sitLengths, id: \.self) { m in
                    Button {
                        day.startSit(minutes: m, label: label)
                        announce(Tokens.palSay(pal, "sitStart"))
                    } label: {
                        VStack(spacing: 0) {
                            Text("\(m)")
                                .font(theme.font(.display, size: 28, relativeTo: .title))
                                .foregroundStyle(theme.onSurface)
                            Text("MIN")
                                .font(theme.font(.label, size: 11.5, relativeTo: .caption2))
                                .tracking(1.2)
                                .foregroundStyle(theme.onSurfaceVariant)
                        }
                        .frame(maxWidth: .infinity, minHeight: 76)
                        .background(theme.isSignal ? theme.surfaceHigh : theme.accent.opacity(0.08),
                                    in: RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusMedium : 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusMedium : 18, style: .continuous)
                            .strokeBorder(theme.isSignal ? theme.control : theme.accent.opacity(0.35), lineWidth: theme.isSignal ? 1.5 : 1))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Sit with \(pal.name) for \(m) minutes")
                    .hoverEffect(.lift)
                }
            }
            .padding(.top, 12)
            Intro("Quiet company can make starting easier. You can stop any time.", size: 13).padding(.top, 12)
            if let last = day.day.sitNotes.first {
                Intro("Last time: \(last.minutes) min\(last.note.isEmpty ? "" : " · \(last.note)")", size: 13).padding(.top, 8)
            }
        }
    }
}

private struct SitRunning: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    let sit: SitSession
    @State private var notReally = false

    private var pal: Appearance.Pal { theme.appearance.pal }
    private static let notReallyLine = "That’s okay. Stop here, or keep going?"

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let left = sit.leftLabel(at: ctx.date)
            VStack(spacing: 0) {
                PalAvatar(pal: pal, palette: theme.palette, mood: PalMood(day.day.state), size: 128, motion: theme.motionLevel)
                Text(left)
                    .font(theme.font(.display, size: theme.isSignal ? 38 : 34, relativeTo: .largeTitle))
                    .tracking(theme.isSignal ? -0.4 : -0.6)
                    .foregroundStyle(theme.onSurface)
                    .padding(.top, 6)
                    .accessibilityLabel("\(pal.name) is sitting with you. \(left).")
                Text(sit.label.isEmpty ? "Just company. No task needed." : "Working on: \(sit.label)")
                    .font(theme.font(.body, size: 14, relativeTo: .callout))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .multilineTextAlignment(.center)
                    .padding(.top, 2)
                PalProgressBar(value: sit.fractionDone(at: ctx.date), label: "This sit").padding(.top, 14)
                if sit.checkIn == .asked {
                    PalCard(accent: true) {
                        Text(notReally ? Self.notReallyLine : Tokens.palSay(pal, "sitCheck"))
                            .font(theme.font(.bodySemi, size: 15.5, relativeTo: .body))
                            .foregroundStyle(theme.onSurface)
                            .fixedSize(horizontal: false, vertical: true)
                        WrapLayout(spacing: 10, lineSpacing: 10) {
                            if notReally {
                                Button("Stop here") { day.endSit() }.buttonStyle(.npPrimary)
                                Button("Keep going") { day.answerSitCheckIn(.no); notReally = false }.buttonStyle(.npSecondary)
                            } else {
                                Button("Still going") { day.answerSitCheckIn(.yes) }.buttonStyle(.npPrimary)
                                Button("Not really") {
                                    notReally = true
                                    announce("\(pal.name): \(Self.notReallyLine)")
                                }
                                .buttonStyle(.npSecondary)
                            }
                        }
                        .padding(.top, 12)
                    }
                    .padding(.top, 14)
                } else {
                    Intro(Tokens.palSay(pal, "sitStart")).multilineTextAlignment(.center).padding(.top, 12)
                }
                WrapLayout(spacing: 10, lineSpacing: 10, alignment: .center) {
                    Button {
                        day.endSit()
                    } label: {
                        Label("I’m done", systemImage: "checkmark")
                    }
                    .buttonStyle(.npPrimary)
                    .accessibilityLabel("I’m done: end the sit")
                    Button("Stop") { day.endSit() }
                        .buttonStyle(.npSecondary)
                        .accessibilityLabel("Stop the sit early")
                }
                .padding(.top, 16)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

private struct SitEnded: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    let sit: SitSession
    @State private var note = ""
    @State private var ticked = false

    private var pal: Appearance.Pal { theme.appearance.pal }

    private var summary: String {
        if sit.endReason == .time {
            return "That was \(sit.minutes) \(sit.minutes == 1 ? "minute" : "minutes")\(sit.label.isEmpty ? "" : " on \(sit.label)")."
        }
        let spent = sit.minutesSpent
        return "You stopped after \(spent) \(spent == 1 ? "minute" : "minutes"). That counts."
    }

    var body: some View {
        let task = sit.taskID.flatMap { id in day.day.tasks.first { $0.id == id } }
        VStack(alignment: .leading, spacing: 0) {
            PalAvatar(pal: pal, palette: theme.palette, mood: .okay, size: 96, motion: theme.motionLevel)
                .frame(maxWidth: .infinity)
            PanelTitle(Tokens.palSay(pal, "sitEnd")).padding(.top, 6)
            Intro(summary).padding(.top, 4)
            if let task, !task.done, !ticked {
                Button {
                    day.setTask(task.id, done: true)
                    ticked = true
                    announce("Ticked off today’s list.")
                } label: {
                    Label("Tick off “\(task.title)”", systemImage: "checkmark")
                }
                .buttonStyle(IconActionStyle())
                .padding(.top, 12)
            }
            if ticked {
                Text("Ticked off today’s list.")
                    .font(theme.font(.bodySemi, size: 14, relativeTo: .callout))
                    .foregroundStyle(theme.accentText)
                    .padding(.top, 10)
            }
            TextField("What did you do? (optional)", text: $note, axis: .vertical)
                .lineLimit(3...6)
                .onChange(of: note) { _, t in if t.count > 500 { note = String(t.prefix(500)) } }
                .palField()
                .accessibilityLabel("Note what you did, optional")
                .padding(.top, 14)
            WrapLayout(spacing: 10, lineSpacing: 10) {
                Button {
                    day.saveSitNote(note)
                    announce("Saved.")
                } label: {
                    Label("Save note", systemImage: "square.and.pencil")
                }
                .buttonStyle(.npPrimary)
                .disabled(note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("Not now") { day.clearSit() }.buttonStyle(.npSecondary)
            }
            .padding(.top, 12)
        }
    }
}
