import NPCore
import NPDay
import NPTheme
import SwiftUI

/// "Next anchor": the next timed thing of the day with its flexible window,
/// done / skip, edit, and the way into all anchors (HomeScreen.jsx
/// NextAnchor / SignalTiles.jsx SignalAnchorTile).
struct AnchorTile: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day

    let size: String
    var half = false
    let now: Date
    var onEdit: (DayAnchor) -> Void
    var onAdd: () -> Void
    var onList: () -> Void

    private var anchor: DayAnchor? { day.nextAnchor(after: now) }

    var body: some View {
        if let anchor {
            if size == "S" {
                OneLineTile(symbol: anchor.kind.symbol, label: "Next",
                            value: "\(anchor.title) · \(anchorTime(anchor, signal: theme.isSignal, now: now))",
                            spoken: "Next anchor: \(anchor.title) at \(anchorTime(anchor, signal: false, now: now))") {
                    onEdit(anchor)
                }
            } else if theme.isSignal {
                signal(anchor)
            } else {
                classic(anchor)
            }
        } else {
            empty
        }
    }

    // MARK: Classic

    private func classic(_ a: DayAnchor) -> some View {
        let mins = DayData.minutesUntil(a, now: now)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("NEXT ANCHOR")
                        .font(theme.font(.bodyMedium, size: 11, relativeTo: .caption))
                        .tracking(3)
                        .foregroundStyle(theme.accentText)
                    Text("\(a.title) at \(anchorTime(a, signal: false, now: now))")
                        .font(theme.font(.display, size: 20, relativeTo: .title3))
                        .foregroundStyle(theme.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                    if let sub = a.subtitle {
                        Text(sub)
                            .font(theme.font(.body, size: 13, relativeTo: .subheadline))
                            .foregroundStyle(theme.onSurfaceVariant)
                    }
                    Label {
                        Text("\(untilLabel(mins)) · window \(windowLabel(a.flexMinutes))")
                    } icon: {
                        Image(systemName: "clock").accessibilityHidden(true)
                    }
                    .font(theme.font(.body, size: 13, relativeTo: .subheadline))
                    .foregroundStyle(theme.onSurfaceVariant)
                }
                .accessibilityElement(children: .combine)
                Spacer(minLength: 0)
                Image(systemName: a.kind.symbol)
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(theme.accentText)
                    .frame(width: 60, height: 60)
                    .background(theme.accent.opacity(0.18), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .accessibilityHidden(true)
            }
            actions(a).padding(.top, 14)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            ZStack(alignment: .bottomTrailing) {
                RoundedRectangle(cornerRadius: 26, style: .continuous).fill(theme.primaryContainer.opacity(0.28))
                Circle().fill(theme.secondary.opacity(0.1)).frame(width: 150, height: 150).offset(x: 30, y: 30)
                    .accessibilityHidden(true)
            }
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous)))
    }

    // MARK: Signal

    private func signal(_ a: DayAnchor) -> some View {
        let mins = DayData.minutesUntil(a, now: now)
        let big = mins <= 0 ? "NOW" : mins < 100 ? "\(mins)" : "\(Int((Double(mins) / 60).rounded()))"
        let unit = mins <= 0 ? "" : mins < 100 ? "MIN" : "H"
        let spoken = mins <= 0 ? "happening now" : mins < 100 ? "in \(mins) minutes"
            : "in about \(Int((Double(mins) / 60).rounded())) hours"
        return SignalPanel {
            SkinLabel("Next anchor")
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(big)
                        .font(theme.font(.display, size: size == "L" ? 52 : 44, relativeTo: .largeTitle))
                        .foregroundStyle(theme.onSurface)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    if !unit.isEmpty { MonoText(unit, size: 12) }
                }
                Text(a.title)
                    .font(theme.font(.bodyBold, size: 15, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                    .lineLimit(2)
                MonoText("\(a.clock) · window \(a.flexMinutes == 0 ? "on time" : "±\(a.flexMinutes)")")
            }
            .padding(.top, 4)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(a.title), \(spoken), at \(anchorTime(a, signal: false, now: now)). "
                                + "Window \(windowLabel(a.flexMinutes)).")
            TickRuler(minutes: mins, flex: a.flexMinutes).padding(.top, 10)
            actions(a).padding(.top, 10)
        }
    }

    // MARK: Shared

    @ViewBuilder private func actions(_ a: DayAnchor) -> some View {
        WrapLayout(spacing: 8, lineSpacing: 8) {
            Button {
                day.setAnchor(a.id, status: .done)
            } label: {
                Label("Done", systemImage: "checkmark")
            }
            .buttonStyle(HomeSmallButtonStyle(tint: theme.secondary))
            .accessibilityLabel("Mark \(a.title) done")
            if half {
                // Half a row is narrow: the rest goes in a menu.
                Menu {
                    Button { day.setAnchor(a.id, status: .skipped) } label: { Label("Skip today", systemImage: "forward") }
                    Button { onEdit(a) } label: { Label("Edit", systemImage: "pencil") }
                    Button(action: onList) { Label("All anchors", systemImage: "list.bullet") }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .buttonStyle(HomeSmallButtonStyle())
                .accessibilityLabel("More for \(a.title)")
            } else {
                Button {
                    day.setAnchor(a.id, status: .skipped)
                } label: {
                    Label("Skip", systemImage: "forward")
                }
                .buttonStyle(HomeSmallButtonStyle(tint: theme.onSurfaceVariant))
                .accessibilityLabel("Skip \(a.title) today")
                Button {
                    onEdit(a)
                } label: {
                    Image(systemName: "pencil")
                }
                .buttonStyle(HomeSmallButtonStyle())
                .accessibilityLabel("Edit \(a.title)")
                Button(action: onList) {
                    Image(systemName: "list.bullet")
                }
                .buttonStyle(HomeSmallButtonStyle())
                .accessibilityLabel("All anchors")
            }
        }
        .labelStyle(.titleAndIcon)
    }

    private var empty: some View {
        let hasAny = !day.day.anchors.isEmpty
        let title = hasAny ? "No more anchors today" : "Set your next anchor"
        let sub = hasAny ? "That’s everything timed for today." : "Meds, a break, a study block…"
        return Button {
            hasAny ? onList() : onAdd()
        } label: {
            Group {
                if theme.isSignal {
                    SignalPanel {
                        SkinLabel("Next anchor")
                        Text(title).font(theme.font(.bodyBold, size: 15, relativeTo: .body)).foregroundStyle(theme.onSurface)
                            .padding(.top, 8)
                        Text(sub).font(theme.font(.body, size: 13, relativeTo: .subheadline))
                            .foregroundStyle(theme.onSurfaceVariant).padding(.top, 3)
                        Label(hasAny ? "All anchors" : "Add anchor", systemImage: hasAny ? "list.bullet" : "alarm")
                            .font(theme.font(.bodyBold, size: 13, relativeTo: .subheadline))
                            .foregroundStyle(theme.accentText)
                            .padding(.top, 10)
                    }
                } else {
                    HStack(spacing: 12) {
                        Image(systemName: hasAny ? "list.bullet" : "alarm")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(theme.accentText)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(title).font(theme.font(.bodySemi, size: 15, relativeTo: .body)).foregroundStyle(theme.onSurface)
                            Text(sub).font(theme.font(.bodyMedium, size: 13, relativeTo: .subheadline))
                                .foregroundStyle(theme.onSurfaceVariant)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(18)
                    .background(RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(theme.outlineVariant, style: StrokeStyle(lineWidth: 1.4, dash: [5, 4])))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(hasAny ? "\(title). All anchors" : "Set your next anchor")
        .accessibilityAddTraits(.isButton)
    }
}

/// ±2 h around the anchor: window ticks in the accent, the white "now"
/// marker at the exact minute (Signal). Decorative.
private struct TickRuler: View {
    @Environment(\.npTheme) private var theme
    let minutes: Int
    let flex: Int

    var body: some View {
        let n = 25
        let span = 120.0
        let frac = (span - Double(minutes)) / (2 * span)
        GeometryReader { geo in
            ZStack(alignment: .bottomLeading) {
                HStack(alignment: .bottom, spacing: 0) {
                    ForEach(0..<n, id: \.self) { i in
                        let offset = (Double(i) - Double(n - 1) / 2) * (2 * span / Double(n - 1))
                        let inWindow = abs(offset) <= Double(flex)
                        Rectangle()
                            .fill(inWindow ? theme.accentFill : theme.outline)
                            .frame(width: inWindow ? 3 : 1.5, height: inWindow ? 11 : 7)
                        if i < n - 1 { Spacer(minLength: 0) }
                    }
                }
                if frac >= 0 && frac <= 1 {
                    Rectangle()
                        .fill(theme.onSurface)
                        .frame(width: 2.5, height: 18)
                        .offset(x: frac * (geo.size.width - 2.5))
                }
            }
        }
        .frame(height: 18)
        .accessibilityHidden(true)
    }
}

// MARK: - The anchors editor

/// All of today's anchors: tap to edit, swipe for done / skip / delete, add
/// new ones (src/components/planner/AnchorEditor.jsx, as a native list).
public struct AnchorsEditorView: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Environment(\.dismiss) private var dismiss
    @State private var editing: DayAnchor?
    @State private var adding = false

    public init() {}

    public var body: some View {
        NavigationStack {
            List {
                if day.day.anchors.isEmpty {
                    Section {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("No anchors yet")
                                .font(theme.font(.bodySemi, size: 16, relativeTo: .headline))
                                .foregroundStyle(theme.onSurface)
                            Text("Anchors are the timed points of your day: meds, a break, a study block.")
                                .font(theme.font(.body, size: 14, relativeTo: .body))
                                .foregroundStyle(theme.onSurfaceVariant)
                        }
                        .padding(.vertical, 6)
                        Button("Add an anchor") { adding = true }
                            .font(theme.font(.bodySemi, size: 15, relativeTo: .body))
                    }
                    .listRowBackground(theme.surfaceContainer)
                } else {
                    Section {
                        ForEach(day.day.anchors) { a in
                            Button {
                                editing = a
                            } label: {
                                AnchorRow(anchor: a)
                            }
                            .buttonStyle(.plain)
                            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                if a.status == .upcoming {
                                    Button { day.setAnchor(a.id, status: .done) } label: {
                                        Label("Done", systemImage: "checkmark")
                                    }
                                    .tint(theme.secondary)
                                } else {
                                    Button { day.setAnchor(a.id, status: .upcoming) } label: {
                                        Label("Not yet", systemImage: "arrow.uturn.backward")
                                    }
                                    .tint(theme.outline)
                                }
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) { day.removeAnchor(a.id) } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                if a.status == .upcoming {
                                    Button { day.setAnchor(a.id, status: .skipped) } label: {
                                        Label("Skip today", systemImage: "forward")
                                    }
                                    .tint(theme.tertiary)
                                }
                            }
                            .contextMenu {
                                Button { editing = a } label: { Label("Edit", systemImage: "pencil") }
                                if a.status == .upcoming {
                                    Button { day.setAnchor(a.id, status: .done) } label: { Label("Done", systemImage: "checkmark") }
                                    Button { day.setAnchor(a.id, status: .skipped) } label: {
                                        Label("Skip today", systemImage: "forward")
                                    }
                                } else {
                                    Button { day.setAnchor(a.id, status: .upcoming) } label: {
                                        Label("Not yet", systemImage: "arrow.uturn.backward")
                                    }
                                }
                                Button(role: .destructive) { day.removeAnchor(a.id) } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .accessibilityActions {
                                if a.status == .upcoming {
                                    Button("Done") { day.setAnchor(a.id, status: .done) }
                                    Button("Skip today") { day.setAnchor(a.id, status: .skipped) }
                                } else {
                                    Button("Not yet") { day.setAnchor(a.id, status: .upcoming) }
                                }
                                Button("Delete") { day.removeAnchor(a.id) }
                            }
                        }
                    } footer: {
                        Text("Done and skipped anchors go back to upcoming every morning. Swipe a row for more.")
                            .font(theme.font(.body, size: 13, relativeTo: .footnote))
                            .foregroundStyle(theme.onSurfaceVariant)
                    }
                    .listRowBackground(theme.surfaceContainer)
                }
            }
            .scrollContentBackground(.hidden)
            .background(NPBackground())
            .navigationTitle("Anchors")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { SheetTitle("Anchors") }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        adding = true
                    } label: {
                        Label("Add anchor", systemImage: "plus")
                    }
                    .keyboardShortcut("n", modifiers: .command)
                }
            }
            .sheet(item: $editing) { a in
                AnchorFormView(anchor: a).npTheme(theme)
            }
            .sheet(isPresented: $adding) {
                AnchorFormView(anchor: nil).npTheme(theme)
            }
        }
    }
}

private struct AnchorRow: View {
    @Environment(\.npTheme) private var theme
    let anchor: DayAnchor

    var body: some View {
        let muted = anchor.status != .upcoming
        HStack(spacing: 12) {
            Image(systemName: anchor.kind.symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(muted ? theme.onSurfaceVariant : theme.accentText)
                .frame(width: 36, height: 36)
                .background(theme.accent.opacity(muted ? 0.06 : 0.14), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(anchor.title)
                    .font(theme.font(.bodySemi, size: 16, relativeTo: .body))
                    .foregroundStyle(muted ? theme.onSurfaceVariant : theme.onSurface)
                    .strikethrough(anchor.status == .done)
                MonoText("\(anchorTime(anchor, signal: theme.isSignal)) · \(windowLabel(anchor.flexMinutes)) · \(anchor.kind.label)")
            }
            Spacer(minLength: 8)
            switch anchor.status {
            case .done: StatusBadge(text: "Done", symbol: "checkmark", tint: theme.secondary)
            case .skipped: StatusBadge(text: "Skipped", symbol: "forward", tint: theme.onSurfaceVariant)
            case .upcoming: EmptyView()
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(anchor.title), \(anchorTime(anchor, signal: false)), window \(windowLabel(anchor.flexMinutes)), "
                            + "\(anchor.kind.label)" + (anchor.status == .upcoming ? "" : ", \(anchor.status == .done ? "done" : "skipped")"))
        .accessibilityHint("Opens the anchor to edit it")
        .accessibilityAddTraits(.isButton)
    }
}

private struct StatusBadge: View {
    @Environment(\.npTheme) private var theme
    let text: String
    let symbol: String
    let tint: Color

    var body: some View {
        Label(text, systemImage: symbol)
            .font(theme.font(.bodySemi, size: 12, relativeTo: .caption))
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.14), in: Capsule())
    }
}

/// Add or edit one anchor: what, details, time, window, kind; delete.
public struct AnchorFormView: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Environment(\.dismiss) private var dismiss

    private let original: DayAnchor?
    @State private var title: String
    @State private var subtitle: String
    @State private var time: Date
    @State private var flex: Int
    @State private var category: String
    @State private var confirmDelete = false
    @FocusState private var titleFocused: Bool

    public init(anchor: DayAnchor?) {
        original = anchor
        _title = State(initialValue: anchor?.title ?? "")
        _subtitle = State(initialValue: anchor?.subtitle ?? "")
        let base = Calendar.current.date(bySettingHour: anchor?.hour ?? Calendar.current.component(.hour, from: Date()),
                                         minute: anchor?.minute ?? 0, second: 0, of: Date()) ?? Date()
        _time = State(initialValue: base)
        _flex = State(initialValue: anchor?.flexMinutes ?? DayAnchor.defaultFlex)
        _category = State(initialValue: anchor?.category ?? "custom")
    }

    private var canSave: Bool { !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    public var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What? (e.g. Evening meds)", text: $title)
                        .focused($titleFocused)
                        .submitLabel(.done)
                        .accessibilityLabel("Anchor title")
                    TextField("Details (optional)", text: $subtitle)
                        .accessibilityLabel("Anchor details")
                }
                .listRowBackground(theme.surfaceContainer)
                Section {
                    DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)
                    Picker("Window", selection: $flex) {
                        ForEach(DayAnchor.flexChoices, id: \.self) { m in
                            Text(m == 0 ? "On time" : windowLabel(m)).tag(m)
                        }
                    }
                } footer: {
                    Text("The window is how early or late still counts. Wide windows are fine.")
                        .font(theme.font(.body, size: 13, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
                .listRowBackground(theme.surfaceContainer)
                Section {
                    Picker("Kind", selection: $category) {
                        ForEach(AnchorCategory.all) { k in
                            Label(k.label, systemImage: k.symbol).tag(k.id)
                        }
                        if !AnchorCategory.all.contains(where: { $0.id == category }) {
                            let k = AnchorCategory.of(category)
                            Label(k.label, systemImage: k.symbol).tag(category)
                        }
                    }
                }
                .listRowBackground(theme.surfaceContainer)
                if let original {
                    Section {
                        Button("Delete anchor", role: .destructive) { confirmDelete = true }
                            .foregroundStyle(theme.error) // the form's ink would hide the role's colour
                    }
                    .listRowBackground(theme.surfaceContainer)
                    .confirmationDialog("Delete “\(original.title)”?", isPresented: $confirmDelete, titleVisibility: .visible) {
                        Button("Delete", role: .destructive) {
                            day.removeAnchor(original.id)
                            dismiss()
                        }
                    }
                }
            }
            .font(theme.font(.body, size: 16, relativeTo: .body))
            .foregroundStyle(theme.onSurface)
            .scrollContentBackground(.hidden)
            .background(NPBackground())
            .navigationTitle(original == nil ? "New anchor" : "Edit anchor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { SheetTitle(original == nil ? "New anchor" : "Edit anchor") }
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(!canSave)
                }
            }
            .onAppear { if original == nil { titleFocused = true } }
        }
        .presentationDetents([.large])
    }

    private func save() {
        let c = Calendar.current.dateComponents([.hour, .minute], from: time)
        var a = original ?? DayAnchor(title: title, hour: 9, minute: 0)
        a.title = title
        a.subtitle = subtitle
        a.hour = c.hour ?? 9
        a.minute = c.minute ?? 0
        a.flexMinutes = flex
        a.category = category
        day.saveAnchor(a)
        dismiss()
    }
}

/// A sheet's title in the skin's display type.
struct SheetTitle: View {
    @Environment(\.npTheme) private var theme
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(theme.font(.displaySemi, size: 17, relativeTo: .headline))
            .foregroundStyle(theme.onSurface)
            .accessibilityAddTraits(.isHeader)
    }
}
