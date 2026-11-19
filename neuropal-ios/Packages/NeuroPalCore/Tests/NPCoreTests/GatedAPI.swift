import Foundation
@testable import NPCore

/// Holds async callers until `open()` (or lets them through once open).
final class AsyncGate: @unchecked Sendable {
    private let lock = NSLock()
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var isOpen = false

    /// Callers waiting right now.
    var waiting: Int { lock.withLock { waiters.count } }

    func pass() async {
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            let through: Bool = lock.withLock {
                if isOpen { return true }
                waiters.append(c)
                return false
            }
            if through { c.resume() }
        }
    }

    func open() {
        let held: [CheckedContinuation<Void, Never>] = lock.withLock {
            isOpen = true
            defer { waiters = [] }
            return waiters
        }
        held.forEach { $0.resume() }
    }
}

/// A server for one address whose account answers can be held at a gate —
/// for sign-in / password-change races. Everything else isn't used here.
final class GatedAPI: NeuroPalAPI, @unchecked Sendable {
    let host: URL
    private let lock = NSLock()
    private var _token: String?
    private var _meTokens: [String?] = []

    /// GET /auth/me: this user, or 401 when nil (or when `meNeedsToken` and no token).
    var meUser: NPUser?
    var meNeedsToken = true
    /// Sign-in number i waits at `loginGates[i]` (through at once past the end).
    var loginGates = [AsyncGate()]
    var loginGate: AsyncGate { loginGates[0] }
    let registerGate = AsyncGate()
    let passwordGate = AsyncGate()
    /// Sign-in number i answers with "tok-login" (i = 0), "tok-login-2", …
    var loginToken = "tok-login"
    var passwordResult: Result<String, APIError> = .success("tok-new")
    private var logins = 0

    init(host: URL, meUser: NPUser? = nil) {
        self.host = host
        self.meUser = meUser
    }

    var token: String? {
        get { lock.withLock { _token } }
        set { lock.withLock { _token = newValue } }
    }

    /// The token each /auth/me call carried.
    var meTokens: [String?] { lock.withLock { _meTokens } }

    func authConfig() async throws -> AuthConfig { AuthConfig(localMode: false, signup: "invite") }

    func login(email: String, password: String) async throws -> AuthResult {
        let i: Int = lock.withLock {
            defer { logins += 1 }
            return logins
        }
        if i < loginGates.count { await loginGates[i].pass() }
        let token = i == 0 ? loginToken : "\(loginToken)-\(i + 1)"
        return AuthResult(token: token, user: NPUser(id: "u-\(host.host ?? "")", email: email))
    }

    func register(email: String, password: String, name: String?, inviteCode: String?) async throws -> AuthResult {
        await registerGate.pass()
        return AuthResult(token: loginToken, user: NPUser(id: "u-\(host.host ?? "")", email: email, name: name))
    }

    func me() async throws -> MeResult {
        let sent = token
        lock.withLock { _meTokens.append(sent) }
        guard let meUser, !(meNeedsToken && sent == nil) else {
            throw APIError.server(status: 401, message: "Missing token")
        }
        return MeResult(user: meUser)
    }

    func logoutEverywhere() async throws {}

    func changePassword(current: String, new: String) async throws -> String {
        await passwordGate.pass()
        return try passwordResult.get()
    }

    func appearance() async throws -> JSONValue? { nil }
    func putAppearance(_ appearance: JSONValue) async throws -> JSONValue { appearance }
    func documents(query: String?) async throws -> [NPDocument] { [] }
    func document(id: String) async throws -> NPDocument { throw APIError.notFound }
    func upload(fileURL: URL, title: String?) async throws -> NPDocument { throw APIError.notFound }
    func renameDocument(id: String, title: String, subtitle: String?) async throws -> NPDocument { throw APIError.notFound }
    func deleteDocument(id: String) async throws {}
    func documentText(id: String) async throws -> DocumentText { throw APIError.notFound }
    func readingProgress(id: String) async throws -> ReadingProgress { ReadingProgress() }
    func saveReadingProgress(id: String, _ update: ReadingProgressUpdate) async throws {}
    func ask(documentID: String, question: String, threadID: String?) async throws -> QueryAnswer { throw APIError.notFound }
    func chat(documentID: String, threadID: String?) async throws -> [ChatMessage] { [] }
    func ticket(documentID: String) async throws -> DocTicket { DocTicket(ticket: nil) }
    func epubManifest(documentID: String) async throws -> EpubManifest { throw APIError.notFound }
    func pageImageURL(documentID: String, page: Int, ticket: String?) -> URL { host }
    func epubBaseURL(documentID: String, ticket: String?) -> URL { host }
    func palBreakdown(task: String) async throws -> PalBreakdown { throw APIError.notFound }
    func palChat(message: String, context: PalChatContext?) async throws -> PalChatReply { throw APIError.notFound }
    func clearPalChat() async throws {}
}
