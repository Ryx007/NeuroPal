import NPCore
import NPTokens
import Observation
import SwiftUI
import WidgetKit

/// The user's look: the appearance object, saved locally (appearance.json in
/// the shared container, so widgets match) and synced with the server
/// (GET/PUT /api/me/appearance; the newest `updatedAt` wins; a 409 hands
/// back the server's newer copy, which is adopted).
///
/// Sync rules (the Expo app's services/appearanceSync.js):
/// - `syncWithServer`: pull the server copy. Newer than ours (or ours was
///   never changed) → adopt it. Ours newer (or the server has none) → push.
/// - every `apply` afterwards → a push, debounced (~1 s); a change made
///   while a PUT is on the wire is sent right after it, never dropped.
/// - 409 (`APIError.staleAppearance`) → adopt the server's copy, unless we
///   edited again after it (then push again, at most twice in a row).
/// - offline or any other failure → keep the local copy; the next sync or
///   change tries again. Nothing here ever blocks the UI.
@MainActor
@Observable
public final class ThemeStore {
    public nonisolated static let fileName = "appearance.json"

    public private(set) var appearance: Appearance
    public private(set) var palette: Palette
    /// The last sync problem, for a quiet status line (nil = fine).
    public private(set) var syncProblem: String?

    @ObservationIgnored private let persist: Bool
    @ObservationIgnored private var api: (any NeuroPalAPI)?
    @ObservationIgnored private var pushTask: Task<Void, Never>?
    @ObservationIgnored private var widgetTask: Task<Void, Never>?
    @ObservationIgnored private var inFlight = false
    @ObservationIgnored private var pending = false
    @ObservationIgnored private var conflicts = 0
    /// A push failed (offline): the next sync pushes even if nothing changed.
    @ObservationIgnored private var unsent = false
    /// Debounce before a PUT (and before the widgets reload).
    @ObservationIgnored public var pushDelay: Duration = .seconds(1)

    public init(appearance: Appearance? = nil, persist: Bool = true) {
        self.persist = persist
        let saved: Appearance? = persist
            ? SharedContainer.read(JSONValue.self, from: Self.fileName).map { Tokens.normalizeAppearance($0) }
            : nil
        let a = Tokens.normalizeAppearance(appearance ?? saved ?? .default)
        self.appearance = a
        self.palette = Tokens.palette(for: a)
    }

    public func theme(reduceMotion: Bool) -> NPTheme {
        NPTheme(palette: palette, appearance: appearance, reduceMotion: reduceMotion)
    }

    /// Change the look (stamps `updatedAt`, saves, re-resolves the palette,
    /// and — once `syncWithServer` has run — sends it to the server).
    public func apply(_ next: Appearance) {
        var a = Tokens.normalizeAppearance(next)
        a.updatedAt = NPDateFormat.string(Date())
        set(a)
        schedulePush()
    }

    public func update(_ change: (inout Appearance) -> Void) {
        var a = appearance
        change(&a)
        apply(a)
    }

    /// Adopt a copy from the server without re-stamping it.
    public func adopt(_ json: JSONValue) {
        set(Tokens.normalizeAppearance(json))
    }

    // MARK: Server sync

    /// Reconcile with the server, then keep pushing local changes to it.
    /// Call after boot / sign-in / reconnect (calling again is fine — it is
    /// the retry for anything that failed offline).
    public func syncWithServer(_ api: any NeuroPalAPI) async {
        if self.api !== api {
            self.api = api
            conflicts = 0
        }
        do {
            let server = try await api.appearance()
            guard self.api === api else { return } // switched servers meanwhile
            syncProblem = nil
            let local = appearance
            if let server, !server.isNull {
                let serverAt = Tokens.normalizeAppearance(server).updatedAt
                if local.updatedAt == nil || Self.newer(serverAt, than: local.updatedAt) {
                    adopt(server)
                    unsent = false
                    return
                }
                if Self.newer(local.updatedAt, than: serverAt) || unsent {
                    await push()
                }
            } else if local.updatedAt != nil {
                await push()
            }
        } catch {
            // Offline, signed out, an older server without the route: stay local.
            if case APIError.offline = error { syncProblem = "Offline — your look is saved on this device." }
        }
    }

    private func schedulePush() {
        guard api != nil else { return }
        pushTask?.cancel()
        let delay = pushDelay
        pushTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.push()
        }
    }

    private func push() async {
        guard let api else { return }
        if inFlight {
            // Never drop an edit: send it as soon as the current PUT settles.
            pending = true
            return
        }
        inFlight = true
        let sent = appearance
        do {
            let json = try JSONValue(encoding: sent)
            let saved = try await api.putAppearance(json)
            conflicts = 0
            unsent = false
            syncProblem = nil
            // The server clamps a fast clock's stamp. If nothing changed here
            // since, take its stamp so the next pull doesn't push the same look.
            let stored = Tokens.normalizeAppearance(saved)
            if stored.updatedAt != appearance.updatedAt, Self.sameContent(stored, appearance) {
                set(stored)
            }
        } catch APIError.staleAppearance(let server) {
            let local = appearance
            let serverCopy = Tokens.normalizeAppearance(server)
            let localWins = local.updatedAt != nil && Self.newer(local.updatedAt, than: serverCopy.updatedAt)
                && !Self.sameContent(local, serverCopy)
            if localWins && conflicts < 2 {
                conflicts += 1
                pending = true
            } else {
                conflicts = 0
                set(serverCopy)
            }
        } catch {
            // Offline / server trouble: keep the local copy; retry on the next sync.
            unsent = true
            if case APIError.offline = error { syncProblem = "Offline — your look is saved on this device." }
        }
        inFlight = false
        if pending {
            pending = false
            await push()
        }
    }

    // MARK: -

    private func set(_ a: Appearance) {
        let changed = a != appearance
        appearance = a
        palette = Tokens.palette(for: a)
        save()
        if changed { scheduleWidgetReload() }
    }

    private func save() {
        guard persist, let json = try? JSONValue(encoding: appearance) else { return }
        SharedContainer.write(json, to: Self.fileName)
    }

    /// The widgets draw with the saved look; tell them once the look settles.
    private func scheduleWidgetReload() {
        guard persist else { return }
        widgetTask?.cancel()
        let delay = pushDelay
        widgetTask = Task {
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    static func newer(_ a: String?, than b: String?) -> Bool {
        guard let a, let b, let x = NPDateFormat.parse(a), let y = NPDateFormat.parse(b) else { return false }
        return x > y
    }

    static func sameContent(_ a: Appearance, _ b: Appearance) -> Bool {
        var x = a
        var y = b
        x.updatedAt = nil
        y.updatedAt = nil
        return x == y
    }
}

/// Puts the current theme into the environment, following the OS Reduce
/// Motion setting. Wrap the app's root in it.
public struct ThemedRoot<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let store: ThemeStore
    private let content: Content

    public init(store: ThemeStore, @ViewBuilder content: () -> Content) {
        self.store = store
        self.content = content()
    }

    public var body: some View {
        content.npTheme(store.theme(reduceMotion: reduceMotion))
    }
}
