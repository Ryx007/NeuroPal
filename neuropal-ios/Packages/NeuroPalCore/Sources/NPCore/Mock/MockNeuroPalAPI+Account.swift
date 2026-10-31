import Foundation

extension MockNeuroPalAPI {
    public func authConfig() async throws -> AuthConfig {
        await pause()
        try requireNetwork()
        return AuthConfig(localMode: false, signup: "invite")
    }

    /// Any email works; the password "wrong-password" is refused like the
    /// server would, and "slow-down" answers like its rate limit.
    public func login(email: String, password: String) async throws -> AuthResult {
        await pause()
        try requireNetwork()
        if password == "wrong-password" { throw APIError.server(status: 401, message: "invalid email or password") }
        if password == "slow-down" { throw APIError.rateLimited(retryAfter: 42) }
        token = "mock-token"
        return AuthResult(token: "mock-token", user: NPUser(id: MockFixtures.user.id, email: email, name: MockFixtures.user.name))
    }

    /// The invite code is "np-mock".
    public func register(email: String, password: String, name: String?, inviteCode: String?) async throws -> AuthResult {
        await pause()
        try requireNetwork()
        if inviteCode != "np-mock" { throw APIError.forbidden("That invite code is not right") }
        token = "mock-token"
        return AuthResult(token: "mock-token", user: NPUser(id: MockFixtures.user.id, email: email, name: name))
    }

    public func me() async throws -> MeResult {
        await pause()
        try requireNetwork()
        try requireSession()
        var user = MockFixtures.user
        user.appearance = lock.withLock { appearanceStore }
        return MeResult(user: user)
    }

    public func logoutEverywhere() async throws {
        await pause()
        try requireSession()
        token = nil
    }

    public func changePassword(current: String, new: String) async throws -> String {
        await pause()
        try requireSession()
        if current == "wrong-password" { throw APIError.server(status: 401, message: "the current password is not right") }
        token = "mock-token-2"
        return "mock-token-2"
    }

    public func appearance() async throws -> JSONValue? {
        await pause()
        try requireSession()
        return lock.withLock { appearanceStore }
    }

    public func putAppearance(_ appearance: JSONValue) async throws -> JSONValue {
        await pause()
        try requireSession()
        lock.withLock { appearanceStore = appearance }
        return appearance
    }
}
