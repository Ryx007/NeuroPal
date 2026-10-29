import Foundation

/// The real server. Core request machinery lives here; each domain's
/// endpoints are in HTTPNeuroPalAPI+<Domain>.swift.
///
/// 401 rule (same as the Expo app's `isCurrentSession401`): a 401 only ends
/// the session when the request carried the token that is STILL current —
/// a wrong password on sign-in, or a late reply to a request sent with an
/// older token, never signs anyone out. Requests whose 401 means "wrong
/// password" (sign-in, password change) opt out with `sessionCheck: false`,
/// as the Expo app exempts its `auth/` calls.
public final class HTTPNeuroPalAPI: NeuroPalAPI, @unchecked Sendable {
    public let host: URL
    let urlSession: URLSession
    private let lock = NSLock()
    private var _token: String?
    private var _onUnauthorized: (@Sendable (_ rejectedToken: String) -> Void)?

    public var token: String? {
        get { lock.withLock { _token } }
        set { lock.withLock { _token = newValue } }
    }

    /// Called (on any thread) with the rejected token when the current
    /// session's token gets a 401.
    public var onUnauthorized: (@Sendable (_ rejectedToken: String) -> Void)? {
        get { lock.withLock { _onUnauthorized } }
        set { lock.withLock { _onUnauthorized = newValue } }
    }

    public init(host: URL, token: String? = nil, urlSession: URLSession = HTTPNeuroPalAPI.defaultSession) {
        self.host = host
        self._token = token
        self.urlSession = urlSession
    }

    /// No cookies and no response cache on disk: replies carry the user's
    /// documents and chats, and a session lives only in the Keychain.
    public static let defaultSession: URLSession = {
        let c = URLSessionConfiguration.default
        c.urlCache = nil
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.httpCookieStorage = nil
        c.httpShouldSetCookies = false
        c.httpCookieAcceptPolicy = .never
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()

    /// Seconds before a request gives up. Model calls can take minutes (a
    /// local model on the server), so they get the Expo app's 5-minute ceiling.
    enum Timeout {
        static let standard: TimeInterval = 30
        /// The boot probe: the splash waits on it.
        static let probe: TimeInterval = 10
        static let model: TimeInterval = 300
        static let upload: TimeInterval = 600
    }

    // MARK: Building requests

    /// `path` is relative to /api, e.g. "/documents/abc/text". Every
    /// variable part must already be a `segment(_:)`.
    func url(_ path: String, query: [URLQueryItem] = []) -> URL {
        var c = URLComponents(url: host, resolvingAgainstBaseURL: false)!
        let base = c.path.hasSuffix("/") ? String(c.path.dropLast()) : c.path
        c.percentEncodedPath = base + "/api" + path
        c.fragment = nil
        // Encoded by hand: URLComponents leaves "+" (a space to the server)
        // and other reserved characters alone.
        c.percentEncodedQuery = query.isEmpty ? nil : query
            .map { "\(Self.queryPart($0.name))=\(Self.queryPart($0.value ?? ""))" }
            .joined(separator: "&")
        return c.url!
    }

    /// RFC 3986 unreserved characters stay; everything else is escaped.
    private static let unreserved = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    static func queryPart(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: unreserved) ?? ""
    }

    /// One path segment, percent-encoded (ids, EPUB file paths are split on "/").
    static func segment(_ s: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#;%")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    func request(_ method: String, _ path: String, query: [URLQueryItem] = [], json body: (any Encodable)? = nil,
                 authorized: Bool = true, timeout: TimeInterval = Timeout.standard) throws -> URLRequest {
        var r = URLRequest(url: url(path, query: query))
        r.httpMethod = method
        r.timeoutInterval = timeout
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if authorized, let t = token { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let body {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONEncoder.neuropal.encode(AnyEncodable(body))
        }
        return r
    }

    // MARK: Sending

    /// Sends and returns the raw reply; throws only for transport failures.
    func raw(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        try await transport { try await self.urlSession.data(for: request) }
    }

    /// Streams the body from a file on disk (uploads).
    func raw(_ request: URLRequest, bodyFile: URL) async throws -> (Data, HTTPURLResponse) {
        try await transport { try await self.urlSession.upload(for: request, fromFile: bodyFile) }
    }

    /// Streams the reply to a file on disk (big downloads). The file is
    /// moved out of the system's temporary spot at once, so it outlives this
    /// call; the caller deletes it.
    func rawDownload(_ request: URLRequest) async throws -> (URL, HTTPURLResponse) {
        do {
            let (location, response) = try await urlSession.download(for: request)
            let kept = FileManager.default.temporaryDirectory.appending(path: "np-download-\(UUID().uuidString)")
            try FileManager.default.moveItem(at: location, to: kept)
            guard let http = response as? HTTPURLResponse else {
                try? FileManager.default.removeItem(at: kept)
                throw APIError.offline
            }
            return (kept, http)
        } catch let e as URLError {
            if e.code == .cancelled { throw CancellationError() }
            throw APIError.offline
        } catch is CancellationError {
            throw CancellationError()
        } catch let e as APIError {
            throw e
        } catch {
            throw APIError.offline
        }
    }

    private func transport(_ send: () async throws -> (Data, URLResponse)) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await send()
            guard let http = response as? HTTPURLResponse else { throw APIError.offline }
            return (data, http)
        } catch let e as URLError {
            if e.code == .cancelled { throw CancellationError() }
            throw APIError.offline
        } catch is CancellationError {
            throw CancellationError()
        } catch let e as APIError {
            throw e
        } catch {
            // Any other transport failure (a file that vanished mid-upload, a
            // stream error) is "didn't get an answer".
            throw APIError.offline
        }
    }

    /// Sends; maps every non-2xx to an APIError.
    @discardableResult
    func checked(_ request: URLRequest, bodyFile: URL? = nil, sessionCheck: Bool = true) async throws -> Data {
        let sentAuthorization = request.value(forHTTPHeaderField: "Authorization")
        let data: Data
        let http: HTTPURLResponse
        if let bodyFile {
            (data, http) = try await raw(request, bodyFile: bodyFile)
        } else {
            (data, http) = try await raw(request)
        }
        if (200..<300).contains(http.statusCode) { return data }
        throw mapError(status: http.statusCode, data: data, headers: http, sentAuthorization: sentAuthorization,
                       sessionCheck: sessionCheck)
    }

    func mapError(status: Int, data: Data, headers: HTTPURLResponse, sentAuthorization: String?,
                  sessionCheck: Bool = true) -> APIError {
        let message = (try? JSONDecoder().decode(ErrorEnvelope.self, from: data))?.error ?? ""
        switch status {
        case 401:
            // Only the token that is current NOW, and only on a request that
            // carried it: a reply to an older token (or to none) is stale.
            if sessionCheck, let sentAuthorization, let current = token, sentAuthorization == "Bearer \(current)" {
                onUnauthorized?(current)
                return .unauthorized
            }
            return .server(status: 401, message: message)
        case 403: return .forbidden(message)
        case 404: return .notFound
        case 413:
            // Our server says "File too large"; an edge in front of it may
            // answer with a page of its own. Either way, say it plainly.
            return .server(status: 413, message: "That file is too large for this server.")
        case 429:
            let header = headers.value(forHTTPHeaderField: "Retry-After")
                .flatMap { Int($0.trimmingCharacters(in: .whitespaces)) }
            let body = (try? JSONDecoder().decode(RetryEnvelope.self, from: data))?.retryAfterSec
            return .rateLimited(retryAfter: (body ?? header).map { max(1, $0) })
        default: return .server(status: status, message: message)
        }
    }

    func decode<T: Decodable>(_ type: T.Type, _ data: Data) throws -> T {
        do {
            return try JSONDecoder.neuropal.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(String(describing: type))
        }
    }

    /// The common case: JSON in, JSON out.
    func json<T: Decodable>(_ method: String, _ path: String, query: [URLQueryItem] = [],
                            body: (any Encodable)? = nil, as type: T.Type = T.self, authorized: Bool = true,
                            sessionCheck: Bool = true, timeout: TimeInterval = Timeout.standard) async throws -> T {
        let r = try request(method, path, query: query, json: body, authorized: authorized, timeout: timeout)
        let data = try await checked(r, sessionCheck: sessionCheck)
        return try decode(T.self, data)
    }

    /// JSON in, reply ignored.
    func send(_ method: String, _ path: String, body: (any Encodable)? = nil, sessionCheck: Bool = true,
              timeout: TimeInterval = Timeout.standard) async throws {
        try await checked(try request(method, path, json: body, timeout: timeout), sessionCheck: sessionCheck)
    }
}

struct ErrorEnvelope: Decodable {
    let error: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        error = try? c.decodeIfPresent(String.self, forKey: .error)
    }

    enum CodingKeys: String, CodingKey { case error }
}

struct RetryEnvelope: Decodable {
    let retryAfterSec: Int?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let i = try? c.decodeIfPresent(Int.self, forKey: .retryAfterSec) {
            retryAfterSec = i
        } else if let d = try? c.decodeIfPresent(Double.self, forKey: .retryAfterSec), d.isFinite {
            retryAfterSec = Int(d.rounded(.up))
        } else {
            retryAfterSec = nil
        }
    }

    enum CodingKeys: String, CodingKey { case retryAfterSec }
}

/// Type-erases an Encodable so request bodies can be any Encodable value.
struct AnyEncodable: Encodable {
    let value: any Encodable
    init(_ value: any Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
