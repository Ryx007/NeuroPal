import Foundation

/// The real server. Core request machinery lives here; each domain's
/// endpoints are in HTTPNeuroPalAPI+<Domain>.swift.
///
/// 401 rule (same as the Expo app's `isCurrentSession401`): a 401 only ends
/// the session when the request carried the token that is STILL current —
/// a wrong password on sign-in, or a late reply to a request sent with an
/// older token, never signs anyone out.
public final class HTTPNeuroPalAPI: NeuroPalAPI, @unchecked Sendable {
    public let host: URL
    let urlSession: URLSession
    private let lock = NSLock()
    private var _token: String?
    private var _onUnauthorized: (@Sendable () -> Void)?

    public var token: String? {
        get { lock.withLock { _token } }
        set { lock.withLock { _token = newValue } }
    }

    /// Called (on any thread) when the current session's token gets a 401.
    public var onUnauthorized: (@Sendable () -> Void)? {
        get { lock.withLock { _onUnauthorized } }
        set { lock.withLock { _onUnauthorized = newValue } }
    }

    public init(host: URL, token: String? = nil, urlSession: URLSession = .shared) {
        self.host = host
        self._token = token
        self.urlSession = urlSession
    }

    // MARK: Building requests

    /// `path` is relative to /api, e.g. "/documents/abc/text".
    func url(_ path: String, query: [URLQueryItem] = []) -> URL {
        var c = URLComponents(url: host, resolvingAgainstBaseURL: false)!
        let base = c.path.hasSuffix("/") ? String(c.path.dropLast()) : c.path
        c.percentEncodedPath = base + "/api" + path
        if !query.isEmpty { c.queryItems = query }
        return c.url!
    }

    /// One path segment, percent-encoded (ids, EPUB file paths are split on "/").
    static func segment(_ s: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    func request(_ method: String, _ path: String, query: [URLQueryItem] = [], json body: (any Encodable)? = nil,
                 authorized: Bool = true) throws -> URLRequest {
        var r = URLRequest(url: url(path, query: query))
        r.httpMethod = method
        r.timeoutInterval = 30
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
        do {
            let (data, response) = try await urlSession.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.offline }
            return (data, http)
        } catch let e as URLError {
            switch e.code {
            case .cancelled: throw CancellationError()
            default: throw APIError.offline
            }
        }
    }

    /// Sends; maps every non-2xx to an APIError.
    @discardableResult
    func checked(_ request: URLRequest) async throws -> Data {
        let sentToken = request.value(forHTTPHeaderField: "Authorization")
        let (data, http) = try await raw(request)
        if (200..<300).contains(http.statusCode) { return data }
        throw mapError(status: http.statusCode, data: data, headers: http, sentAuthorization: sentToken)
    }

    func mapError(status: Int, data: Data, headers: HTTPURLResponse, sentAuthorization: String?) -> APIError {
        let message = (try? JSONDecoder().decode(ErrorEnvelope.self, from: data))?.error ?? ""
        switch status {
        case 401:
            let current = token.map { "Bearer \($0)" }
            if let sentAuthorization, sentAuthorization == current {
                onUnauthorized?()
                return .unauthorized
            }
            return .server(status: 401, message: message)
        case 403: return .forbidden(message)
        case 404: return .notFound
        case 429:
            let header = headers.value(forHTTPHeaderField: "Retry-After").flatMap { Int($0) }
            let body = (try? JSONDecoder().decode(RetryEnvelope.self, from: data))?.retryAfterSec
            return .rateLimited(retryAfter: body ?? header)
        default: return .server(status: status, message: message)
        }
    }

    func decode<T: Decodable>(_ type: T.Type, _ data: Data) throws -> T {
        do {
            return try JSONDecoder.neuropal.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }

    /// The common case: JSON in, JSON out.
    func json<T: Decodable>(_ method: String, _ path: String, query: [URLQueryItem] = [],
                            body: (any Encodable)? = nil, as type: T.Type = T.self) async throws -> T {
        let data = try await checked(try request(method, path, query: query, json: body))
        return try decode(T.self, data)
    }

    /// JSON in, reply ignored.
    func send(_ method: String, _ path: String, body: (any Encodable)? = nil) async throws {
        try await checked(try request(method, path, json: body))
    }
}

struct ErrorEnvelope: Decodable { let error: String? }
struct RetryEnvelope: Decodable { let retryAfterSec: Int? }

/// Type-erases an Encodable so request bodies can be any Encodable value.
struct AnyEncodable: Encodable {
    let value: any Encodable
    init(_ value: any Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
