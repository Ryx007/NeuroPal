import Foundation
@testable import NPCore

/// A fake NeuroPal server behind URLProtocol. Each StubServer gets its own
/// made-up host, so tests running in parallel never share a handler.
final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    struct Reply: Sendable {
        var status: Int = 200
        var body: Data = Data()
        var headers: [String: String] = ["Content-Type": "application/json; charset=utf-8"]
        /// Fail at the transport level instead of answering.
        var error: URLError?
        /// Answer 302 to this address (the request goes along, headers and all).
        var redirect: URL?

        static func json(_ status: Int, _ text: String, headers: [String: String] = [:]) -> Reply {
            var r = Reply(status: status, body: Data(text.utf8))
            r.headers.merge(headers) { _, new in new }
            return r
        }

        static func fail(_ code: URLError.Code) -> Reply { Reply(error: URLError(code)) }

        static func redirect(to url: URL) -> Reply { Reply(status: 302, redirect: url) }
    }

    struct Recorded: Sendable {
        let method: String
        let url: URL
        let headers: [String: String]
        let body: Data?

        func header(_ name: String) -> String? {
            headers.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value
        }

        var path: String { URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath ?? "" }
        var query: String? { URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedQuery }

        func json() -> [String: Any]? {
            body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        }
    }

    typealias Handler = @Sendable (Recorded) -> Reply

    private final class Registry: @unchecked Sendable {
        let lock = NSLock()
        var handlers: [String: Handler] = [:]
        var log: [String: [Recorded]] = [:]
    }

    private static let registry = Registry()

    static func register(host: String, handler: @escaping Handler) {
        registry.lock.withLock {
            registry.handlers[host] = handler
            registry.log[host] = []
        }
    }

    static func requests(host: String) -> [Recorded] {
        registry.lock.withLock { registry.log[host] ?? [] }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let host = request.url?.host ?? ""
        let body = request.httpBody ?? request.httpBodyStream.map(Self.readAll)
        let recorded = Recorded(method: request.httpMethod ?? "GET", url: request.url!,
                                headers: request.allHTTPHeaderFields ?? [:], body: body)
        let handler = Self.registry.lock.withLock { () -> Handler? in
            Self.registry.log[host, default: []].append(recorded)
            return Self.registry.handlers[host]
        }
        let reply = handler?(recorded) ?? .fail(.cannotConnectToHost)
        if let error = reply.error {
            client?.urlProtocol(self, didFailWithError: error)
            return
        }
        if let location = reply.redirect {
            let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1",
                                           headerFields: ["Location": location.absoluteString])!
            var next = request
            next.url = location
            client?.urlProtocol(self, wasRedirectedTo: next, redirectResponse: response)
            // Not followed: the 3xx itself is the answer.
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1",
                                       headerFields: reply.headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: reply.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func readAll(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 64 * 1024)
        while stream.hasBytesAvailable {
            let n = stream.read(&buffer, maxLength: buffer.count)
            if n <= 0 { break }
            data.append(buffer, count: n)
        }
        return data
    }
}

struct StubServer {
    let host: URL
    let session: URLSession

    init(path: String = "", handler: @escaping StubURLProtocol.Handler) {
        let name = "s\(UUID().uuidString.prefix(12).lowercased()).test"
        host = URL(string: "https://\(name)\(path)")!
        StubURLProtocol.register(host: name, handler: handler)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        session = URLSession(configuration: config)
    }

    /// Answers every request with the same reply.
    init(always reply: StubURLProtocol.Reply) {
        self.init { _ in reply }
    }

    func api(token: String? = nil) -> HTTPNeuroPalAPI {
        HTTPNeuroPalAPI(host: host, token: token, urlSession: session)
    }

    var requests: [StubURLProtocol.Recorded] { StubURLProtocol.requests(host: host.host!) }
    var last: StubURLProtocol.Recorded? { requests.last }
}

/// Real-shaped replies, copied from neuropal-backend/src/routes.
enum Wire {
    static let user = #"""
    {"id":"64f0c0ffee00000000000aa1","email":"ryx@example.com","name":"Ryx","timezone":"Europe/Rome","locale":"en",
     "tweaks":{"font":"Inter","theme":"dark"},"appearance":null,"profile":{"conditions":["adhd"]}}
    """#

    static func auth(token: String = "tok-1") -> String { #"{"token":"\#(token)","user":\#(user)}"# }

    static func me(refreshedToken: String? = nil) -> String {
        guard let refreshedToken else { return user }
        return #"""
        {"id":"64f0c0ffee00000000000aa1","email":"ryx@example.com","name":"Ryx","timezone":"Europe/Rome","locale":"en",
         "tweaks":{},"appearance":null,"profile":{},"token":"\#(refreshedToken)"}
        """#
    }

    static let document = #"""
    {"_id":"64f0c0ffee00000000000001","userId":"64f0c0ffee00000000000aa1","title":"Correlation plenoptic imaging",
     "subtitle":"D'Angelo et al.","type":"pdf","file":{"relativePath":"documents/x/1-a.pdf","sizeBytes":1234,"mimeType":"application/pdf"},
     "status":"ready","progress":1,"pageCount":12,"wordCount":5400,"toc":[],"pageMap":[],"ingestStartedAt":"2026-10-29T01:00:00.000Z",
     "ingestFinishedAt":"2026-10-29T01:02:00.000Z","createdAt":"2026-10-29T01:00:00.000Z","updatedAt":"2026-10-29T01:02:00.000Z",
     "__v":0,"readingProgress":0.4,"lastReadAt":"2026-10-29T08:00:00.000Z"}
    """#
}
