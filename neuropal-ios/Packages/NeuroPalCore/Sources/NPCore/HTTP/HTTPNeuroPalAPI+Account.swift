import Foundation

// Account: /api/auth/*, /api/me/appearance (docs/BRAIN.md §4).
// SKELETON — owned by the Core agent; every method still throws.
extension HTTPNeuroPalAPI {
    public func authConfig() async throws -> AuthConfig { throw APIError.server(status: 501, message: "not built yet") }

    public func login(email: String, password: String) async throws -> AuthResult {
        throw APIError.server(status: 501, message: "not built yet")
    }

    public func register(email: String, password: String, name: String?, inviteCode: String?) async throws -> AuthResult {
        throw APIError.server(status: 501, message: "not built yet")
    }

    public func me() async throws -> MeResult { throw APIError.server(status: 501, message: "not built yet") }

    public func logoutEverywhere() async throws { throw APIError.server(status: 501, message: "not built yet") }

    public func changePassword(current: String, new: String) async throws -> String {
        throw APIError.server(status: 501, message: "not built yet")
    }

    public func appearance() async throws -> JSONValue? { throw APIError.server(status: 501, message: "not built yet") }

    public func putAppearance(_ appearance: JSONValue) async throws -> JSONValue {
        throw APIError.server(status: 501, message: "not built yet")
    }
}
