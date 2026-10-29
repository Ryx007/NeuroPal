import Foundation
import Testing
@testable import NPCore

// The HTTP client against a URLProtocol stub: what goes out (paths, query,
// headers, bodies) and how every answer maps to a value or an APIError.

@Suite("HTTP requests")
struct RequestBuildingTests {
    @Test func noAuthorizationWithoutAToken() async throws {
        let server = StubServer(always: .json(200, "[]"))
        _ = try await server.api(token: nil).documents(query: nil)
        let r = try #require(server.last)
        #expect(r.method == "GET")
        #expect(r.path == "/api/documents")
        #expect(r.query == nil)
        #expect(r.header("Authorization") == nil)
        #expect(r.header("Accept") == "application/json")
    }

    @Test func bearerTokenWhenSignedIn() async throws {
        let server = StubServer(always: .json(200, "[]"))
        _ = try await server.api(token: "tok-1").documents(query: nil)
        #expect(server.last?.header("Authorization") == "Bearer tok-1")
    }

    @Test func searchQueryIsEncoded() async throws {
        let server = StubServer(always: .json(200, "[]"))
        let api = server.api(token: "t")
        _ = try await api.documents(query: "C++ & quantum optics")
        #expect(server.last?.query == "q=C%2B%2B%20%26%20quantum%20optics")
        _ = try await api.documents(query: "   ")
        #expect(server.last?.query == nil)
    }

    @Test func idsArePercentEncodedPerSegment() async throws {
        let server = StubServer(always: .json(200, Wire.document))
        let api = server.api(token: "t")
        _ = try await api.document(id: "a/b c?d#e")
        #expect(server.last?.path == "/api/documents/a%2Fb%20c%3Fd%23e")
        _ = try? await api.chat(documentID: "64f0c0ffee00000000000001", threadID: "64f0:2026-10-29")
        #expect(server.last?.path == "/api/documents/64f0c0ffee00000000000001/chat")
        #expect(server.last?.query == "threadId=64f0%3A2026-10-29")
    }

    @Test func hostWithAPathPrefix() async throws {
        let server = StubServer(path: "/neuropal", handler: { _ in .json(200, Wire.user) })
        _ = try await server.api(token: "t").me()
        #expect(server.last?.path == "/neuropal/api/auth/me")
    }

    @Test func fileURLsCarryTheTicket() {
        let api = HTTPNeuroPalAPI(host: URL(string: "https://api.example.org")!)
        #expect(api.pageImageURL(documentID: "d1", page: 3, ticket: "a.b.c").absoluteString
            == "https://api.example.org/api/documents/d1/page/3?t=a.b.c")
        #expect(api.pageImageURL(documentID: "d1", page: 3, ticket: nil).absoluteString
            == "https://api.example.org/api/documents/d1/page/3")
        #expect(api.epubBaseURL(documentID: "d1", ticket: "a.b.c").absoluteString
            == "https://api.example.org/api/documents/d1/epub/t/a.b.c/")
        #expect(api.epubBaseURL(documentID: "d1", ticket: nil).absoluteString
            == "https://api.example.org/api/documents/d1/epub/")
    }

    @Test func signInNeverSendsTheCurrentToken() async throws {
        let server = StubServer(always: .json(200, Wire.auth()))
        let result = try await server.api(token: "old-session").login(email: "ryx@example.com", password: "pw-123456")
        let r = try #require(server.last)
        #expect(r.method == "POST")
        #expect(r.path == "/api/auth/login")
        #expect(r.header("Authorization") == nil)
        #expect(r.header("Content-Type") == "application/json")
        #expect(r.json()?["email"] as? String == "ryx@example.com")
        #expect(r.json()?["password"] as? String == "pw-123456")
        #expect(result.token == "tok-1")
        #expect(result.user.email == "ryx@example.com")
    }

    @Test func registerSendsOnlyWhatWasGiven() async throws {
        let server = StubServer(always: .json(201, Wire.auth()))
        let api = server.api()
        _ = try await api.register(email: "a@b.c", password: "12345678", name: "  ", inviteCode: " np-e2e ")
        let body = try #require(server.last?.json())
        #expect(server.last?.path == "/api/auth/register")
        #expect(body["name"] == nil)
        #expect(body["inviteCode"] as? String == "np-e2e")
        _ = try await api.register(email: "a@b.c", password: "12345678", name: "Ryx", inviteCode: nil)
        let second = try #require(server.last?.json())
        #expect(second["name"] as? String == "Ryx")
        #expect(second["inviteCode"] == nil)
    }

    @Test func bodiesOfTheOtherCalls() async throws {
        let server = StubServer { r in
            switch (r.method, r.path) {
            case ("PATCH", "/api/documents/d1/progress"): return .json(200, #"{"progress":0.5}"#)
            case ("PATCH", "/api/documents/d1"): return .json(200, Wire.document)
            case ("POST", "/api/documents/d1/query"): return .json(200, #"{"answer":"Yes.","citations":[]}"#)
            case ("POST", "/api/auth/password"): return .json(200, #"{"token":"tok-2"}"#)
            case ("POST", "/api/pal/chat"): return .json(200, #"{"reply":"Okay.","crisis":false}"#)
            case ("POST", "/api/pal/breakdown"): return .json(200, #"{"steps":["Open it","Read one line","Stop"]}"#)
            case ("DELETE", _), ("POST", "/api/auth/logout-all"): return .json(200, #"{"ok":true}"#)
            default: return .json(404, #"{"error":"Not found"}"#)
            }
        }
        let api = server.api(token: "tok-1")

        try await api.saveReadingProgress(id: "d1", ReadingProgressUpdate(progress: 0.5, lastWordIndex: 120, lastPage: 3, timeSpentSec: 30))
        var body = try #require(server.last?.json())
        #expect(body["progress"] as? Double == 0.5)
        #expect(body["lastWordIndex"] as? Int == 120)
        #expect(body["lastPage"] as? Int == 3)
        #expect(body["timeSpentSec"] as? Int == 30)

        _ = try await api.renameDocument(id: "d1", title: "New title", subtitle: nil)
        body = try #require(server.last?.json())
        #expect(body["title"] as? String == "New title")
        #expect(body["subtitle"] as? String == "")

        _ = try await api.ask(documentID: "d1", question: "What is CPI?", threadID: nil)
        body = try #require(server.last?.json())
        #expect(body["question"] as? String == "What is CPI?")
        #expect(body["threadId"] == nil)

        #expect(try await api.changePassword(current: "old-password", new: "new-password") == "tok-2")
        body = try #require(server.last?.json())
        #expect(body["currentPassword"] as? String == "old-password")
        #expect(body["newPassword"] as? String == "new-password")

        let context = PalChatContext(state: "yellow", localTime: "09:41",
                                     nextAnchor: .init(title: "Lunch", at: "12:30", inMinutes: 169),
                                     minimumDay: ["Water"], palName: "Pebble", talkStyle: "Gentle", people: true)
        _ = try await api.palChat(message: "Hi", context: context)
        body = try #require(server.last?.json())
        #expect(body["message"] as? String == "Hi")
        let ctx = try #require(body["context"] as? [String: Any])
        #expect(ctx["state"] as? String == "yellow")
        #expect((ctx["nextAnchor"] as? [String: Any])?["inMinutes"] as? Int == 169)
        #expect(ctx["minimumDay"] as? [String] == ["Water"])

        #expect(try await api.palBreakdown(task: "Write the intro").steps.count == 3)
        #expect(server.last?.json()?["task"] as? String == "Write the intro")

        try await api.deleteDocument(id: "d1")
        #expect(server.last?.method == "DELETE")
        #expect(server.last?.path == "/api/documents/d1")
        try await api.clearPalChat()
        #expect(server.last?.path == "/api/pal/chat")
        try await api.logoutEverywhere()
        #expect(server.last?.path == "/api/auth/logout-all")
        #expect(server.last?.header("Authorization") == "Bearer tok-1")
    }
}

@Suite("The 401 rule")
struct UnauthorizedTests {
    final class Calls: @unchecked Sendable {
        private let lock = NSLock()
        private var tokens: [String] = []
        func add(_ t: String) { lock.withLock { tokens.append(t) } }
        var all: [String] { lock.withLock { tokens } }
    }

    @Test func a401OnTheCurrentTokenEndsTheSession() async throws {
        let server = StubServer(always: .json(401, #"{"error":"Invalid or expired token"}"#))
        let api = server.api(token: "tok-1")
        let calls = Calls()
        api.onUnauthorized = { calls.add($0) }
        await #expect(throws: APIError.unauthorized) { try await api.documents(query: nil) }
        #expect(calls.all == ["tok-1"])
    }

    @Test func a401ForAnOlderTokenIsStale() async throws {
        // The token changes while the request is on its way (a sign-in or a
        // password change finished meanwhile): the late 401 ends nothing.
        let box = APIBox()
        let server = StubServer { _ in
            box.api?.token = "tok-2"
            return .json(401, #"{"error":"This session was signed out — please sign in again"}"#)
        }
        let api = server.api(token: "tok-1")
        box.api = api
        let calls = Calls()
        api.onUnauthorized = { calls.add($0) }
        await #expect(throws: APIError.server(status: 401, message: "This session was signed out — please sign in again")) {
            try await api.documents(query: nil)
        }
        #expect(calls.all.isEmpty)
        #expect(api.token == "tok-2")
    }

    @Test func aWrongPasswordIsNotTheEndOfASession() async throws {
        let server = StubServer(always: .json(401, #"{"error":"invalid email or password"}"#))
        let api = server.api(token: "tok-1")
        let calls = Calls()
        api.onUnauthorized = { calls.add($0) }
        await #expect(throws: APIError.server(status: 401, message: "invalid email or password")) {
            try await api.login(email: "a@b.c", password: "nope")
        }
        #expect(calls.all.isEmpty)
    }

    @Test func aWrongCurrentPasswordKeepsTheSession() async throws {
        let server = StubServer(always: .json(401, #"{"error":"the current password is not right"}"#))
        let api = server.api(token: "tok-1")
        let calls = Calls()
        api.onUnauthorized = { calls.add($0) }
        await #expect(throws: APIError.server(status: 401, message: "the current password is not right")) {
            _ = try await api.changePassword(current: "wrong", new: "long-enough")
        }
        #expect(calls.all.isEmpty)
        #expect(api.token == "tok-1")
    }

    @Test func a401WithoutAnyTokenIsJustAnAnswer() async throws {
        let server = StubServer(always: .json(401, #"{"error":"Missing token"}"#))
        let api = server.api(token: nil)
        let calls = Calls()
        api.onUnauthorized = { calls.add($0) }
        await #expect(throws: APIError.server(status: 401, message: "Missing token")) { _ = try await api.me() }
        #expect(calls.all.isEmpty)
    }
}

final class APIBox: @unchecked Sendable {
    var api: HTTPNeuroPalAPI?
}

@Suite("Error answers")
struct ErrorMappingTests {
    @Test func staleAppearanceHandsBackTheServersCopy() async throws {
        let server = StubServer(always: .json(409, #"{"error":"stale appearance","appearance":{"v":1,"skin":"signal","updatedAt":"2026-10-29T09:00:00.000Z"}}"#))
        let api = server.api(token: "t")
        do {
            _ = try await api.putAppearance(["v": 1, "skin": "classic", "updatedAt": "2026-10-28T09:00:00.000Z"])
            Issue.record("expected a 409")
        } catch APIError.staleAppearance(let stored) {
            #expect(stored["skin"]?.stringValue == "signal")
            #expect(stored["updatedAt"]?.stringValue == "2026-10-29T09:00:00.000Z")
        }
        let r = try #require(server.last)
        #expect(r.method == "PUT")
        #expect(r.path == "/api/me/appearance")
        #expect((r.json()?["appearance"] as? [String: Any])?["skin"] as? String == "classic")
    }

    @Test func appearanceRoundTrip() async throws {
        let server = StubServer { r in
            r.method == "GET" ? .json(200, #"{"appearance":null}"#) : .json(200, #"{"appearance":{"v":1,"skin":"classic"}}"#)
        }
        let api = server.api(token: "t")
        #expect(try await api.appearance() == nil)
        let stored = try await api.putAppearance(["v": 1, "skin": "classic"])
        #expect(stored["skin"]?.stringValue == "classic")
    }

    @Test func rateLimitedFromTheBody() async throws {
        let server = StubServer(always: .json(429, #"{"error":"Too many sign-in attempts from this network — try again in a few minutes","retryAfterSec":42}"#,
                                              headers: ["Retry-After": "42"]))
        await #expect(throws: APIError.rateLimited(retryAfter: 42)) {
            try await server.api().login(email: "a@b.c", password: "x")
        }
    }

    @Test func rateLimitedFromTheHeader() async throws {
        let server = StubServer(always: .json(429, "<html>slow down</html>", headers: ["Retry-After": "7"]))
        await #expect(throws: APIError.rateLimited(retryAfter: 7)) { try await server.api(token: "t").palBreakdown(task: "x") }
        let bare = StubServer(always: .json(429, "{}"))
        await #expect(throws: APIError.rateLimited(retryAfter: nil)) { try await bare.api(token: "t").palBreakdown(task: "x") }
    }

    @Test func otherStatuses() async throws {
        await #expect(throws: APIError.forbidden("That invite code is not right")) {
            try await StubServer(always: .json(403, #"{"error":"That invite code is not right"}"#)).api()
                .register(email: "a@b.c", password: "12345678", name: nil, inviteCode: "nope")
        }
        await #expect(throws: APIError.notFound) {
            try await StubServer(always: .json(404, #"{"error":"document not found"}"#)).api(token: "t").document(id: "x")
        }
        await #expect(throws: APIError.server(status: 409, message: "email already registered")) {
            try await StubServer(always: .json(409, #"{"error":"email already registered"}"#)).api()
                .register(email: "a@b.c", password: "12345678", name: nil, inviteCode: nil)
        }
        await #expect(throws: APIError.server(status: 502, message: "")) {
            try await StubServer(always: .json(502, "<html>Bad gateway</html>")).api(token: "t").documents(query: nil)
        }
        await #expect(throws: APIError.server(status: 413, message: "That file is too large for this server.")) {
            try await StubServer(always: .json(413, #"{"error":"File too large"}"#)).api(token: "t").documents(query: nil)
        }
    }

    @Test func noAnswerIsOffline() async throws {
        for code in [URLError.Code.notConnectedToInternet, .timedOut, .cannotFindHost, .networkConnectionLost,
                     .secureConnectionFailed] {
            await #expect(throws: APIError.offline) { try await StubServer(always: .fail(code)).api(token: "t").me() }
        }
    }

    @Test func aReplyThatIsntNeuroPalIsADecodingError() async throws {
        let server = StubServer(always: Reply.html)
        do {
            _ = try await server.api(token: "t").me()
            Issue.record("expected a decoding error")
        } catch APIError.decoding {
        }
    }

    typealias Reply = StubURLProtocol.Reply
}

private extension StubURLProtocol.Reply {
    /// A captive portal or an edge page answering 200.
    static var html: Self { .json(200, "<!doctype html><title>Sign in to Wi-Fi</title>", headers: ["Content-Type": "text/html"]) }
}

@Suite("Original PDF")
struct OriginalFileTests {
    @Test func downloadsToAFileTheCallerOwns() async throws {
        let pdf = Data("%PDF-1.7 fake".utf8)
        let server = StubServer { r in
            var reply = StubURLProtocol.Reply(status: 200, body: pdf)
            reply.headers = ["Content-Type": "application/pdf"]
            return r.path == "/api/documents/d1/file" ? reply : .json(404, "{}")
        }
        let file = try await server.api(token: "tok-1").downloadOriginalFile(documentID: "d1")
        defer { try? FileManager.default.removeItem(at: file) }
        #expect(try Data(contentsOf: file) == pdf)
        #expect(file.lastPathComponent == "np-original-d1.pdf")
        #expect(server.last?.header("Authorization") == "Bearer tok-1")
        #expect(server.last?.header("Accept") == "application/pdf")
    }

    @Test func notAPDFSaysWhy() async throws {
        let server = StubServer(always: .json(400, #"{"error":"the original file is only available for PDF documents"}"#))
        await #expect(throws: APIError.server(status: 400, message: "the original file is only available for PDF documents")) {
            _ = try await server.api(token: "t").downloadOriginalFile(documentID: "e1")
        }
    }

    @Test func ticketURL() {
        let api = HTTPNeuroPalAPI(host: URL(string: "https://api.example.org")!)
        #expect(api.originalFileURL(documentID: "d1", ticket: "a.b.c").absoluteString
            == "https://api.example.org/api/documents/d1/file?t=a.b.c")
    }
}

@Suite("Uploads")
struct UploadTests {
    @Test func mimeTypesForEveryFormat() {
        #expect(Multipart.mimeType(forExtension: "pdf") == "application/pdf")
        #expect(Multipart.mimeType(forExtension: "EPUB") == "application/epub+zip")
        #expect(Multipart.mimeType(forExtension: "docx") == "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        #expect(Multipart.mimeType(forExtension: "pptx") == "application/vnd.openxmlformats-officedocument.presentationml.presentation")
        #expect(Multipart.mimeType(forExtension: "md") == "text/markdown")
        #expect(Multipart.mimeType(forExtension: "markdown") == "text/markdown")
        #expect(Multipart.mimeType(forExtension: "txt") == "text/plain")
        #expect(Multipart.mimeType(forExtension: "djvu") == "image/vnd.djvu")
        #expect(Multipart.mimeType(forExtension: "xyz") == "application/octet-stream")
    }

    @Test func multipartBodyShape() throws {
        let dir = FileManager.default.temporaryDirectory.appending(path: "np-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appending(path: "Ghost “imaging” – ü.pdf")
        let bytes = Data([0x25, 0x50, 0x44, 0x46, 0x2D, 0x00, 0xFF, 0x0D, 0x0A])
        try bytes.write(to: file)

        let api = HTTPNeuroPalAPI(host: URL(string: "https://api.example.org")!, token: "tok-1")
        let (request, bodyFile) = try api.uploadRequest(fileURL: file, title: "Ghost imaging, revisited")
        defer { try? FileManager.default.removeItem(at: bodyFile) }

        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "https://api.example.org/api/documents/upload")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer tok-1")
        let contentType = try #require(request.value(forHTTPHeaderField: "Content-Type"))
        #expect(contentType.hasPrefix("multipart/form-data; boundary="))
        let boundary = String(contentType.dropFirst("multipart/form-data; boundary=".count))
        #expect(!boundary.isEmpty)

        let body = try Data(contentsOf: bodyFile)
        #expect(request.value(forHTTPHeaderField: "Content-Length") == String(body.count))
        let head: [String] = [
            "--\(boundary)\r\n",
            "Content-Disposition: form-data; name=\"title\"\r\n",
            "Content-Type: text/plain; charset=utf-8\r\n\r\n",
            "Ghost imaging, revisited\r\n",
            "--\(boundary)\r\n",
            "Content-Disposition: form-data; name=\"file\"; filename=\"Ghost _imaging_ _ u.pdf\"\r\n",
            "Content-Type: application/pdf\r\n\r\n",
        ]
        var expected = Data(head.joined().utf8)
        expected.append(bytes)
        expected.append(Data("\r\n--\(boundary)--\r\n".utf8))
        #expect(body == expected)
    }

    @Test func titleDefaultsToTheFileName() throws {
        let dir = FileManager.default.temporaryDirectory.appending(path: "np-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appending(path: "Notes über Optik.md")
        try Data("# Hi".utf8).write(to: file)
        let api = HTTPNeuroPalAPI(host: URL(string: "https://api.example.org")!)
        let (_, bodyFile) = try api.uploadRequest(fileURL: file, title: nil)
        defer { try? FileManager.default.removeItem(at: bodyFile) }
        let body = String(decoding: try Data(contentsOf: bodyFile), as: UTF8.self)
        #expect(body.contains("name=\"title\"\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nNotes über Optik\r\n"))
        #expect(body.contains("filename=\"Notes uber Optik.md\""))
        #expect(body.contains("Content-Type: text/markdown"))
    }

    @Test func uploadReturnsTheNewDocument() async throws {
        let server = StubServer(always: .json(201, Wire.document.replacingOccurrences(of: "\"ready\"", with: "\"pending\"")))
        let dir = FileManager.default.temporaryDirectory.appending(path: "np-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appending(path: "paper.pdf")
        try Data(repeating: 7, count: 300_000).write(to: file)

        let doc = try await server.api(token: "tok-1").upload(fileURL: file, title: "Paper")
        #expect(doc.status == .pending)
        let r = try #require(server.last)
        #expect(r.method == "POST")
        #expect(r.path == "/api/documents/upload")
        #expect(r.header("Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)
        #expect(r.header("Authorization") == "Bearer tok-1")
        if let body = r.body {
            #expect(body.count > 300_000)
        }
    }

    @Test func tooLargeSaysSoPlainly() async throws {
        let server = StubServer(always: .json(413, "<html>413 Request Entity Too Large</html>", headers: ["Content-Type": "text/html"]))
        let file = FileManager.default.temporaryDirectory.appending(path: "np-test-\(UUID().uuidString).txt")
        try Data("hello".utf8).write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        do {
            _ = try await server.api(token: "t").upload(fileURL: file, title: nil)
            Issue.record("expected 413")
        } catch let error as APIError {
            #expect(error == .server(status: 413, message: "That file is too large for this server."))
            #expect(error.errorDescription == "That file is too large for this server.")
        }
    }
}
