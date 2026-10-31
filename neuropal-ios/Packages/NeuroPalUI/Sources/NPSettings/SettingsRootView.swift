import NPAccount
import NPCore
import NPTheme
import NPTokens
import SwiftUI

/// Settings: look ("Make it yours"), reading, Pal, accessibility, account,
/// about — after neuropal-expo-app/src/screens/SettingsScreen.jsx and
/// StudioScreen.jsx. iPhone: a list that pushes each part. iPad: a sidebar
/// of parts beside the open one.
public struct SettingsRootView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass

    public init() {}

    public var body: some View {
        if sizeClass == .regular {
            SettingsSplitView()
        } else {
            SettingsStackView()
        }
    }
}

/// iPhone: one list; the live preview on top opens "Make it yours".
private struct SettingsStackView: View {
    @Environment(ThemeStore.self) private var store
    @Environment(AppSession.self) private var session
    @Environment(\.npTheme) private var theme
    @State private var path: [SettingsPane] = SettingsPane.launchPane.map { [$0] } ?? []

    var body: some View {
        NavigationStack(path: $path) {
            Form {
                Section {
                    Button {
                        path.append(.look)
                    } label: {
                        LookPreviewCard(appearance: store.appearance, name: session.user?.name, proposed: false)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens Make it yours")
                    .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                    .listRowBackground(Color.clear)
                } header: {
                    WhyText("Shape the app around your brain, not the other way round.")
                        .textCase(nil)
                        .padding(.horizontal, -4)
                }

                Section {
                    ForEach([SettingsPane.look, .reading, .pal, .accessibility]) { pane in
                        NavigationLink(value: pane) { PaneRow(pane: pane) }
                    }
                }
                .npFormRow()

                AccountSettingsView()
                    .npFormRow()

                AboutSection()
            }
            .npForm()
            .navigationTitle("Settings")
            .navigationDestination(for: SettingsPane.self) { pane in
                SettingsDestination(pane: pane) { path.append(.look) }
            }
        }
    }
}

/// iPad: the parts in a sidebar column, the chosen one beside it.
private struct SettingsSplitView: View {
    @Environment(\.npTheme) private var theme
    @State private var selection: SettingsPane? = SettingsPane.launchPane ?? .look

    var body: some View {
        NavigationSplitView {
            List(selection: $selection) {
                ForEach(SettingsPane.allCases) { pane in
                    NavigationLink(value: pane) { PaneRow(pane: pane) }
                }
            }
            .listStyle(.sidebar)
            .scrollContentBackground(.hidden)
            .background(NPBackground())
            .navigationTitle("Settings")
            .navigationSplitViewColumnWidth(min: 280, ideal: 320, max: 380)
        } detail: {
            NavigationStack {
                SettingsDestination(pane: selection ?? .look) { selection = .look }
                    .id(selection)
            }
        }
        .navigationSplitViewStyle(.balanced)
        .tint(theme.accentText)
    }
}

/// The screen of one part.
private struct SettingsDestination: View {
    let pane: SettingsPane
    let openLook: () -> Void

    var body: some View {
        switch pane {
        case .look: LookSettingsView()
        case .reading: ReadingSettingsView()
        case .pal: PalSettingsView()
        case .accessibility: AccessibilitySettingsView(openLook: openLook)
        case .account:
            Form { AccountSettingsView().npFormRow() }
                .npForm()
                .navigationTitle("Account")
        case .about: AboutSettingsView()
        }
    }
}

#Preview("Settings — Classic") {
    SettingsPreviewHost(appearance: .default)
}

#Preview("Settings — Signal") {
    SettingsPreviewHost(appearance: Appearance(skin: .signal))
}

#Preview("Make it yours — Signal") {
    SettingsPreviewHost(appearance: Appearance(skin: .signal)) { NavigationStack { LookSettingsView() } }
}

/// Previews with the real stores (in memory) and the mock server.
struct SettingsPreviewHost<Content: View>: View {
    @State private var store: ThemeStore
    @State private var prefs = AppPreferences(defaults: nil)
    @State private var session = AppSession(
        host: URL(string: "https://mock.neuropal.invalid")!,
        store: MemorySessionStore(StoredSession(host: "https://mock.neuropal.invalid", token: "mock-token")),
        makeAPI: { host in MockNeuroPalAPI(host: host, latency: .zero) })
    @State private var nav = AppNavigator()
    private let content: Content

    init(appearance: Appearance, @ViewBuilder content: () -> Content) {
        _store = State(initialValue: ThemeStore(appearance: appearance, persist: false))
        self.content = content()
    }

    var body: some View {
        ThemedRoot(store: store) { content }
        .environment(store)
        .environment(prefs)
        .environment(session)
        .environment(nav)
        .task { await session.boot() }
    }
}

extension SettingsPreviewHost where Content == SettingsRootView {
    init(appearance: Appearance) {
        self.init(appearance: appearance) { SettingsRootView() }
    }
}
