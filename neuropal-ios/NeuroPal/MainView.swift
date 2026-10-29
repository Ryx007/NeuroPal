import NPCore
import NPHome
import NPPal
import NPReader
import NPSettings
import NPTheme
import SwiftUI

/// The signed-in app. iPhone: a tab bar. iPad: a sidebar (TabView
/// `.sidebarAdaptable`), with Library splitting into list + reader.
struct MainView: View {
    @Environment(AppNavigator.self) private var nav
    @Environment(ThemeStore.self) private var themeStore
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.npTheme) private var theme

    var body: some View {
        @Bindable var nav = nav
        TabView(selection: $nav.tab) {
            Tab(NPTab.home.title, systemImage: NPTab.home.symbol, value: NPTab.home) { HomeRootView() }
            Tab(NPTab.library.title, systemImage: NPTab.library.symbol, value: NPTab.library) { LibraryRootView() }
            Tab(NPTab.pal.title, systemImage: NPTab.pal.symbol, value: NPTab.pal) { PalAssistantView() }
            Tab(NPTab.settings.title, systemImage: NPTab.settings.symbol, value: NPTab.settings) { SettingsRootView() }
        }
        .tabViewStyle(.sidebarAdaptable)
        .sheet(isPresented: $nav.palOpen) {
            ThemedRoot(store: themeStore) { PalAssistantView(initialTool: nav.palTool) }
                .presentationDetents([.medium, .large])
        }
    }
}
