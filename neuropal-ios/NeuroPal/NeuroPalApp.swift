import NPCore
import NPDay
import NPTheme
import SwiftUI

@main
struct NeuroPalApp: App {
    @State private var model = AppModel(options: LaunchOptions.current)

    var body: some Scene {
        WindowGroup {
            SceneRoot(model: model)
        }
        .commands { NeuroPalCommands() }
    }
}

/// One window: its own navigator, the app-wide session and stores, links,
/// and the foreground check.
struct SceneRoot: View {
    let model: AppModel
    @State private var navigator = AppNavigator()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        RootView(widgetGallery: model.options.widgetGallery, creatingAccount: model.options.signUp,
                 editingServer: model.options.serverForm)
            .environment(model.session)
            .environment(navigator)
            .environment(model.themeStore)
            .environment(model.dayStore)
            .environment(model.preferences)
            .onOpenURL { url in
                if let route = DeepLink.route(for: url) { navigator.open(route) }
            }
            .task { await model.start(navigator: navigator) }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await model.becameActive() } }
            }
            .onChange(of: model.session.phase) { _, phase in
                model.sessionPhaseChanged(to: phase)
            }
    }
}

/// The focused window, for the keyboard commands: its navigator (always),
/// and whether the signed-in app is showing there (the tabs and Pal).
extension FocusedValues {
    @Entry var npNavigator: AppNavigator?
    @Entry var npAppShowing: Bool?
}

/// iPad (and a hardware keyboard on iPhone): ⌘1–⌘4 for the tabs, ⌘⇧P for Pal.
/// They show in the menu bar and the ⌘-hold shortcut list. The calming
/// steps are there too, signed in or not.
struct NeuroPalCommands: Commands {
    @FocusedValue(\.npNavigator) private var nav
    @FocusedValue(\.npAppShowing) private var appShowing

    var body: some Commands {
        CommandMenu("Go") {
            ForEach(Array(NPTab.allCases.enumerated()), id: \.element) { index, tab in
                Button(tab.title) { nav?.open(.tab(tab)) }
                    .keyboardShortcut(KeyEquivalent(Character(String(index + 1))), modifiers: .command)
                    .disabled(appShowing != true)
            }
            Divider()
            Button("Open Pal") { nav?.open(.pal(nil)) }
                .keyboardShortcut("p", modifiers: [.command, .shift])
                .disabled(appShowing != true)
            Button("Calming steps") { nav?.open(.calm) }
                .disabled(nav == nil)
        }
    }
}
