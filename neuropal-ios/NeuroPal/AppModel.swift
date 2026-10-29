import NPCore
import NPDay
import NPTheme
import Observation
import SwiftUI

/// The composition root: builds the session (real server or mock), the
/// navigator and the stores, once per launch.
@MainActor
@Observable
final class AppModel {
    let options: LaunchOptions
    let session: AppSession
    let navigator = AppNavigator()
    let themeStore: ThemeStore
    let dayStore: DayStore
    let preferences: AppPreferences

    init(options: LaunchOptions) {
        self.options = options
        if options.mock {
            // Offline fixtures, never touching the Keychain or saved data.
            let signedIn = !options.signedOut
            session = AppSession(
                host: URL(string: "https://mock.neuropal.invalid")!,
                store: MemorySessionStore(signedIn ? StoredSession(host: "https://mock.neuropal.invalid", token: "mock-token") : nil),
                makeAPI: { host in MockNeuroPalAPI(host: host, token: signedIn ? "mock-token" : nil) })
            themeStore = ThemeStore(appearance: options.appearance, persist: false)
            dayStore = DayStore(persist: false)
            preferences = AppPreferences(defaults: nil)
        } else if let host = options.host {
            // A real server for this launch only — nothing read or saved.
            session = AppSession(host: host, store: MemorySessionStore(), makeAPI: { h in HTTPNeuroPalAPI(host: h) })
            themeStore = ThemeStore(persist: false)
            dayStore = DayStore(persist: false)
            preferences = AppPreferences(defaults: nil)
        } else {
            // SKELETON: the Core agent swaps in the Keychain store and the
            // saved server address.
            session = AppSession(
                store: MemorySessionStore(),
                makeAPI: { host in HTTPNeuroPalAPI(host: host) })
            themeStore = ThemeStore()
            dayStore = DayStore()
            preferences = AppPreferences()
        }
    }

    func start() async {
        await session.boot()
        if let route = options.route { navigator.open(route) }
    }
}
