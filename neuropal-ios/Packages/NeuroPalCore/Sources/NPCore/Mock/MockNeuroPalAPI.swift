import Foundation

/// Offline fixtures that behave like the server: previews, screenshots and
/// the `-NPMock` launch argument. Mutations (upload, rename, delete, chat)
/// stay in memory for the life of the process. `latency` simulates a
/// network so loading states show; 0 in tests.
public final class MockNeuroPalAPI: NeuroPalAPI, @unchecked Sendable {
    public let host: URL
    public var latency: Duration
    let lock = NSLock()
    private var _token: String?
    private var _offline = false

    // Domain state, guarded by `lock` (see the +Domain files).
    var documentsStore: [NPDocument]
    var chatStore: [String: [ChatMessage]] = [:]
    var palChatStore: [ChatMessage] = []
    var appearanceStore: JSONValue?

    public var token: String? {
        get { lock.withLock { _token } }
        set { lock.withLock { _token = newValue } }
    }

    /// The account calls behave as if the server can't be reached (the
    /// `-NPOffline` launch argument: the app opens offline, banner and all).
    public var offline: Bool {
        get { lock.withLock { _offline } }
        set { lock.withLock { _offline = newValue } }
    }

    public init(host: URL = URL(string: "https://mock.neuropal.invalid")!, token: String? = "mock-token",
                latency: Duration = .milliseconds(350)) {
        self.host = host
        self._token = token
        self.latency = latency
        self.documentsStore = MockFixtures.documents
    }

    func pause() async {
        if latency > .zero { try? await Task.sleep(for: latency) }
    }

    func requireSession() throws {
        if token == nil { throw APIError.unauthorized }
    }

    func requireNetwork() throws {
        if offline { throw APIError.offline }
    }
}

/// Fixture data shared by the mock and SwiftUI previews.
public enum MockFixtures {
    public static let user = NPUser(id: "000000000000000000000001", email: "ryx@example.com", name: "Ryx")
}
