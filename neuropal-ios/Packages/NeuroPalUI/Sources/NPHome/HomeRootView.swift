import NPCore
import NPDay
import NPTheme
import SwiftUI

/// The Home tab (HomeScreen.jsx): a greeting, then the user's tiles in the
/// order and sizes of their Home layout — check-in, next anchor, focus,
/// minimum viable day, continue reading, Pal's note. iPhone: one column
/// (Signal pairs two medium tiles in a row). iPad: two columns.
public struct HomeRootView: View {
    @Environment(DayStore.self) private var day
    @Environment(AppNavigator.self) private var nav
    @Environment(AppSession.self) private var session
    @Environment(\.npTheme) private var theme
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var reading: PalLogic.ReadingItem?
    @State private var editingAnchor: DayAnchor?
    @State private var addingAnchor = false
    @State private var showAnchors = false
    @State private var showMinimumDay = false
    @State private var editingMinimumDay = false

    public init() {}

    public var body: some View {
        TimelineView(.everyMinute) { context in
            screen(now: context.date)
        }
        .background(NPBackground(field: true, redState: day.day.state == .red))
        .task(id: session.phase) { await loadReading() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await loadReading() } }
        }
        .onAppear {
            day.pal = theme.appearance.pal
            day.rollOverIfNeeded()
            openLaunchSheet()
        }
        .onChange(of: theme.appearance.pal) { _, pal in day.pal = pal }
        .sheet(item: $editingAnchor) { a in AnchorFormView(anchor: a).npTheme(theme) }
        .sheet(isPresented: $addingAnchor) { AnchorFormView(anchor: nil).npTheme(theme) }
        .sheet(isPresented: $showAnchors) { AnchorsEditorView().npTheme(theme) }
        .sheet(isPresented: $showMinimumDay) { MinimumDaySheet().npTheme(theme) }
    }

    // MARK: Layout

    private var wide: Bool { sizeClass == .regular }

    private func screen(now: Date) -> some View {
        let tiles = visibleTiles(now)
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                greeting(now)
                if day.day.state == .yellow && (!theme.isSignal || !tiles.contains { $0.id == "state" }) {
                    yellowNote.padding(.top, 20)
                }
                if wide {
                    columns(tiles, now: now).padding(.top, 22)
                } else {
                    ForEach(rows(tiles)) { row in
                        rowView(row, now: now).padding(.top, gap(before: row.tiles[0]))
                    }
                }
            }
            .padding(.horizontal, theme.isSignal ? 16 : 20)
            .padding(.top, 20)
            .padding(.bottom, wide ? 40 : 110) // the last tile never sits under Pal's bubble
            .frame(maxWidth: wide ? 1040 : .infinity)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func visibleTiles(_ now: Date) -> [Appearance.HomeTile] {
        // Until the user arranges Home, Classic keeps its original screen.
        let home = Tokens.homeForSkin(theme.appearance.home, theme.appearance.skin)
        return Tokens.effectiveTiles(home, date: now).filter { $0.id != "reading" || reading != nil }
    }

    struct Row: Identifiable {
        let tiles: [Appearance.HomeTile]
        var id: String { tiles.map(\.id).joined(separator: "+") }
    }

    /// iPhone rows. Signal pairs two consecutive medium tiles of these kinds
    /// (the S-Today board); everything else is full width — and at the
    /// accessibility text sizes every tile gets the full width.
    private func rows(_ tiles: [Appearance.HomeTile]) -> [Row] {
        let pairable: Set<String> = ["anchor", "focus", "reading", "pal"]
        let pairs = theme.isSignal && !typeSize.isAccessibilitySize
        var out: [Row] = []
        var k = 0
        while k < tiles.count {
            let t = tiles[k]
            if pairs, k + 1 < tiles.count, t.size == "M", tiles[k + 1].size == "M",
               pairable.contains(t.id), pairable.contains(tiles[k + 1].id) {
                out.append(Row(tiles: [t, tiles[k + 1]]))
                k += 2
            } else {
                out.append(Row(tiles: [t]))
                k += 1
            }
        }
        return out
    }

    @ViewBuilder private func rowView(_ row: Row, now: Date) -> some View {
        if row.tiles.count == 2 {
            HStack(alignment: .top, spacing: 12) {
                ForEach(row.tiles) { t in
                    tile(t, half: true, now: now).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        } else {
            tile(row.tiles[0], half: false, now: now)
        }
    }

    /// iPad: two columns, each tile going to the shorter one (by size), so
    /// the screen's width is used and the order still reads top to bottom.
    private func columns(_ tiles: [Appearance.HomeTile], now: Date) -> some View {
        var left: [Appearance.HomeTile] = []
        var right: [Appearance.HomeTile] = []
        var lh = 0
        var rh = 0
        for t in tiles {
            let h = t.size == "L" ? 3 : t.size == "M" ? 2 : 1
            if lh <= rh {
                left.append(t)
                lh += h
            } else {
                right.append(t)
                rh += h
            }
        }
        return HStack(alignment: .top, spacing: 20) {
            column(left, now: now)
            column(right, now: now)
        }
    }

    private func column(_ tiles: [Appearance.HomeTile], now: Date) -> some View {
        VStack(alignment: .leading, spacing: theme.isSignal ? 16 : 22) {
            ForEach(tiles) { t in tile(t, half: false, now: now) }
        }
        .frame(maxWidth: .infinity, alignment: .top)
    }

    /// Classic keeps its original gaps above each section; Signal is even.
    private func gap(before t: Appearance.HomeTile) -> CGFloat {
        guard !theme.isSignal else { return 14 }
        return ["state": 26, "mvd": 30, "anchor": 24, "reading": 16, "focus": 24, "pal": 24][t.id] ?? 24
    }

    @ViewBuilder private func tile(_ t: Appearance.HomeTile, half: Bool, now: Date) -> some View {
        switch t.id {
        case "state":
            StateTile(size: t.size, message: stateMessage(now))
        case "anchor":
            AnchorTile(size: t.size, half: half, now: now, onEdit: { editingAnchor = $0 }, onAdd: { addingAnchor = true },
                       onList: { showAnchors = true })
        case "focus":
            FocusTile(size: t.size, half: half, now: now)
        case "mvd":
            MvdTile(size: t.size, editing: $editingMinimumDay, onOpenSheet: { showMinimumDay = true })
        case "reading":
            if let reading { ReadingTile(size: t.size, half: half, item: reading) }
        case "pal":
            PalTile(size: t.size, half: half)
        default:
            EmptyView()
        }
    }

    // MARK: Greeting

    private func greeting(_ now: Date) -> some View {
        let part = PalLogic.partOfDay(now)
        let hello: String
        switch part {
        case .morning: hello = "Good morning"
        case .afternoon: hello = "Good afternoon"
        case .evening: hello = "Good evening"
        case .night: hello = "Hello"
        }
        let name = session.user?.name?.split(separator: " ").first.map(String.init)
        let title = (name.map { "\(hello), \($0)" } ?? hello) + (theme.isSignal ? "." : "")
        let pal = theme.appearance.pal.name
        let sub = part == .night ? "\(pal): it’s late, so keep it small." : "\(pal): one step at a time today."
        return VStack(alignment: .leading, spacing: 4) {
            if theme.isSignal {
                SkinLabel(now.formatted(.dateTime.weekday(.abbreviated)) + " · "
                          + now.formatted(.dateTime.day().month(.abbreviated)))
                    .padding(.bottom, 2)
            }
            Text(title)
                .font(theme.font(.display, size: theme.isSignal ? 40 : 34, relativeTo: .largeTitle))
                .tracking(theme.isSignal ? -0.6 : -0.8)
                .foregroundStyle(theme.onSurface)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(sub)
                .font(theme.font(.body, size: 16, relativeTo: .body))
                .foregroundStyle(theme.onSurfaceVariant)
        }
    }

    private var yellowNote: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "lightbulb")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(theme.warn)
                .accessibilityHidden(true)
            Text("Starting from yellow. Keep today small: two minutes on anything counts.")
                .font(theme.font(.body, size: 13, relativeTo: .subheadline))
                .foregroundStyle(theme.onSurface)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.warn.opacity(0.1), in: RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusMedium : 18,
                                                                  style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusMedium : 18, style: .continuous)
            .strokeBorder(theme.warn.opacity(0.35), lineWidth: 1))
    }

    private func stateMessage(_ now: Date) -> String {
        switch day.day.state {
        case .green:
            if let a = day.nextAnchor(after: now) { return "Good window for focus. \(a.title) starts at \(a.clock)." }
            return "Good window for focus."
        case .yellow: return "Gentler mode. Two minutes is enough today."
        case .red: return "Everything else can wait. The calming steps are one tap away."
        case nil: return "Tap how you feel. Home and Pal adapt to it."
        }
    }

    // MARK: Continue reading

    /// What this device or the server says is being read (ReadingLookup).
    private func loadReading() async {
        reading = await ReadingLookup.current(api: session.isSignedIn ? session.api : nil, useSnapshot: day.isPersistent,
                                              fallbackToFirst: true)
    }

    /// Mock screenshots only: -NPHomeSheet anchors | newAnchor | minimumDay.
    private func openLaunchSheet() {
        guard !day.isPersistent else { return }
        switch UserDefaults.standard.string(forKey: "NPHomeSheet") {
        case "anchors": showAnchors = true
        case "newAnchor": addingAnchor = true
        case "editAnchor": editingAnchor = day.day.anchors.first
        case "minimumDay": showMinimumDay = true
        default: break
        }
    }
}

/// The minimum viable day on its own (behind the one-line S tile).
private struct MinimumDaySheet: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                MvdList(size: "L", editing: $editing).padding(20)
            }
            .background(NPBackground())
            .navigationTitle("Minimum viable day")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { SheetTitle("Minimum viable day") }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

#Preview("Home · Classic") {
    HomePreview(theme: .classic) { HomeRootView() }
}

#Preview("Home · Signal") {
    HomePreview(theme: .signal) { HomeRootView() }
}

/// The environment Home's previews need, all in memory.
struct HomePreview<Content: View>: View {
    let theme: NPTheme
    @ViewBuilder var content: Content
    @State private var session = AppSession(
        store: MemorySessionStore(StoredSession(host: "https://mock.neuropal.invalid", token: "mock-token", user: MockFixtures.user)),
        makeAPI: { host in MockNeuroPalAPI(host: host, latency: .zero) })
    @State private var nav = AppNavigator()
    @State private var day = DayStore(persist: false)
    @State private var themeStore = ThemeStore(persist: false)
    @State private var prefs = AppPreferences(defaults: nil)

    var body: some View {
        content
            .environment(session)
            .environment(nav)
            .environment(day)
            .environment(themeStore)
            .environment(prefs)
            .npTheme(theme)
    }
}
