import Foundation
import Testing
@testable import NPCore

// AppSession against a stub server: every boot branch (docs in Session.swift,
// mirroring neuropal-expo-app/src/navigation/AppNavigator.jsx), sign-in,
// sign-out, the server ending a session, switching servers, quiet checks.
@MainActor
@Suite("Session")
struct SessionTests {
    let cached = NPUser(id: "64f0c0ffee00000000000aa1", email: "cached@example.com", name: "Cached")

    func makeSession(_ server: StubServer, store: MemorySessionStore) -> AppSession {
        AppSession(host: server.host, store: store, makeAPI: { HTTPNeuroPalAPI(host: $0, urlSession: server.session) })
    }

    func savedStore(_ server: StubServer, token: String = "tok-1") -> MemorySessionStore {
        MemorySessionStore(StoredSession(host: AppSession.origin(server.host), token: token, user: cached))
    }

    func meCalls(_ server: StubServer) -> Int { server.requests.filter { $0.path == "/api/auth/me" }.count }

    // MARK: A saved session

    @Test func savedSessionAnswered() async {
        let server = StubServer(always: .json(200, Wire.user))
        let store = savedStore(server)
        let session = makeSession(server, store: store)
        await session.boot()
        #expect(session.phase == .signedIn)
        #expect(session.user?.email == "ryx@example.com")
        #expect(!session.isLocalMode)
        #expect(server.last?.header("Authorization") == "Bearer tok-1")
        #expect(store.load(host: server.host)?.user?.email == "ryx@example.com")
    }

    @Test func savedSessionGetsAFreshToken() async {
        let server = StubServer(always: .json(200, Wire.me(refreshedToken: "tok-2")))
        let store = savedStore(server)
        let session = makeSession(server, store: store)
        await session.boot()
        #expect(session.phase == .signedIn)
        #expect(session.api.token == "tok-2")
        #expect(store.load(host: server.host)?.token == "tok-2")
    }

    @Test func savedSessionRefused() async {
        let server = StubServer(always: .json(401, #"{"error":"This session was signed out — please sign in again"}"#))
        let store = savedStore(server)
        let session = makeSession(server, store: store)
        await session.boot()
        #expect(session.phase == .signedOut)
        #expect(session.user == nil)
        #expect(session.api.token == nil)
        #expect(store.load(host: server.host) == nil)
        #expect(store.wasSignedOut)
    }

    @Test func savedSessionOfflineOpensWithTheCachedUser() async {
        let server = StubServer(always: .fail(.notConnectedToInternet))
        let store = savedStore(server)
        let session = makeSession(server, store: store)
        await session.boot()
        #expect(session.phase == .offline)
        #expect(session.isSignedIn)
        #expect(session.user == cached)
        #expect(session.api.token == "tok-1")
        #expect(store.load(host: server.host)?.token == "tok-1")
    }

    @Test(arguments: [502, 503, 521, 530])
    func aServerThatIsDownNeverSignsAnyoneOut(status: Int) async {
        let server = StubServer(always: .json(status, "<html>origin unreachable</html>"))
        let store = savedStore(server)
        let session = makeSession(server, store: store)
        await session.boot()
        #expect(session.phase == .offline)
        #expect(store.load(host: server.host) != nil)
    }

    @Test func aReplyThatIsntFromNeuroPalCountsAsNoAnswer() async {
        let server = StubServer(always: .json(200, "<html>captive portal</html>", headers: ["Content-Type": "text/html"]))
        let session = makeSession(server, store: savedStore(server))
        await session.boot()
        #expect(session.phase == .offline)
    }

    // MARK: No saved session

    @Test func noSessionSingleUserServerSignsInByItself() async {
        let server = StubServer { r in
            r.header("Authorization") == nil ? .json(200, #"{"id":"l1","email":"local@neuropal.app","name":"Ryx"}"#) : .json(400, "{}")
        }
        let store = MemorySessionStore()
        let session = makeSession(server, store: store)
        await session.boot()
        #expect(session.phase == .signedIn)
        #expect(session.isLocalMode)
        #expect(session.api.token == nil)
        #expect(store.load(host: server.host) == nil)
    }

    @Test func noSessionAsksForSignIn() async {
        let server = StubServer(always: .json(401, #"{"error":"Missing token"}"#))
        let store = MemorySessionStore()
        let session = makeSession(server, store: store)
        await session.boot()
        #expect(session.phase == .signedOut)
        #expect(store.wasSignedOut)
    }

    @Test func noSessionOfflineStillOpensTheFirstTime() async {
        let server = StubServer(always: .fail(.cannotConnectToHost))
        let session = makeSession(server, store: MemorySessionStore())
        await session.boot()
        #expect(session.phase == .offline)
        #expect(session.user == nil)
    }

    @Test func noSessionOfflineAfterASignOutWaitsForSignIn() async {
        let server = StubServer(always: .fail(.notConnectedToInternet))
        let session = makeSession(server, store: MemorySessionStore(nil, wasSignedOut: true))
        await session.boot()
        #expect(session.phase == .signedOut)
    }

    @Test func nothingNeuroPalAtThisAddress() async {
        let server = StubServer(always: .json(404, "<html>nginx</html>"))
        let store = MemorySessionStore()
        let session = makeSession(server, store: store)
        await session.boot()
        #expect(session.phase == .signedOut)
        #expect(!store.wasSignedOut)
    }

    // MARK: Signing in and out

    @Test func signInKeepsTheSessionForThisServerOnly() async throws {
        let server = StubServer { r in
            switch r.path {
            case "/api/auth/me": return .json(401, #"{"error":"Missing token"}"#)
            case "/api/auth/login": return .json(200, Wire.auth(token: "tok-9"))
            default: return .json(404, "{}")
            }
        }
        let store = MemorySessionStore()
        let session = makeSession(server, store: store)
        await session.boot()
        #expect(session.phase == .signedOut)
        try await session.signIn(email: "ryx@example.com", password: "long-enough")
        #expect(session.phase == .signedIn)
        #expect(session.api.token == "tok-9")
        #expect(store.load(host: server.host)?.token == "tok-9")
        #expect(store.load(host: URL(string: "https://other.example")!) == nil)
        #expect(!store.wasSignedOut)
    }

    @Test func aWrongPasswordLeavesEverythingAsItWas() async {
        let server = StubServer { r in
            r.path == "/api/auth/login" ? .json(401, #"{"error":"invalid email or password"}"#) : .json(401, #"{"error":"Missing token"}"#)
        }
        let session = makeSession(server, store: MemorySessionStore())
        await session.boot()
        await #expect(throws: APIError.server(status: 401, message: "invalid email or password")) {
            try await session.signIn(email: "a@b.c", password: "nope")
        }
        #expect(session.phase == .signedOut)
    }

    @Test func aDataCall401EndsTheSession() async throws {
        let server = StubServer { r in
            r.path == "/api/auth/me" ? .json(200, Wire.user) : .json(401, #"{"error":"Invalid or expired token"}"#)
        }
        let store = savedStore(server)
        let session = makeSession(server, store: store)
        await session.boot()
        #expect(session.phase == .signedIn)
        _ = try? await session.api.documents(query: nil)
        #expect(await eventually { session.phase == .signedOut })
        #expect(store.load(host: server.host) == nil)
    }

    @Test func signOutForgetsThisServersSession() async {
        let server = StubServer(always: .json(200, Wire.user))
        let store = savedStore(server)
        let session = makeSession(server, store: store)
        await session.boot()
        session.signOut()
        #expect(session.phase == .signedOut)
        #expect(session.api.token == nil)
        #expect(store.load(host: server.host) == nil)
        #expect(store.wasSignedOut)
    }

    @Test func signOutEverywhereEndsEvenWhenTheServerAlreadyDid() async throws {
        let server = StubServer { r in
            r.path == "/api/auth/me" ? .json(200, Wire.user) : .json(401, #"{"error":"This session was signed out — please sign in again"}"#)
        }
        let session = makeSession(server, store: savedStore(server))
        await session.boot()
        try await session.signOutEverywhere()
        #expect(session.phase == .signedOut)
    }

    @Test func signOutEverywhereOfflineKeepsTheSession() async {
        let counter = Counter()
        let server = StubServer { r in
            counter.next() == 0 ? .json(200, Wire.user) : .fail(.notConnectedToInternet)
        }
        let session = makeSession(server, store: savedStore(server))
        await session.boot()
        await #expect(throws: APIError.offline) { try await session.signOutEverywhere() }
        #expect(session.phase == .signedIn)
    }

    @Test func changingThePasswordKeepsThisDeviceSignedIn() async throws {
        let server = StubServer { r in
            r.path == "/api/auth/password" ? .json(200, #"{"token":"tok-new"}"#) : .json(200, Wire.user)
        }
        let store = savedStore(server)
        let session = makeSession(server, store: store)
        await session.boot()
        try await session.changePassword(current: "old-password", new: "new-password")
        #expect(session.phase == .signedIn)
        #expect(session.api.token == "tok-new")
        #expect(store.load(host: server.host)?.token == "tok-new")
    }

    // MARK: Servers and quiet checks

    @Test func switchingServerFromSignInStaysThereWhenTheNewOneIsUnreachable() async {
        let first = StubServer(always: .json(401, #"{"error":"Missing token"}"#))
        let second = StubServer(always: .fail(.cannotFindHost))
        let sessions = [first.host: first.session, second.host: second.session]
        let session = AppSession(host: first.host, store: MemorySessionStore(),
                                 makeAPI: { HTTPNeuroPalAPI(host: $0, urlSession: sessions[$0]!) })
        var saved: URL?
        session.onHostChange = { saved = $0 }
        await session.boot()
        #expect(session.phase == .signedOut)
        await session.switchHost(second.host)
        #expect(session.phase == .signedOut)
        #expect(session.host == second.host)
        // Never answered: not saved (the next launch is back on the old address).
        #expect(saved == nil)
    }

    @Test func switchingToAServerWithItsOwnSessionOpensTheApp() async {
        let first = StubServer(always: .json(401, #"{"error":"Missing token"}"#))
        let second = StubServer(always: .json(200, Wire.user))
        let sessions = [first.host: first.session, second.host: second.session]
        let store = MemorySessionStore(StoredSession(host: AppSession.origin(second.host), token: "tok-b"))
        let session = AppSession(host: first.host, store: store,
                                 makeAPI: { HTTPNeuroPalAPI(host: $0, urlSession: sessions[$0]!) })
        var saved: URL?
        session.onHostChange = { saved = $0 }
        await session.boot()
        // The first server's 401 doesn't touch the second server's session.
        #expect(session.phase == .signedOut)
        #expect(store.load(host: second.host)?.token == "tok-b")
        await session.switchHost(second.host)
        #expect(session.phase == .signedIn)
        #expect(second.last?.header("Authorization") == "Bearer tok-b")
        #expect(first.requests.allSatisfy { $0.header("Authorization") == nil })
        #expect(saved == second.host)
    }

    @Test func aNewAddressIsKeptOnlyOnceANeuroPalServerAnswersThere() async {
        let first = StubServer(always: .json(401, #"{"error":"Missing token"}"#))
        let down = StubServer(always: .fail(.cannotConnectToHost))
        let html = StubServer(always: .json(200, "<html>a router page</html>", headers: ["Content-Type": "text/html"]))
        let counter = Counter()
        let later = StubServer { _ in counter.next() == 0 ? .fail(.timedOut) : .json(401, #"{"error":"Missing token"}"#) }
        let second = StubServer(always: .json(401, #"{"error":"Missing token"}"#))
        let sessions = [first.host: first.session, down.host: down.session, html.host: html.session,
                        later.host: later.session, second.host: second.session]
        let session = AppSession(host: first.host, store: MemorySessionStore(),
                                 makeAPI: { HTTPNeuroPalAPI(host: $0, urlSession: sessions[$0]!) })
        var kept: [URL] = []
        session.onHostChange = { kept.append($0) }
        await session.boot()
        await session.switchHost(down.host)
        await session.switchHost(html.host)
        #expect(kept.isEmpty)
        // The sign-in screen heard from it later ("Try again"): kept then.
        await session.switchHost(later.host)
        #expect(kept.isEmpty)
        session.serverAnswered()
        #expect(kept == [later.host])
        // A NeuroPal server asking for a sign-in is an answer.
        await session.switchHost(second.host)
        #expect(kept == [later.host, second.host])
        session.serverAnswered()
        #expect(kept == [later.host, second.host])
    }

    @Test func probingAServerSendsNothingOfTheSession() async {
        let current = StubServer(always: .json(200, Wire.user))
        let answering = StubServer(always: .json(200, #"{"localMode":false,"signup":"invite"}"#))
        let older = StubServer { r in
            r.path == "/api/auth/config" ? .json(404, #"{"error":"Not found"}"#) : .json(401, #"{"error":"Missing token"}"#)
        }
        let notNeuroPal = StubServer(always: .json(200, "<html>hello</html>", headers: ["Content-Type": "text/html"]))
        let off = StubServer(always: .fail(.cannotFindHost))
        let down = StubServer(always: .json(502, "<html>Bad gateway</html>"))
        let sessions = [current.host: current.session, answering.host: answering.session, older.host: older.session,
                        notNeuroPal.host: notNeuroPal.session, off.host: off.session, down.host: down.session]
        let session = AppSession(host: current.host, store: savedStore(current),
                                 makeAPI: { HTTPNeuroPalAPI(host: $0, urlSession: sessions[$0]!) })
        await session.boot()
        #expect(session.phase == .signedIn)
        #expect(await session.serverAnswers(at: answering.host))
        #expect(await session.serverAnswers(at: older.host))
        #expect(!(await session.serverAnswers(at: notNeuroPal.host)))
        #expect(!(await session.serverAnswers(at: off.host)))
        #expect(!(await session.serverAnswers(at: down.host)))
        for server in [answering, older, notNeuroPal] {
            #expect(server.requests.allSatisfy { $0.header("Authorization") == nil })
        }
        // Asking changed nothing here.
        #expect(session.host == current.host)
        #expect(session.api.token == "tok-1")
    }

    // MARK: A session without a token

    @Test func aSingleUserServerThatTurnedAccountsOnAsksForSignIn() async throws {
        let server = StubServer { r in
            r.path == "/api/auth/me" ? .json(200, #"{"id":"l1","email":"local@neuropal.app","name":"Ryx"}"#)
                : .json(401, #"{"error":"Missing token"}"#)
        }
        let session = makeSession(server, store: MemorySessionStore())
        await session.boot()
        #expect(session.phase == .signedIn)
        #expect(session.isLocalMode)
        await #expect(throws: APIError.unauthorized) { _ = try await session.api.documents(query: nil) }
        #expect(await eventually { session.phase == .signedOut })
    }

    @Test func aFirstLaunchThatOpenedOfflineAsksForSignInWhenTheServerRefuses() async throws {
        let server = StubServer { r in
            r.path == "/api/auth/me" ? .fail(.notConnectedToInternet) : .json(401, #"{"error":"Missing token"}"#)
        }
        let session = makeSession(server, store: MemorySessionStore())
        await session.boot()
        #expect(session.phase == .offline)
        _ = try? await session.api.documents(query: nil)
        #expect(await eventually { session.phase == .signedOut })
    }

    @Test func anOldAPIsLate401sChangeNothing() async throws {
        // A data call still on its way to the old server after a switch.
        let counter = Counter()
        let first = StubServer { r in
            if r.path == "/api/auth/me" { return .json(200, #"{"id":"l1","email":"local@neuropal.app"}"#) }
            _ = counter.next()
            return .json(401, #"{"error":"Missing token"}"#)
        }
        let second = StubServer(always: .json(200, Wire.user))
        let sessions = [first.host: first.session, second.host: second.session]
        let store = MemorySessionStore(StoredSession(host: AppSession.origin(second.host), token: "tok-b"))
        let session = AppSession(host: first.host, store: store,
                                 makeAPI: { HTTPNeuroPalAPI(host: $0, urlSession: sessions[$0]!) })
        await session.boot()
        let old = session.api
        await session.switchHost(second.host)
        #expect(session.phase == .signedIn)
        _ = try? await old.documents(query: nil)
        try await Task.sleep(for: .milliseconds(150))
        #expect(session.phase == .signedIn)
        #expect(session.api.token == "tok-b")
    }

    @Test func foregroundChecksAreThrottled() async {
        let server = StubServer(always: .json(200, Wire.user))
        let session = makeSession(server, store: savedStore(server))
        await session.boot()
        #expect(meCalls(server) == 1)
        await session.refresh()
        #expect(meCalls(server) == 1)
        await session.refresh(force: true)
        #expect(meCalls(server) == 2)
        await session.refresh(minimumInterval: 0)
        #expect(meCalls(server) == 3)
    }

    @Test func aCheckBringsAnOfflineAppBackOnline() async {
        let counter = Counter()
        let server = StubServer { _ in counter.next() == 0 ? .fail(.notConnectedToInternet) : .json(200, Wire.user) }
        let session = makeSession(server, store: savedStore(server))
        await session.boot()
        #expect(session.phase == .offline)
        await session.refresh(force: true)
        #expect(session.phase == .signedIn)
        #expect(session.user?.email == "ryx@example.com")
    }

    @Test func aQuietCheckGoingOfflineShowsOffline() async {
        let counter = Counter()
        let server = StubServer { _ in counter.next() == 0 ? .json(200, Wire.user) : .fail(.timedOut) }
        let session = makeSession(server, store: savedStore(server))
        await session.boot()
        await session.refresh(force: true)
        #expect(session.phase == .offline)
        #expect(session.user?.email == "ryx@example.com")
    }

    @Test func anAnswerToAnOlderCheckIsIgnored() async throws {
        let server = StubServer { _ in
            Thread.sleep(forTimeInterval: 0.3)
            return .json(200, Wire.user)
        }
        let session = makeSession(server, store: savedStore(server))
        await session.boot()
        async let check: Void = session.refresh(force: true)
        try await Task.sleep(for: .milliseconds(80))
        session.signOut()
        await check
        #expect(session.phase == .signedOut)
        #expect(session.user == nil)
    }

    @Test func theSignInScreensCheckFindsASingleUserServer() async {
        let counter = Counter()
        let server = StubServer { _ in
            counter.next() == 0 ? .json(401, #"{"error":"Missing token"}"#) : .json(200, #"{"id":"l1","email":"local@neuropal.app"}"#)
        }
        let session = makeSession(server, store: MemorySessionStore())
        await session.boot()
        #expect(session.phase == .signedOut)
        await session.recheck()
        #expect(session.phase == .signedIn)
        #expect(session.isLocalMode)
    }
}

final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0
    /// 0, 1, 2, … — one per call.
    func next() -> Int { lock.withLock { defer { value += 1 }; return value } }
}

@MainActor
func eventually(timeout: Duration = .seconds(3), _ condition: () -> Bool) async -> Bool {
    let deadline = ContinuousClock.now.advanced(by: timeout)
    while ContinuousClock.now < deadline {
        if condition() { return true }
        try? await Task.sleep(for: .milliseconds(10))
    }
    return condition()
}
