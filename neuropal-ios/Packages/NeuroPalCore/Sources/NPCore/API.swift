import Foundation

/// Everything the app asks the NeuroPal server. Two implementations:
/// `HTTPNeuroPalAPI` (the real server) and `MockNeuroPalAPI` (offline
/// fixtures — previews, screenshots, the -NPMock launch argument).
///
/// The methods are grouped by domain; each domain's HTTP and mock code lives
/// in its own extension file (HTTP/HTTPNeuroPalAPI+<Domain>.swift,
/// Mock/MockNeuroPalAPI+<Domain>.swift), owned by the feature that uses it.
public protocol NeuroPalAPI: AnyObject, Sendable {
    /// The server origin, e.g. https://api.ryx007.work (no trailing slash, no /api).
    var host: URL { get }
    /// The session token sent as `Authorization: Bearer …` (nil = signed out
    /// or a local-mode server). Set by AppSession.
    var token: String? { get set }

    // MARK: Account (HTTP/HTTPNeuroPalAPI+Account.swift)
    func authConfig() async throws -> AuthConfig
    func login(email: String, password: String) async throws -> AuthResult
    func register(email: String, password: String, name: String?, inviteCode: String?) async throws -> AuthResult
    func me() async throws -> MeResult
    func logoutEverywhere() async throws
    /// Returns the new session token (every other session ends).
    func changePassword(current: String, new: String) async throws -> String
    /// nil = never saved on the server.
    func appearance() async throws -> JSONValue?
    /// Throws `APIError.staleAppearance(stored)` when the server holds a newer copy.
    func putAppearance(_ appearance: JSONValue) async throws -> JSONValue

    // MARK: Documents (HTTP/HTTPNeuroPalAPI+Documents.swift)
    func documents(query: String?) async throws -> [NPDocument]
    func document(id: String) async throws -> NPDocument
    func upload(fileURL: URL, title: String?) async throws -> NPDocument
    func renameDocument(id: String, title: String, subtitle: String?) async throws -> NPDocument
    func deleteDocument(id: String) async throws
    func documentText(id: String) async throws -> DocumentText
    func readingProgress(id: String) async throws -> ReadingProgress
    func saveReadingProgress(id: String, _ update: ReadingProgressUpdate) async throws
    func ask(documentID: String, question: String, threadID: String?) async throws -> QueryAnswer
    func chat(documentID: String, threadID: String?) async throws -> [ChatMessage]
    func ticket(documentID: String) async throws -> DocTicket
    func epubManifest(documentID: String) async throws -> EpubManifest
    /// A rendered page image (JPEG) of a pdf/arxiv document; `ticket` when
    /// the load can't send the session header.
    func pageImageURL(documentID: String, page: Int, ticket: String?) -> URL
    /// Base URL for the files of an EPUB (chapter XHTML, css, images); the
    /// ticket sits in the path so every relative href inherits it.
    func epubBaseURL(documentID: String, ticket: String?) -> URL
    /// The original PDF of a pdf/arxiv document (GET /api/documents/:id/file),
    /// downloaded with the session to a temporary file the caller owns —
    /// for PDFKit. 400 for other types.
    func downloadOriginalFile(documentID: String) async throws -> URL
    /// The original PDF's address, for loads that can't send the session
    /// header (`ticket` from `ticket(documentID:)`).
    func originalFileURL(documentID: String, ticket: String?) -> URL

    // MARK: Pal (HTTP/HTTPNeuroPalAPI+Pal.swift)
    func palBreakdown(task: String) async throws -> PalBreakdown
    func palChat(message: String, context: PalChatContext?) async throws -> PalChatReply
    func clearPalChat() async throws
}

public extension NeuroPalAPI {
    /// Default (the fixtures have no PDF files): not found.
    func downloadOriginalFile(documentID: String) async throws -> URL { throw APIError.notFound }

    func originalFileURL(documentID: String, ticket: String?) -> URL {
        var c = URLComponents(url: host, resolvingAgainstBaseURL: false)!
        c.path = "/api/documents/\(documentID)/file"
        if let ticket { c.queryItems = [URLQueryItem(name: "t", value: ticket)] }
        return c.url ?? host
    }
}

public enum APIError: Error, Equatable, Sendable, LocalizedError {
    /// No network / server unreachable / timed out.
    case offline
    /// 401 on a request that carried this session's token: the session is over.
    case unauthorized
    /// 403 (wrong invite, forbidden).
    case forbidden(String)
    case notFound
    /// 409 on PUT /api/me/appearance: the server's copy is newer — adopt it.
    case staleAppearance(JSONValue)
    /// 429 — wait `retryAfter` seconds.
    case rateLimited(retryAfter: Int?)
    /// Any other non-2xx: status code + the server's `{error}` message.
    case server(status: Int, message: String)
    /// A 2xx whose body didn't decode.
    case decoding(String)

    public var errorDescription: String? {
        switch self {
        case .offline: return "Can't reach the server right now."
        case .unauthorized: return "Your session has ended. Sign in again."
        case .forbidden(let m): return m.isEmpty ? "That isn't allowed." : m
        case .notFound: return "Not found."
        case .staleAppearance: return "Your look changed on another device."
        case .rateLimited(let s): return s.map { "Too many tries — wait \($0) s." } ?? "Too many tries — wait a moment."
        case .server(_, let m): return m.isEmpty ? "Something went wrong on the server." : m
        case .decoding: return "The server sent something unexpected."
        }
    }
}

public extension JSONDecoder {
    /// Dates as the server sends them: ISO-8601, with or without fractional seconds.
    static var neuropal: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            if let date = NPDateFormat.parse(s) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "bad date \(s)")
        }
        return d
    }
}

public extension JSONEncoder {
    static var neuropal: JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(NPDateFormat.string(date))
        }
        return e
    }
}

public enum NPDateFormat {
    public static func parse(_ s: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFraction.date(from: s) { return d }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: s)
    }

    public static func string(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}
