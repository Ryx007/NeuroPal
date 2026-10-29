import Foundation

// Account: /api/auth/*, /api/me/appearance (docs/BRAIN.md §4,
// neuropal-backend/src/routes/auth.js and me.js).
extension HTTPNeuroPalAPI {
    /// GET /api/auth/config (public) — what the sign-in screen offers.
    public func authConfig() async throws -> AuthConfig {
        try await json("GET", "/auth/config", authorized: false, timeout: Timeout.probe)
    }

    /// POST /api/auth/login — never sends the current token, and a 401 here
    /// is a wrong password, not the end of a session.
    public func login(email: String, password: String) async throws -> AuthResult {
        try await json("POST", "/auth/login", body: LoginBody(email: email, password: password),
                       authorized: false, sessionCheck: false)
    }

    /// POST /api/auth/register → 201 `{token, user}`; 403 wrong invite, 409 taken.
    public func register(email: String, password: String, name: String?, inviteCode: String?) async throws -> AuthResult {
        let body = RegisterBody(email: email, password: password, name: name.nonEmpty, inviteCode: inviteCode.nonEmpty)
        return try await json("POST", "/auth/register", body: body, authorized: false, sessionCheck: false)
    }

    /// GET /api/auth/me — the boot probe. The reply is the public user, plus
    /// `token` when the server swaps a day-old session for a fresh one.
    public func me() async throws -> MeResult {
        let data = try await checked(try request("GET", "/auth/me", timeout: Timeout.probe))
        let user = try decode(NPUser.self, data)
        let refresh = (try? JSONDecoder.neuropal.decode(TokenEnvelope.self, from: data))?.token
        return MeResult(user: user, refreshedToken: refresh.nonEmpty)
    }

    /// POST /api/auth/logout-all — ends every session of the account.
    public func logoutEverywhere() async throws {
        try await send("POST", "/auth/logout-all", body: EmptyBody())
    }

    /// POST /api/auth/password → `{token}`; every other session ends. A 401
    /// here means "the current password is not right" — the session stays.
    public func changePassword(current: String, new: String) async throws -> String {
        let reply: TokenEnvelope = try await json(
            "POST", "/auth/password", body: PasswordBody(currentPassword: current, newPassword: new), sessionCheck: false)
        guard let token = reply.token.nonEmpty else { throw APIError.decoding("TokenEnvelope") }
        return token
    }

    /// GET /api/me/appearance → `{appearance}`; nil when never saved.
    public func appearance() async throws -> JSONValue? {
        let reply: AppearanceEnvelope = try await json("GET", "/me/appearance")
        return reply.appearance
    }

    /// PUT /api/me/appearance → the normalised copy as stored. A 409 hands
    /// back the server's newer copy as `APIError.staleAppearance(stored)`.
    public func putAppearance(_ appearance: JSONValue) async throws -> JSONValue {
        let r = try request("PUT", "/me/appearance", json: AppearanceEnvelope(appearance: appearance))
        let sentAuthorization = r.value(forHTTPHeaderField: "Authorization")
        let (data, http) = try await raw(r)
        if http.statusCode == 409 {
            let stored = (try? JSONDecoder.neuropal.decode(AppearanceEnvelope.self, from: data))?.appearance
            throw APIError.staleAppearance(stored ?? .null)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw mapError(status: http.statusCode, data: data, headers: http, sentAuthorization: sentAuthorization)
        }
        guard let stored = try decode(AppearanceEnvelope.self, data).appearance else {
            throw APIError.decoding("AppearanceEnvelope")
        }
        return stored
    }
}

// MARK: - Wire shapes

struct LoginBody: Encodable {
    let email: String
    let password: String
}

struct RegisterBody: Encodable {
    let email: String
    let password: String
    let name: String?
    let inviteCode: String?
}

struct PasswordBody: Encodable {
    let currentPassword: String
    let newPassword: String
}

struct EmptyBody: Encodable {}

struct TokenEnvelope: Decodable {
    let token: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        token = try? c.decodeIfPresent(String.self, forKey: .token)
    }

    enum CodingKeys: String, CodingKey { case token }
}

struct AppearanceEnvelope: Codable {
    let appearance: JSONValue?

    init(appearance: JSONValue?) { self.appearance = appearance }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let value = try c.decodeIfPresent(JSONValue.self, forKey: .appearance)
        appearance = (value?.isNull ?? true) ? nil : value
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(appearance ?? .null, forKey: .appearance)
    }

    enum CodingKeys: String, CodingKey { case appearance }
}

extension Optional where Wrapped == String {
    /// nil for nil, empty or whitespace-only strings; otherwise the trimmed value.
    var nonEmpty: String? {
        guard let s = self?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        return s
    }
}
