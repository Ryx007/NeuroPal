import Foundation

/// The real server. Core request machinery lives here; each domain's
/// endpoints are in HTTPNeuroPalAPI+<Domain>.swift.
///
/// 401 rule (same as the Expo app's `isCurrentSession401`): a 401 only ends
/// the session when the request carried the token that is STILL current —
/// a wrong password on sign-in, or a late reply to a request sent with an
/// older token, never signs anyone out. Requests whose 401 means "wrong
/// password" (sign-in, password change) opt out with `sessionCheck: false`,
/// as the Expo app exempts its `auth/` calls. With no token at all, a 401 on
/// a data call (not /auth/…) means the server now wants an account.
///
/// Replies are read into memory up to `maxReplyBytes` (anything bigger is
/// refused), and a redirect to another server is never followed, so the
/// session token only ever goes to the address it was made for.
public final class HTTPNeuroPalAPI: NeuroPalAPI, @unchecked Sendable {
    public let host: URL
    let urlSession: URLSession
    private let lock = NSLock()
    private var _token: String?
    private var _onUnauthorized: (@Sendable (_ rejectedToken: String) -> Void)?
    private var _onUnauthorizedWithoutToken: (@Sendable () -> Void)?

    /// The biggest reply read into memory (JSON). Bigger ones are refused.
    var maxReplyBytes = 64 << 20

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

    /// Called (on any thread) when a data call sent without a token gets a
    /// 401 while there is still no token: the server wants an account now (a
    /// single-user server that turned accounts on, or a first launch that
    /// opened offline).
    public var onUnauthorizedWithoutToken: (@Sendable () -> Void)? {
        get { lock.withLock { _onUnauthorizedWithoutToken } }
        set { lock.withLock { _onUnauthorizedWithoutToken = newValue } }
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
    /// variable part must already be a `segment(_:)`. Never traps: the
    /// server's own path is kept percent-encoded as it was saved, and any
    /// character that isn't valid in a path is escaped.
    func url(_ path: String, query: [URLQueryItem] = []) -> URL {
        var c = URLComponents(url: host, resolvingAgainstBaseURL: false) ?? URLComponents()
        var base = c.percentEncodedPath
        while base.hasSuffix("/") { base.removeLast() }
        c.percentEncodedPath = Self.pathEncoded(base + "/api" + path)
        c.fragment = nil
        // Encoded by hand: URLComponents leaves "+" (a space to the server)
        // and other reserved characters alone.
        c.percentEncodedQuery = query.isEmpty ? nil : query
            .map { "\(Self.queryPart($0.name))=\(Self.queryPart($0.value ?? ""))" }
            .joined(separator: "&")
        return c.url ?? host
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

    /// Bytes a path may hold as they are (RFC 3986 pchar and "/").
    private static let pathBytes: Set<UInt8> = Set(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~!$&'()*+,;=:@/".utf8)

    /// `s` as a valid percent-encoded path: existing %XX escapes stay, every
    /// other byte outside the path characters is escaped (so the
    /// `percentEncodedPath` setter can never raise).
    static func pathEncoded(_ s: String) -> String {
        let bytes = Array(s.utf8)
        var out = ""
        out.reserveCapacity(bytes.count)
        var i = 0
        while i < bytes.count {
            let b = bytes[i]
            if b == UInt8(ascii: "%"), i + 2 < bytes.count, isHex(bytes[i + 1]), isHex(bytes[i + 2]) {
                out.unicodeScalars.append(contentsOf: bytes[i...(i + 2)].map { Unicode.Scalar($0) })
                i += 3
                continue
            }
            if pathBytes.contains(b) {
                out.unicodeScalars.append(Unicode.Scalar(b))
            } else {
                out += String(format: "%%%02X", b)
            }
            i += 1
        }
        return out
    }

    private static func isHex(_ b: UInt8) -> Bool {
        (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66)
    }

    func request(_ method: String, _ path: String, query: [URLQueryItem] = [], json body: (any Encodable)? = nil,
                 authorized: Bool = true, timeout: TimeInterval = Timeout.standard) throws -> URLRequest {
        var r = URLRequest(url: url(path, query: query))
        r.httpMethod = method
        r.timeoutInterval = timeout
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if authorized, let t = token, mayCarryToken(r.url) {
            r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONEncoder.neuropal.encode(AnyEncodable(body))
        }
        return r
    }

    /// The token only goes to this server's own address, and over plain
    /// http only to an address on the local network.
    func mayCarryToken(_ url: URL?) -> Bool {
        guard let url, AppSession.origin(url) == AppSession.origin(host) else { return false }
        return !ServerAddress.isUnencrypted(url) || ServerAddress.isLocalNetwork(host: url.host ?? "")
    }

    /// True for /api/auth/… (sign-in, the session check): their 401s are
    /// answers about a password or a token, not the end of a data call.
    func isAuthCall(_ url: URL?) -> Bool {
        guard let url, let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath else {
            return false
        }
        var base = URLComponents(url: host, resolvingAgainstBaseURL: false)?.percentEncodedPath ?? ""
        while base.hasSuffix("/") { base.removeLast() }
        return path.hasPrefix(base + "/api/auth/")
    }

    // MARK: Sending

    /// Sends and returns the raw reply; throws only for transport failures
    /// (and a reply over `maxReplyBytes`).
    func raw(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        try await transport { try await self.collect { $0.dataTask(with: request) } }
    }

    /// Streams the body from a file on disk (uploads).
    func raw(_ request: URLRequest, bodyFile: URL) async throws -> (Data, HTTPURLResponse) {
        try await transport { try await self.collect { $0.uploadTask(with: request, fromFile: bodyFile) } }
    }

    /// Streams the reply to a file on disk (big downloads). The file is
    /// moved out of the system's temporary spot at once, so it outlives this
    /// call; the caller deletes it.
    func rawDownload(_ request: URLRequest) async throws -> (URL, HTTPURLResponse) {
        do {
            let guardRedirects = ReplyCollector(limit: maxReplyBytes, origin: AppSession.origin(host))
            let (location, response) = try await urlSession.download(for: request, delegate: guardRedirects)
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

    /// Runs one data (or upload) task, collecting its reply through a
    /// `ReplyCollector`; cancelling the calling task cancels the request.
    private func collect(_ make: (URLSession) -> URLSessionDataTask) async throws -> (Data, URLResponse) {
        let collector = ReplyCollector(limit: maxReplyBytes, origin: AppSession.origin(host))
        let task = make(urlSession)
        task.delegate = collector
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                collector.start(task, continuation)
            }
        } onCancel: {
            collector.cancel()
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
                       sessionCheck: sessionCheck, url: request.url)
    }

    func mapError(status: Int, data: Data, headers: HTTPURLResponse, sentAuthorization: String?,
                  sessionCheck: Bool = true, url: URL? = nil) -> APIError {
        let message = (try? JSONDecoder().decode(ErrorEnvelope.self, from: data))?.error ?? ""
        switch status {
        case 401:
            // Only the token that is current NOW, and only on a request that
            // carried it: a reply to an older token (or to none) is stale.
            if sessionCheck, let sentAuthorization, let current = token, sentAuthorization == "Bearer \(current)" {
                onUnauthorized?(current)
                return .unauthorized
            }
            // No token sent and still none held: a data call the server
            // refuses without an account (the Expo app's `!current` case).
            if sessionCheck, sentAuthorization == nil, token == nil, let url, !isAuthCall(url) {
                onUnauthorizedWithoutToken?()
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

/// Collects one reply in memory for a data or upload task (its per-task
/// delegate): refuses a reply bigger than `limit` (announced or as it
/// streams), and stops at a redirect to another server — the 3xx becomes
/// the answer, so the session token never follows it. Also used as the
/// redirect guard of downloads.
final class ReplyCollector: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private let limit: Int
    private let origin: String
    private var data = Data()
    private var response: URLResponse?
    private var continuation: CheckedContinuation<(Data, URLResponse), Error>?
    private var task: URLSessionTask?
    private var cancelled = false
    private var tooLarge = false

    init(limit: Int, origin: String) {
        self.limit = limit
        self.origin = origin
    }

    func start(_ task: URLSessionTask, _ continuation: CheckedContinuation<(Data, URLResponse), Error>) {
        let go: Bool = lock.withLock {
            guard !cancelled else { return false }
            self.task = task
            self.continuation = continuation
            return true
        }
        if go {
            task.resume()
        } else {
            // Cancelled before it started: end the task too (it never sends).
            task.cancel()
            continuation.resume(throwing: CancellationError())
        }
    }

    func cancel() {
        let running: URLSessionTask? = lock.withLock {
            cancelled = true
            return task
        }
        running?.cancel()
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping @Sendable (URLSession.ResponseDisposition) -> Void) {
        let announced = response.expectedContentLength
        let refuse = announced > Int64(limit)
        lock.withLock {
            self.response = response
            if refuse {
                tooLarge = true
            } else if announced > 0 {
                data.reserveCapacity(Int(announced))
            }
        }
        completionHandler(refuse ? .cancel : .allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
        let over: Bool = lock.withLock {
            if data.count + chunk.count > limit {
                tooLarge = true
                return true
            }
            data.append(chunk)
            return false
        }
        if over { dataTask.cancel() }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(Self.follows(request.url, from: origin) ? request : nil)
    }

    /// A redirect is followed only within the same server (origin).
    static func follows(_ url: URL?, from origin: String) -> Bool {
        guard let url else { return false }
        return AppSession.origin(url) == origin
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let (waiting, result): (CheckedContinuation<(Data, URLResponse), Error>?, Result<(Data, URLResponse), Error>) =
            lock.withLock {
                let waiting = continuation
                continuation = nil
                self.task = nil
                if tooLarge { return (waiting, .failure(APIError.decoding("a reply too large to read"))) }
                if let error { return (waiting, .failure(error)) }
                guard let response else { return (waiting, .failure(URLError(.badServerResponse))) }
                return (waiting, .success((data, response)))
            }
        waiting?.resume(with: result)
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
