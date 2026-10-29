import Foundation
import Testing
@testable import NPCore

/// The real client against a real NeuroPal backend in public (sign-in) mode
/// with the invite code `np-e2e` (on a Mac: an in-memory MongoDB, see the
/// e2e server script). Off unless NP_E2E_HOST is set:
///
///   NP_E2E_HOST=http://localhost:4100 scripts/mac-build.sh test
@MainActor
@Suite("Real server", .serialized, .enabled(if: ProcessInfo.processInfo.environment["NP_E2E_HOST"] != nil))
struct RealServerTests {
    let host = URL(string: ProcessInfo.processInfo.environment["NP_E2E_HOST"] ?? "http://localhost:4100")!

    @Test func accountDocumentsAndSessions() async throws {
        let store = MemorySessionStore()
        let session = AppSession(host: host, store: store, makeAPI: { HTTPNeuroPalAPI(host: $0) })
        await session.boot()
        #expect(session.phase == .signedOut, "a public server asks for sign-in")

        let config = try await session.api.authConfig()
        #expect(config == AuthConfig(localMode: false, signup: "invite"))

        let email = "e2e-\(UUID().uuidString.prefix(8).lowercased())@example.com"
        await #expect(throws: APIError.forbidden("That invite code is not right")) {
            try await session.register(email: email, password: "correct horse", name: "E2E", inviteCode: "nope")
        }
        await #expect(throws: APIError.server(status: 400, message: "password must be at least 8 characters")) {
            try await session.register(email: email, password: "short", name: "E2E", inviteCode: "np-e2e")
        }
        try await session.register(email: email, password: "correct horse", name: "E2E", inviteCode: "np-e2e")
        #expect(session.phase == .signedIn)
        #expect(session.user?.email == email)
        #expect(session.user?.name == "E2E")
        #expect(store.load(host: host)?.token == session.api.token)
        await #expect(throws: APIError.server(status: 409, message: "email already registered")) {
            _ = try await session.api.register(email: email, password: "correct horse", name: nil, inviteCode: "np-e2e")
        }

        // The look: never saved → saved → an older copy is refused with the stored one.
        #expect(try await session.api.appearance() == nil)
        let stored = try await session.api.putAppearance(["v": 1, "skin": "signal", "updatedAt": "2026-10-29T09:00:00.000Z"])
        #expect(stored["skin"]?.stringValue == "signal")
        do {
            _ = try await session.api.putAppearance(["v": 1, "skin": "classic", "updatedAt": "2026-10-01T09:00:00.000Z"])
            Issue.record("an older look should be refused")
        } catch APIError.staleAppearance(let newer) {
            #expect(newer["skin"]?.stringValue == "signal")
        }

        // Documents: upload (multipart, streamed), list, search, rename, progress, text, ticket.
        #expect(try await session.api.documents(query: nil).isEmpty)
        let dir = FileManager.default.temporaryDirectory.appending(path: "np-e2e-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appending(path: "Ghost imaging – notes.txt")
        try Data("Photons arrive in pairs from the crystal.\n\nThe second detector sees the other one.".utf8).write(to: file)
        let doc = try await session.api.upload(fileURL: file, title: "E2E notes über Photonen")
        #expect(doc.type == .txt)
        #expect(doc.title == "E2E notes über Photonen")
        #expect(doc.status == .pending)

        let found = try await session.api.documents(query: "über")
        #expect(found.map(\.id) == [doc.id])
        #expect(try await session.api.documents(query: "nothing like this").isEmpty)

        let renamed = try await session.api.renameDocument(id: doc.id, title: "E2E renamed", subtitle: "a subtitle")
        #expect(renamed.title == "E2E renamed")
        #expect(renamed.subtitle == "a subtitle")
        #expect(try await session.api.document(id: doc.id).title == "E2E renamed")

        try await session.api.saveReadingProgress(id: doc.id, ReadingProgressUpdate(progress: 0.5, lastWordIndex: 3, lastPage: 1,
                                                                                   timeSpentSec: 12))
        let progress = try await session.api.readingProgress(id: doc.id)
        #expect(progress.progress == 0.5)
        #expect(progress.lastWordIndex == 3)
        #expect(try await session.api.documents(query: nil).first?.readingProgress == 0.5)

        let text = try await session.api.documentText(id: doc.id)
        #expect(text.text.contains("Photons arrive in pairs"))
        #expect(try await session.api.ticket(documentID: doc.id).ticket?.isEmpty == false)
        await #expect(throws: APIError.server(status: 400, message: "the original file is only available for PDF documents")) {
            _ = try await session.api.downloadOriginalFile(documentID: doc.id)
        }
        await #expect(throws: APIError.notFound) { _ = try await session.api.document(id: "64f0c0ffee00000000000000") }

        // Sessions: a wrong current password keeps the session; a change
        // ends every other one; sign out everywhere ends this one too.
        let firstToken = try #require(session.api.token)
        await #expect(throws: APIError.server(status: 401, message: "the current password is not right")) {
            try await session.changePassword(current: "not my password", new: "another horse")
        }
        #expect(session.phase == .signedIn)
        #expect(session.api.token == firstToken)

        try await session.changePassword(current: "correct horse", new: "another horse")
        #expect(session.api.token != firstToken)
        #expect(store.load(host: host)?.token == session.api.token)
        let old = HTTPNeuroPalAPI(host: host, token: firstToken)
        await #expect(throws: APIError.unauthorized) { _ = try await old.me() }
        #expect(try await session.api.me().user.email == email)

        try await session.signOutEverywhere()
        #expect(session.phase == .signedOut)
        await #expect(throws: APIError.server(status: 401, message: "invalid email or password")) {
            try await session.signIn(email: email, password: "correct horse")
        }
        try await session.signIn(email: email.uppercased(), password: "another horse")
        #expect(session.phase == .signedIn)

        try await session.api.deleteDocument(id: doc.id)
        await #expect(throws: APIError.notFound) { _ = try await session.api.document(id: doc.id) }

        // A fresh boot with the saved session signs straight in.
        let again = AppSession(host: host, store: store, makeAPI: { HTTPNeuroPalAPI(host: $0) })
        await again.boot()
        #expect(again.phase == .signedIn)
        #expect(again.user?.email == email)
    }
}
