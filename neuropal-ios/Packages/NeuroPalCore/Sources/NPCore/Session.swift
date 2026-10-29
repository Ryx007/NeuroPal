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
    private var signedOut: Bool

    public init(_ session: StoredSession? = nil, wasSignedOut: Bool = false) {
        self.session = session
        self.signedOut = wasSignedOut
    }

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
///   refreshed token); 401 → forget it, show sign-in; no answer (offline,
///   the edge answering for a server that is down, a reply that isn't from
///   NeuroPal) → open offline with the cached user. A deploy or an outage
///   never signs anyone out.
/// - no saved session → GET /api/auth/me without a token: 200 → a
///   single-user (LOCAL_MODE) server, signed in without a token; 401 →
///   sign-in; 404 → nothing NeuroPal at this address, sign-in (where the
///   address can be changed); no answer → open offline unless the user
///   signed out on this device (then sign-in).
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
    /// A single-user (LOCAL_MODE) server answered without a session: there is
    /// no account to sign out of or password to change.
    public private(set) var isLocalMode = false
    /// When the server last confirmed the session.
    public private(set) var lastCheckedAt: Date?
    /// A quiet session check (foreground, "Try again", a new server from
    /// the sign-in screen) is running.
    public var isChecking: Bool { quietCheck != nil }
    private var quietCheck: Int?
    @ObservationIgnored public let store: SessionStore
    /// Called after `switchHost(_:)` with the new address, so the app can keep it.
    @ObservationIgnored public var onHostChange: ((URL) -> Void)?
    @ObservationIgnored private let makeAPI: (URL) -> any NeuroPalAPI
    /// Bumped by every change of session (sign-in, sign-out, a new server, a
    /// new check): an answer to an older check is ignored.
    @ObservationIgnored private var epoch = 0
    @ObservationIgnored private var lastAttemptAt: Date?

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

    /// The cold-start check: the splash shows until it answers.
    public func boot() async {
        await check(splash: true, keepSignIn: false)
    }

    /// Checks the session again without the splash: when the app comes back
    /// to the foreground (at most every `minimumInterval` seconds), or from
    /// the offline banner (`force`). Opened offline, an answer brings the
    /// app back online; a 401 ends the session.
    public func refresh(force: Bool = false, minimumInterval: TimeInterval = 180) async {
        guard phase == .signedIn || phase == .offline, !isChecking else { return }
        if !force, let last = lastAttemptAt, Date().timeIntervalSince(last) < minimumInterval { return }
        await check(splash: false, keepSignIn: false)
    }

    /// The sign-in screen's quiet check (e.g. the server turned out to be a
    /// single-user one, which signs in by itself). No answer keeps sign-in up.
    public func recheck() async {
        guard phase == .signedOut, !isChecking else { return }
        await check(splash: false, keepSignIn: true)
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

    /// Ends every session of the account, then this one. A session the
    /// server already ended ends here too.
    public func signOutEverywhere() async throws {
        do {
            try await api.logoutEverywhere()
        } catch APIError.unauthorized {
        } catch APIError.server(status: 401, _) {
        }
        endSession()
    }

    /// The server ends every other session and hands this one a new token.
    public func changePassword(current: String, new: String) async throws {
        let token = try await api.changePassword(current: current, new: new)
        epoch += 1
        api.token = token
        store.save(StoredSession(host: Self.origin(host), token: token, user: user))
    }

    /// Point the app at another server (Settings / sign-in "Server"). The
    /// old session stays saved for the old host. From the sign-in screen the
    /// check is quiet: it opens the app only if the new server lets it (a
    /// saved session there, or a single-user server), else stays on sign-in.
    public func switchHost(_ newHost: URL) async {
        let fromSignIn = phase == .signedOut
        epoch += 1
        host = newHost
        api = makeAPI(newHost)
        wireUnauthorized()
        user = nil
        isLocalMode = false
        lastCheckedAt = nil
        onHostChange?(newHost)
        await check(splash: !fromSignIn, keepSignIn: fromSignIn)
    }

    /// The server refused this session's token (a 401 on a request that
    /// carried it): forget it and show sign-in. `rejectedToken` is the
    /// token that got the 401 — an answer about an older one is ignored.
    public func sessionEnded(rejectedToken: String? = nil) {
        if let rejectedToken, rejectedToken != api.token { return }
        guard phase != .signedOut || api.token != nil else { return }
        endSession()
    }

    // MARK: -

    /// GET /api/auth/me and act on the answer (rules above). `keepSignIn`:
    /// no answer leaves the sign-in screen up instead of opening offline.
    private func check(splash: Bool, keepSignIn: Bool) async {
        epoch += 1
        let started = epoch
        if splash { phase = .booting } else { quietCheck = started }
        lastAttemptAt = Date()
        defer { if quietCheck == started { quietCheck = nil } }

        let saved = store.load(host: host)
        // The token in memory wins: if the Keychain ever failed to keep it,
        // a later check must not drop a working session.
        if api.token == nil { api.token = saved?.token }
        let sentToken = api.token
        let api = self.api
        do {
            let me = try await api.me()
            guard epoch == started else { return }
            if let fresh = me.refreshedToken { api.token = fresh }
            user = me.user
            lastCheckedAt = Date()
            if let token = api.token {
                isLocalMode = false
                store.save(StoredSession(host: Self.origin(host), token: token, user: me.user))
            } else {
                // Answered without a session: a single-user server.
                isLocalMode = true
            }
            phase = .signedIn
        } catch {
            guard epoch == started else { return }
            switch error {
            case APIError.unauthorized, APIError.server(status: 401, _):
                endSession()
            case APIError.notFound where sentToken == nil && !isLocalMode:
                // Nothing NeuroPal answers here: sign-in shows the address.
                user = nil
                phase = .signedOut
            default:
                if keepSignIn {
                    phase = .signedOut
                } else if sentToken != nil || isLocalMode || phase == .signedIn || phase == .offline {
                    if user == nil { user = saved?.user }
                    phase = .offline
                } else if store.wasSignedOut {
                    phase = .signedOut
                } else {
                    // Never signed in on this device and no answer: the
                    // phone-side app still opens (check-ins, the calming
                    // steps, Pal's offline tools); the first answer asks.
                    phase = .offline
                }
            }
        }
    }

    private func adopt(_ result: AuthResult) {
        epoch += 1
        api.token = result.token
        user = result.user
        isLocalMode = false
        lastCheckedAt = Date()
        store.save(StoredSession(host: Self.origin(host), token: result.token, user: result.user))
        phase = .signedIn
    }

    private func endSession() {
        epoch += 1
        api.token = nil
        user = nil
        isLocalMode = false
        lastCheckedAt = nil
        store.clear(host: host)
        phase = .signedOut
    }

    private func wireUnauthorized() {
        guard let http = api as? HTTPNeuroPalAPI else { return }
        http.onUnauthorized = { [weak self] rejected in
            Task { @MainActor in self?.sessionEnded(rejectedToken: rejected) }
        }
    }
}
