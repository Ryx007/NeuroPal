import Foundation
import Observation

/// The saved sign-in: bound to the server it came from, so a token is never
/// sent to a different host (same rule as the Expo app's session record).
public struct StoredSession: Codable, Hashable, Sendable {
    /// Server origin the token belongs to, e.g. "https://api.ryx007.work".
    public var host: String
    public var token: String
    /// The last user the server returned — lets the app open offline.
    public var user: NPUser?

    public init(host: String, token: String, user: NPUser? = nil) {
        self.host = host
        self.token = token
        self.user = user
    }
}

/// Where the session lives. The app uses the Keychain; tests and previews
/// use memory.
public protocol SessionStore: AnyObject, Sendable {
    /// The session for `host`, or nil (a session for another host is ignored).
    func load(host: URL) -> StoredSession?
    func save(_ session: StoredSession)
    /// Forget the session for `host` and remember that the user signed out
    /// (so an offline start asks for sign-in instead of opening).
    func clear(host: URL)
    var wasSignedOut: Bool { get }
}

public final class MemorySessionStore: SessionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var session: StoredSession?
    private var signedOut = false

    public init(_ session: StoredSession? = nil) { self.session = session }

    public func load(host: URL) -> StoredSession? {
        lock.withLock { session?.host == AppSession.origin(host) ? session : nil }
    }

    public func save(_ session: StoredSession) {
        lock.withLock {
            self.session = session
            signedOut = false
        }
    }

    public func clear(host: URL) {
        lock.withLock {
            if session?.host == AppSession.origin(host) { session = nil }
            signedOut = true
        }
    }

    public var wasSignedOut: Bool { lock.withLock { signedOut } }
}

/// Who is signed in, to which server, and whether the app may open.
///
/// Boot rules (mirroring neuropal-expo-app/src/navigation/AppNavigator.jsx):
/// - a saved session → GET /api/auth/me: 200 → signed in (swap in a
///   refreshed token); 401 → forget it, show sign-in; offline → open with
///   the cached user.
/// - no saved session → GET /api/auth/me without a token: 200 → a
///   local-mode server (signed in, no token); 401 → sign-in; offline → open
///   offline unless the user explicitly signed out on this device.
@MainActor
@Observable
public final class AppSession {
    public enum Phase: Equatable, Sendable {
        case booting
        case signedOut
        case signedIn
        /// Opened without reaching the server; data may be stale.
        case offline
    }

    public nonisolated static let defaultHost = URL(string: "https://api.ryx007.work")!

    public private(set) var phase: Phase = .booting
    public private(set) var user: NPUser?
    public private(set) var api: any NeuroPalAPI
    public private(set) var host: URL
    @ObservationIgnored public let store: SessionStore
    @ObservationIgnored private let makeAPI: (URL) -> any NeuroPalAPI

    public init(host: URL = AppSession.defaultHost, store: SessionStore,
                makeAPI: @escaping (URL) -> any NeuroPalAPI) {
        self.host = host
        self.store = store
        self.makeAPI = makeAPI
        self.api = makeAPI(host)
        wireUnauthorized()
    }

    /// "https://host:port" — the part of a URL a session is bound to.
    public nonisolated static func origin(_ url: URL) -> String {
        var c = URLComponents()
        c.scheme = url.scheme?.lowercased()
        c.host = url.host?.lowercased()
        c.port = url.port
        return c.string ?? url.absoluteString
    }

    public var isSignedIn: Bool { phase == .signedIn || phase == .offline }

    public func boot() async {
        phase = .booting
        let saved = store.load(host: host)
        api.token = saved?.token
        do {
            let me = try await api.me()
            if let fresh = me.refreshedToken { api.token = fresh }
            user = me.user
            if let token = api.token {
                store.save(StoredSession(host: Self.origin(host), token: token, user: me.user))
            }
            phase = .signedIn
        } catch APIError.unauthorized {
            endSession()
        } catch APIError.server(status: 401, _) {
            endSession()
        } catch {
            if let saved {
                user = saved.user
                phase = .offline
            } else if store.wasSignedOut {
                phase = .signedOut
            } else {
                phase = .offline
            }
        }
    }

    public func signIn(email: String, password: String) async throws {
        let result = try await api.login(email: email, password: password)
        adopt(result)
    }

    public func register(email: String, password: String, name: String?, inviteCode: String?) async throws {
        let result = try await api.register(email: email, password: password, name: name, inviteCode: inviteCode)
        adopt(result)
    }

    /// Sign out on this device only.
    public func signOut() {
        endSession()
    }

    /// Ends every session of the account, then this one.
    public func signOutEverywhere() async throws {
        try await api.logoutEverywhere()
        endSession()
    }

    public func changePassword(current: String, new: String) async throws {
        let token = try await api.changePassword(current: current, new: new)
        api.token = token
        store.save(StoredSession(host: Self.origin(host), token: token, user: user))
    }

    /// Point the app at another server (Settings / sign-in "Server").
    /// The old session stays saved for the old host.
    public func switchHost(_ newHost: URL) async {
        host = newHost
        api = makeAPI(newHost)
        wireUnauthorized()
        await boot()
    }

    /// The server refused this session's token (a 401 on a request that
    /// carried it): forget it and show sign-in.
    public func sessionEnded() {
        endSession()
    }

    // MARK: -

    private func adopt(_ result: AuthResult) {
        api.token = result.token
        user = result.user
        store.save(StoredSession(host: Self.origin(host), token: result.token, user: result.user))
        phase = .signedIn
    }

    private func endSession() {
        api.token = nil
        user = nil
        store.clear(host: host)
        phase = .signedOut
    }

    private func wireUnauthorized() {
        guard let http = api as? HTTPNeuroPalAPI else { return }
        http.onUnauthorized = { [weak self] in
            Task { @MainActor in self?.sessionEnded() }
        }
    }
}
