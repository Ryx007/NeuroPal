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
    /// The kind of address the session was made for. Over plain http the
    /// token only goes to that same kind of address. nil in records saved
    /// before it was kept.
    public var kind: ServerAddress.Kind?

    public init(host: String, token: String, user: NPUser? = nil, kind: ServerAddress.Kind? = nil) {
        self.host = host
        self.token = token
        self.user = user
        self.kind = kind ?? URL(string: host).map { ServerAddress.kind(of: $0) }
    }

    /// May this session's token be sent to `url`? Always over https (the
    /// record is already bound to its origin); over plain http only to the
    /// kind of address it was made for.
    public func isUsable(for url: URL) -> Bool {
        guard ServerAddress.isUnencrypted(url) else { return true }
        return kind == nil || kind == ServerAddress.kind(of: url)
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
///
/// Answers are bound to the server and the session they were asked for: a
/// sign-in or password-change reply that arrives after the server changed
/// (or after someone else signed in or out) is dropped, never saved for
/// the address now in use. A newly chosen server address is kept
/// (`onHostChange`) only once a NeuroPal server answers there.
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
    /// A sign-in, a new account or a password change is on its way: the
    /// server address shouldn't change until it answers.
    public var isAuthenticating: Bool { authenticating > 0 }
    private var authenticating = 0
    @ObservationIgnored public let store: SessionStore
    /// Called with a newly chosen address once a NeuroPal server answers
    /// there (the default address at once), so the app can keep it.
    @ObservationIgnored public var onHostChange: ((URL) -> Void)?
    /// Called whenever a session ends (sign-out, sign-out everywhere, the
    /// server refusing it, no session at boot): the app forgets what the
    /// account left on this device (`AccountTraces`, read-aloud, caches).
    @ObservationIgnored public var onSessionEnd: (() -> Void)?
    @ObservationIgnored private let makeAPI: (URL) -> any NeuroPalAPI
    /// Bumped by every change of session (sign-in, sign-out, a new server, a
    /// new check): an answer to an older check is ignored.
    @ObservationIgnored private var epoch = 0
    /// Bumped only when the session changes hands (a sign-in, the end of a
    /// session, a new server) — not by a check. A sign-in or password-change
    /// answer that crossed such a change is dropped.
    @ObservationIgnored private var sessionEpoch = 0
    @ObservationIgnored private var lastAttemptAt: Date?
    /// A newly chosen address that hasn't answered yet (not saved).
    @ObservationIgnored private var unsavedHost: URL?
    /// A password change is on its way: the server swaps this session's
    /// token for a new one, so a 401 on the current token waits for its
    /// answer instead of signing out in the middle of it.
    @ObservationIgnored private var rotations = 0
    @ObservationIgnored private var rotatingAPI: (any NeuroPalAPI)?
    @ObservationIgnored private var endedDuringRotation = false
    @ObservationIgnored private var swappedDuringRotation = false

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

    /// The built-in address (no server of one's own).
    public nonisolated static func isDefault(_ url: URL) -> Bool {
        origin(url) == origin(defaultHost) && (url.path.isEmpty || url.path == "/")
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

    /// Throws `CancellationError` when the answer came too late to count:
    /// the server changed meanwhile, or another sign-in finished first.
    public func signIn(email: String, password: String) async throws {
        let api = self.api
        let before = sessionEpoch
        authenticating += 1
        defer { authenticating -= 1 }
        let result = try await api.login(email: email, password: password)
        try adopt(result, from: api, sessionEpoch: before)
    }

    /// Throws `CancellationError` when the answer came too late to count (see `signIn`).
    public func register(email: String, password: String, name: String?, inviteCode: String?) async throws {
        let api = self.api
        let before = sessionEpoch
        authenticating += 1
        defer { authenticating -= 1 }
        let result = try await api.register(email: email, password: password, name: name, inviteCode: inviteCode)
        try adopt(result, from: api, sessionEpoch: before)
    }

    /// Sign out on this device only.
    public func signOut() {
        endSession()
    }

    /// Ends every session of the account, then this one. A session the
    /// server already ended ends here too.
    public func signOutEverywhere() async throws {
        let api = self.api
        do {
            try await api.logoutEverywhere()
        } catch APIError.unauthorized {
        } catch APIError.server(status: 401, _) {
        }
        guard self.api === api else {
            // The app moved to another server meanwhile: that server's
            // session stays; the one that was ended is forgotten.
            store.clear(host: api.host)
            return
        }
        endSession()
    }

    /// The server ends every other session and hands this one a new token.
    /// Throws `CancellationError` when the answer came too late to count
    /// (the server changed, or this session was signed out meanwhile).
    public func changePassword(current: String, new: String) async throws {
        let api = self.api
        let before = sessionEpoch
        authenticating += 1
        defer { authenticating -= 1 }
        if rotations == 0 {
            rotatingAPI = api
            endedDuringRotation = false
            swappedDuringRotation = false
        }
        rotations += 1
        let token: String
        do {
            token = try await api.changePassword(current: current, new: new)
        } catch {
            finishRotation()
            throw error
        }
        defer { finishRotation() }
        guard self.api === api, sessionEpoch == before, api.token != nil else { throw CancellationError() }
        epoch += 1
        swappedDuringRotation = true
        api.token = token
        lastCheckedAt = Date()
        store.save(StoredSession(host: Self.origin(host), token: token, user: user, kind: ServerAddress.kind(of: host)))
    }

    /// Point the app at another server (Settings / sign-in "Server"). The
    /// old session stays saved for the old host. From the sign-in screen the
    /// check is quiet: it opens the app only if the new server lets it (a
    /// saved session there, or a single-user server), else stays on sign-in.
    /// The address is kept (`onHostChange`) once a NeuroPal server answers
    /// there — the default address at once.
    public func switchHost(_ newHost: URL) async {
        let fromSignIn = phase == .signedOut
        epoch += 1
        sessionEpoch += 1
        host = newHost
        api = makeAPI(newHost)
        wireUnauthorized()
        user = nil
        isLocalMode = false
        lastCheckedAt = nil
        if Self.isDefault(newHost) {
            unsavedHost = nil
            onHostChange?(newHost)
        } else {
            unsavedHost = newHost
        }
        await check(splash: !fromSignIn, keepSignIn: fromSignIn)
    }

    /// Whether a NeuroPal server answers at `host` — asked before switching
    /// to it (GET /api/auth/config; an older server without it, GET
    /// /api/auth/me). Nothing of the current session is sent.
    public func serverAnswers(at host: URL) async -> Bool {
        let probe = makeAPI(host)
        probe.token = nil
        do {
            _ = try await probe.authConfig()
            return true
        } catch APIError.notFound, APIError.decoding {
            do {
                _ = try await probe.me()
                return true
            } catch APIError.unauthorized, APIError.server(status: 401, _) {
                return true
            } catch {
                return false
            }
        } catch {
            return false
        }
    }

    /// The sign-in screen heard from the server (its sign-up settings): a
    /// newly chosen address is kept.
    public func serverAnswered() {
        keepHostIfNew()
    }

    /// The server refused this session's token (a 401 on a request that
    /// carried it): forget it and show sign-in. `rejectedToken` is the
    /// token that got the 401 — an answer about an older one is ignored.
    public func sessionEnded(rejectedToken: String? = nil) {
        if let rejectedToken, rejectedToken != api.token { return }
        guard phase != .signedOut || api.token != nil else { return }
        if deferEndDuringRotation() { return }
        endSession()
    }

    /// A data call sent without a token got a 401, and there is still no
    /// token: the server wants an account now (a single-user server that
    /// turned accounts on, or a first launch that opened offline). Sign-in shows.
    func tokenlessRequestRefused() {
        guard api.token == nil, phase == .signedIn || phase == .offline else { return }
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
        // a later check must not drop a working session. A saved token goes
        // over plain http only to the kind of address it was made for.
        if api.token == nil, let saved, saved.isUsable(for: host) { api.token = saved.token }
        let sentToken = api.token
        let api = self.api
        do {
            let me = try await api.me()
            guard epoch == started else { return }
            if let fresh = me.refreshedToken { api.token = fresh }
            user = me.user
            lastCheckedAt = Date()
            keepHostIfNew()
            if let token = api.token {
                isLocalMode = false
                store.save(StoredSession(host: Self.origin(host), token: token, user: me.user,
                                         kind: ServerAddress.kind(of: host)))
            } else {
                // Answered without a session: a single-user server.
                isLocalMode = true
            }
            phase = .signedIn
        } catch {
            guard epoch == started else { return }
            switch error {
            case APIError.unauthorized, APIError.server(status: 401, _):
                // NeuroPal answered: it wants a sign-in.
                keepHostIfNew()
                if !splash, sentToken != nil, deferEndDuringRotation() { return }
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

    /// A sign-in answer: kept only if it was asked of the server still in
    /// use, and no other sign-in or sign-out happened meanwhile.
    private func adopt(_ result: AuthResult, from api: any NeuroPalAPI, sessionEpoch before: Int) throws {
        guard self.api === api, sessionEpoch == before else { throw CancellationError() }
        sessionEpoch += 1
        epoch += 1
        api.token = result.token
        user = result.user
        isLocalMode = false
        lastCheckedAt = Date()
        keepHostIfNew()
        store.save(StoredSession(host: Self.origin(host), token: result.token, user: result.user,
                                 kind: ServerAddress.kind(of: host)))
        phase = .signedIn
    }

    private func endSession() {
        if api.token != nil || phase == .signedIn || phase == .offline { sessionEpoch += 1 }
        epoch += 1
        api.token = nil
        user = nil
        isLocalMode = false
        lastCheckedAt = nil
        store.clear(host: host)
        phase = .signedOut
        onSessionEnd?()
    }

    /// The address chosen last answered as a NeuroPal server: keep it.
    private func keepHostIfNew() {
        guard let pending = unsavedHost, pending == host else { return }
        unsavedHost = nil
        onHostChange?(pending)
    }

    /// While a password change is swapping this session's token, a 401 on
    /// it waits for that answer (true = it waits).
    private func deferEndDuringRotation() -> Bool {
        guard rotations > 0, let rotating = rotatingAPI, rotating === api else { return false }
        endedDuringRotation = true
        return true
    }

    /// The password change answered (or failed). A 401 that waited for it
    /// ends the session now — unless the token was swapped for a new one.
    private func finishRotation() {
        rotations -= 1
        guard rotations == 0 else { return }
        let end = endedDuringRotation && !swappedDuringRotation && rotatingAPI === api && api.token != nil
        rotatingAPI = nil
        endedDuringRotation = false
        swappedDuringRotation = false
        if end { endSession() }
    }

    /// 401s from the API in use (a replaced API's late answers are ignored).
    private func wireUnauthorized() {
        guard let http = api as? HTTPNeuroPalAPI else { return }
        http.onUnauthorized = { [weak self, weak http] rejected in
            Task { @MainActor in
                guard let self, let http, self.api === http else { return }
                self.sessionEnded(rejectedToken: rejected)
            }
        }
        http.onUnauthorizedWithoutToken = { [weak self, weak http] in
            Task { @MainActor in
                guard let self, let http, self.api === http else { return }
                self.tokenlessRequestRefused()
            }
        }
    }
}
