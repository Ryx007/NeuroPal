import NPAccount
import NPCore
import NPTheme
import SwiftUI

/// Settings: look (skin, theme, accent, Signal options), reading (voice,
/// speed, pitch, fonts), Pal, accessibility, account.
/// SKELETON — owned by the Tokens+Theme+Settings agent (mirror
/// neuropal-expo-app/src/screens/SettingsScreen.jsx and StudioScreen.jsx).
public struct SettingsRootView: View {
    @Environment(ThemeStore.self) private var themeStore
    @Environment(\.npTheme) private var theme

    public init() {}

    public var body: some View {
        NavigationStack {
            Form {
                Section("Look") {
                    Picker("Skin", selection: Binding(
                        get: { themeStore.appearance.skin },
                        set: { s in themeStore.update { $0.skin = s } })) {
                        Text("Classic").tag(Appearance.Skin.classic)
                        Text("Signal").tag(Appearance.Skin.signal)
                    }
                }
                AccountSettingsView()
            }
            .scrollContentBackground(.hidden)
            .background(NPBackground())
            .navigationTitle("Settings")
        }
    }
}
