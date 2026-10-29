import Foundation
import Testing
@testable import NPCore

// Answers that arrive after the server or the session changed under them
// (review finding 1: a token bound to the wrong server), and the password
// change swapping the token while other calls still carry the old one.
@MainActor
@Suite("Session races")
struct SessionRaceTests {
    let a = URL(string: "https://a.example")!
    let b = URL(string: "https://b.example")!
    let ryx = NPUser(id: "64f0c0ffee00000000000aa1", email: "ryx@example.com", name: "Ryx")

    /// Server A and server B, one API object each.
    func twoServers(_ apiA: GatedAPI, _ apiB: GatedAPI, store: SessionStore) -> AppSession {
        let a = self.a
        return AppSession(host: a, store: store, makeAPI: { h in h == a ? apiA : apiB })
    }

    // MARK: Sign-in and a new account

    @Test func aSignInAnsweredAfterTheServerChangedIsDropped() async throws {
        let apiA = GatedAPI(host: a)
        let apiB = GatedAPI(host: b)
        let store = MemorySessionStore()
        let session = twoServers(apiA, apiB, store: store)
        var kept: [URL] = []
        session.onHostChange = { kept.append($0) }
        await session.boot()
        #expect(session.phase == .signedOut)

        let signingIn = Task { try await session.signIn(email: "ryx@example.com", password: "long-enough") }
        #expect(await eventually { apiA.loginGate.waiting == 1 })
        #expect(session.isAuthenticating)
        await session.switchHost(b)
        apiA.loginGate.open()
        await #expect(throws: CancellationError.self) { try await signingIn.value }

        // A's token never lands on B: not in memory, not in the store.
        #expect(session.host == b)
        #expect(session.phase == .signedOut)
        #expect(session.api.token == nil)
        #expect(apiB.token == nil)
        #expect(store.load(host: b) == nil)
        #expect(store.load(host: a) == nil)
        #expect(!session.isAuthenticating)
        // B answered (asking for a sign-in), so its address is kept.
        #expect(kept == [b])
    }

    @Test func aNewAccountAnsweredAfterTheServerChangedIsDropped() async throws {
        let apiA = GatedAPI(host: a)
        let apiB = GatedAPI(host: b)
        let store = MemorySessionStore()
        let session = twoServers(apiA, apiB, store: store)
        await session.boot()

        let registering = Task {
            try await session.register(email: "ryx@example.com", password: "long-enough", name: "Ryx", inviteCode: "x")
        }
        #expect(await eventually { apiA.registerGate.waiting == 1 })
        await session.switchHost(b)
        apiA.registerGate.open()
        await #expect(throws: CancellationError.self) { try await registering.value }
        #expect(session.phase == .signedOut)
        #expect(apiB.token == nil)
        #expect(store.load(host: b) == nil)
    }

    @Test func aSignInAnsweredAfterAnotherSignInIsDropped() async throws {
        // Two iPad windows on the sign-in screen: the later answer to arrive
        // doesn't replace the session the first one made.
        let api = GatedAPI(host: a)
        api.loginGates = [AsyncGate(), AsyncGate()]
        let store = MemorySessionStore()
        let session = AppSession(host: a, store: store, makeAPI: { _ in api })
        await session.boot()

        let first = Task { try await session.signIn(email: "first@example.com", password: "long-enough") }
        #expect(await eventually { api.loginGates[0].waiting == 1 })
        let second = Task { try await session.signIn(email: "second@example.com", password: "long-enough") }
        #expect(await eventually { api.loginGates[1].waiting == 1 })
        api.loginGates[1].open()
        try await second.value
        #expect(session.phase == .signedIn)
        api.loginGates[0].open()
        await #expect(throws: CancellationError.self) { try await first.value }
        #expect(session.user?.email == "second@example.com")
        #expect(session.api.token == "tok-login-2")
        #expect(store.load(host: a)?.token == "tok-login-2")
    }

    @Test func aSignInStillCountsWhenNothingChanged() async throws {
        let api = GatedAPI(host: a)
        let store = MemorySessionStore()
        let session = AppSession(host: a, store: store, makeAPI: { _ in api })
        await session.boot()
        let signingIn = Task { try await session.signIn(email: "ryx@example.com", password: "long-enough") }
        #expect(await eventually { api.loginGate.waiting == 1 })
        // A quiet check of the sign-in screen meanwhile doesn't void it.
        await session.recheck()
        api.loginGate.open()
        try await signingIn.value
        #expect(session.phase == .signedIn)
        #expect(store.load(host: a)?.token == "tok-login")
    }

    // MARK: Changing the password

    @Test func aPasswordChangeAnsweredAfterTheServerChangedIsDropped() async throws {
        let apiA = GatedAPI(host: a, meUser: ryx)
        let apiB = GatedAPI(host: b)
        let store = MemorySessionStore(StoredSession(host: AppSession.origin(a), token: "tok-a"))
        let session = twoServers(apiA, apiB, store: store)
        await session.boot()
        #expect(session.phase == .signedIn)

        let changing = Task { try await session.changePassword(current: "old-password", new: "new-password") }
        #expect(await eventually { apiA.passwordGate.waiting == 1 })
        await session.switchHost(b)
        apiA.passwordGate.open()
        await #expect(throws: CancellationError.self) { try await changing.value }
        #expect(session.host == b)
        #expect(apiB.token == nil)
        #expect(store.load(host: b) == nil)
        // A's record is A's alone (still the old token: the answer came too late).
        #expect(store.load(host: a)?.token == "tok-a")
    }

    @Test func a401OnTheOldTokenWaitsForThePasswordChange() async throws {
        // The server swaps the token first and answers after: a data call
        // carrying the old token can get its 401 in between.
        let api = GatedAPI(host: a, meUser: ryx)
        let store = MemorySessionStore(StoredSession(host: AppSession.origin(a), token: "tok-old"))
        let session = AppSession(host: a, store: store, makeAPI: { _ in api })
        await session.boot()
        let changing = Task { try await session.changePassword(current: "old-password", new: "new-password") }
        #expect(await eventually { api.passwordGate.waiting == 1 })
        session.sessionEnded(rejectedToken: "tok-old")
        #expect(session.phase == .signedIn)
        api.passwordGate.open()
        try await changing.value
        #expect(session.phase == .signedIn)
        #expect(session.api.token == "tok-new")
        #expect(store.load(host: a)?.token == "tok-new")
    }

    @Test func aFailedPasswordChangeLetsTheWaiting401EndTheSession() async throws {
        let api = GatedAPI(host: a, meUser: ryx)
        api.passwordResult = .failure(.server(status: 401, message: "the current password is not right"))
        let store = MemorySessionStore(StoredSession(host: AppSession.origin(a), token: "tok-old"))
        let session = AppSession(host: a, store: store, makeAPI: { _ in api })
        await session.boot()
        let changing = Task { try await session.changePassword(current: "wrong", new: "new-password") }
        #expect(await eventually { api.passwordGate.waiting == 1 })
        session.sessionEnded(rejectedToken: "tok-old")
        #expect(session.phase == .signedIn)
        api.passwordGate.open()
        await #expect(throws: APIError.server(status: 401, message: "the current password is not right")) {
            try await changing.value
        }
        #expect(session.phase == .signedOut)
        #expect(store.load(host: a) == nil)
    }

    @Test func aWrongCurrentPasswordAloneKeepsTheSession() async throws {
        let api = GatedAPI(host: a, meUser: ryx)
        api.passwordResult = .failure(.server(status: 401, message: "the current password is not right"))
        api.passwordGate.open()
        let store = MemorySessionStore(StoredSession(host: AppSession.origin(a), token: "tok-old"))
        let session = AppSession(host: a, store: store, makeAPI: { _ in api })
        await session.boot()
        await #expect(throws: APIError.server(status: 401, message: "the current password is not right")) {
            try await session.changePassword(current: "wrong", new: "new-password")
        }
        #expect(session.phase == .signedIn)
        #expect(session.api.token == "tok-old")
    }

    @Test func signingOutDuringAPasswordChangeDropsItsAnswer() async throws {
        let api = GatedAPI(host: a, meUser: ryx)
        let store = MemorySessionStore(StoredSession(host: AppSession.origin(a), token: "tok-old"))
        let session = AppSession(host: a, store: store, makeAPI: { _ in api })
        await session.boot()
        let changing = Task { try await session.changePassword(current: "old-password", new: "new-password") }
        #expect(await eventually { api.passwordGate.waiting == 1 })
        session.signOut()
        api.passwordGate.open()
        await #expect(throws: CancellationError.self) { try await changing.value }
        #expect(session.phase == .signedOut)
        #expect(session.api.token == nil)
        #expect(store.load(host: a) == nil)
    }

    // MARK: Plain http and the kind of address

    @Test func overHttpATokenGoesOnlyToTheKindOfAddressItWasMadeFor() async {
        let lan = URL(string: "http://192.168.3.169:4000")!
        let api = GatedAPI(host: lan, meUser: ryx)
        var record = StoredSession(host: AppSession.origin(lan), token: "tok-lan")
        record.kind = .tailscale
        let session = AppSession(host: lan, store: MemorySessionStore(record), makeAPI: { _ in api })
        await session.boot()
        #expect(api.meTokens == [nil])
        #expect(session.phase == .signedOut)
    }

    @Test func overHttpTheSameKindOfAddressSignsIn() async {
        let lan = URL(string: "http://192.168.3.169:4000")!
        let api = GatedAPI(host: lan, meUser: ryx)
        let session = AppSession(host: lan, store: MemorySessionStore(StoredSession(host: AppSession.origin(lan), token: "tok-lan")),
                                 makeAPI: { _ in api })
        await session.boot()
        #expect(api.meTokens == ["tok-lan"])
        #expect(session.phase == .signedIn)
    }
}
