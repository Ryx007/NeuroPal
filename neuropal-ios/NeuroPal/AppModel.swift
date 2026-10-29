import Network
import NPCore
import NPDay
import NPTheme
import Observation
import SwiftUI

/// The composition root: builds the session (real server or mock) and the
/// stores, once per launch. Each window has its own navigator (two iPad
/// windows can be in different places); the session and stores are shared.
@MainActor
@Observable
final class AppModel {
    let options: LaunchOptions
    let session: AppSession
    let themeStore: ThemeStore
    let dayStore: DayStore
    let preferences: AppPreferences
    @ObservationIgnored private var bootTask: Task<Void, Never>?
    @ObservationIgnored private var connectivity: ConnectivityWatcher?
    /// Every window reports phase changes; each is acted on once.
    @ObservationIgnored private var handledPhase: AppSession.Phase?

    init(options: LaunchOptions) {
        self.options = options
        if options.mock {
            // Offline fixtures, never touching the Keychain or saved data.
            let signedIn = !options.signedOut
            let mockHost = URL(string: "https://mock.neuropal.invalid")!
            let offline = options.offline
            session = AppSession(
                host: mockHost,
                store: MemorySessionStore(signedIn
                    ? StoredSession(host: AppSession.origin(mockHost), token: "mock-token", user: MockFixtures.user)
                    : nil, wasSignedOut: !signedIn),
                makeAPI: { host in
                    let api = MockNeuroPalAPI(host: host, token: signedIn ? "mock-token" : nil)
                    api.offline = offline
                    return api
                })
            themeStore = ThemeStore(appearance: options.appearance, persist: false)
            dayStore = DayStore(persist: false)
            preferences = AppPreferences(defaults: nil)
        } else if let host = options.host {
            // A real server for this launch only — nothing read or saved.
            let seeded = options.token.map { StoredSession(host: AppSession.origin(host), token: $0) }
            session = AppSession(host: host, store: MemorySessionStore(seeded), makeAPI: { h in HTTPNeuroPalAPI(host: h) })
            themeStore = ThemeStore(persist: false)
            dayStore = DayStore(persist: false)
            preferences = AppPreferences(defaults: nil)
        } else {
            // The real thing: the address the user chose (or the default),
            // the session in the Keychain, bound to that address.
            let defaults = UserDefaults.standard
            let host = ServerAddress.saved(in: defaults) ?? AppSession.defaultHost
            session = AppSession(host: host, store: KeychainSessionStore(defaults: defaults),
                                 makeAPI: { h in HTTPNeuroPalAPI(host: h) })
            session.onHostChange = { ServerAddress.save($0, in: defaults) }
            themeStore = ThemeStore()
            dayStore = DayStore()
            preferences = AppPreferences()
        }
    }

    /// Every window calls this when it appears. The first one boots the
    /// session and takes the launch route; later ones wait for the boot.
    func start(navigator: AppNavigator) async {
        if let bootTask {
            await bootTask.value
            return
        }
        // The calming steps never wait for the network.
        if options.route == .calm { navigator.open(.calm) }
        let task = Task { await session.boot() }
        bootTask = task
        watchConnectivity()
        await task.value
        if let route = options.route, route != .calm { navigator.open(route) }
    }

    /// The session changed phase: boot finished signed in, a sign-in, a new
    /// server, back online after opening offline.
    func sessionPhaseChanged(to phase: AppSession.Phase) {
        guard phase != handledPhase else { return }
        handledPhase = phase
        guard phase == .signedIn else { return }
        // The look follows the account: runs after boot, sign-in, a server
        // switch and reconnecting.
        Task { await themeStore.syncWithServer(session.api) }
    }

    /// The app came to the foreground: check the session again, at most
    /// every few minutes (sooner when it opened offline).
    func becameActive() async {
        await session.refresh(minimumInterval: session.phase == .offline ? 30 : 180)
    }

    /// When the network comes back, an app that opened offline checks again
    /// at once (the banner goes away by itself).
    private func watchConnectivity() {
        guard !options.mock, connectivity == nil else { return }
        let watcher = ConnectivityWatcher { [weak self] in
            Task { @MainActor in
                guard let self, self.session.phase == .offline else { return }
                await self.session.refresh(force: true)
            }
        }
        watcher.start()
        connectivity = watcher
    }
}

/// Calls `onReconnect` when a network path becomes usable again.
final class ConnectivityWatcher: @unchecked Sendable {
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "io.neuropal.ios.connectivity")
    private let onReconnect: @Sendable () -> Void
    private var wasSatisfied: Bool?

    init(onReconnect: @escaping @Sendable () -> Void) {
        self.onReconnect = onReconnect
    }

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let satisfied = path.status == .satisfied
            // Runs on `queue` only, so the flag needs no lock.
            if satisfied, self.wasSatisfied == false { self.onReconnect() }
            self.wasSatisfied = satisfied
        }
        monitor.start(queue: queue)
    }

    deinit { monitor.cancel() }
}
