import Foundation
import Testing
@testable import NPCore

// Replies shaped exactly as neuropal-backend/src/routes sends them, through
// the real client (so the envelope handling is tested too).
@Suite("Server JSON")
struct DecodingTests {
    @Test func signInReply() async throws {
        let server = StubServer(always: .json(200, Wire.auth(token: "jwt.a.b")))
        let result = try await server.api().login(email: "ryx@example.com", password: "x")
        #expect(result.token == "jwt.a.b")
        #expect(result.user.id == "64f0c0ffee00000000000aa1")
        #expect(result.user.name == "Ryx")
        #expect(result.user.timezone == "Europe/Rome")
        #expect(result.user.appearance == nil)
    }

    @Test func meWithAndWithoutARefresh() async throws {
        let plain = try await StubServer(always: .json(200, Wire.me())).api(token: "t").me()
        #expect(plain.user.email == "ryx@example.com")
        #expect(plain.refreshedToken == nil)
        let refreshed = try await StubServer(always: .json(200, Wire.me(refreshedToken: "fresh"))).api(token: "t").me()
        #expect(refreshed.refreshedToken == "fresh")
        #expect(refreshed.user.id == "64f0c0ffee00000000000aa1")
    }

    @Test func authConfigAndItsDefaults() async throws {
        let invite = try await StubServer(always: .json(200, #"{"localMode":false,"signup":"invite"}"#)).api().authConfig()
        #expect(invite == AuthConfig(localMode: false, signup: "invite"))
        #expect(invite.needsInvite && invite.signupOpen)
        let local = try await StubServer(always: .json(200, #"{"localMode":true,"signup":"closed"}"#)).api().authConfig()
        #expect(local.localMode)
        #expect(!local.signupOpen)
        let odd = try await StubServer(always: .json(200, #"{"signup":"maybe"}"#)).api().authConfig()
        #expect(odd == AuthConfig(localMode: false, signup: "invite"))
    }

    @Test func documentList() async throws {
        let list = "[\(Wire.document),{\"_id\":\"64f0c0ffee00000000000002\",\"title\":\"Book\",\"type\":\"epub\",\"status\":\"embedding\",\"progress\":0.37,\"createdAt\":\"2026-10-28T10:00:00Z\",\"readingProgress\":0,\"lastReadAt\":null}]"
        let docs = try await StubServer(always: .json(200, list)).api(token: "t").documents(query: nil)
        #expect(docs.count == 2)
        #expect(docs[0].id == "64f0c0ffee00000000000001")
        #expect(docs[0].subtitle == "D'Angelo et al.")
        #expect(docs[0].readingProgress == 0.4)
        #expect(docs[0].lastReadAt != nil)
        #expect(docs[0].pageCount == 12)
        #expect(docs[1].type == .epub)
        #expect(docs[1].status == .embedding)
        #expect(docs[1].status.isProcessing)
        #expect(docs[1].progress == 0.37)
        #expect(docs[1].lastReadAt == nil)
    }

    @Test func documentText() async throws {
        let json = #"""
        {"id":"64f0c0ffee00000000000001","title":"CPI","text":"One.\n\nTwo.\n\nThree.","pageCount":3,"wordCount":3,
         "toc":[{"title":"Intro","order":0,"startParagraph":0,"startPage":1}],"pageMap":[{"page":1,"startParagraph":0},{"page":2,"startParagraph":2}],
         "source":"chunks"}
        """#
        let text = try await StubServer(always: .json(200, json)).api(token: "t").documentText(id: "64f0c0ffee00000000000001")
        #expect(text.text.components(separatedBy: "\n\n").count == 3)
        #expect(text.toc.first?.title == "Intro")
        #expect(text.pageMap.last == PageAnchor(page: 2, startParagraph: 2))
        #expect(text.source == "chunks")
        // A raw-file answer has no toc or pageMap at all.
        let raw = try await StubServer(always: .json(200, #"{"id":"x","title":"t","text":"hi","source":"raw-file"}"#))
            .api(token: "t").documentText(id: "x")
        #expect(raw.toc.isEmpty && raw.pageMap.isEmpty)
    }

    @Test func progressTicketAndManifest() async throws {
        let progress = try await StubServer(always: .json(200, #"{"documentId":"d","progress":0.25,"lastWordIndex":512,"lastPage":null,"lastOpenedAt":"2026-10-29T08:00:00.123Z"}"#))
            .api(token: "t").readingProgress(id: "d")
        #expect(progress.progress == 0.25)
        #expect(progress.lastWordIndex == 512)
        #expect(progress.lastPage == nil)
        #expect(progress.lastOpenedAt != nil)

        let ticket = try await StubServer(always: .json(200, #"{"ticket":"eyJ.a.b","expiresAt":"2026-10-29T20:00:00.000Z"}"#))
            .api(token: "t").ticket(documentID: "d")
        #expect(ticket.ticket == "eyJ.a.b")
        #expect(ticket.expiresAt != nil)
        let local = try await StubServer(always: .json(200, #"{"ticket":null,"expiresAt":null}"#)).api().ticket(documentID: "d")
        #expect(local.ticket == nil)

        let manifest = try await StubServer(always: .json(200, #"""
        {"id":"d","title":"Book","spine":[{"index":0,"href":"OEBPS/ch1.xhtml"},{"index":1,"href":"OEBPS/ch2.xhtml"}],
         "toc":[{"title":"Part I","href":"OEBPS/ch1.xhtml","children":[{"title":"1.1","href":"OEBPS/ch1.xhtml","anchor":"s1","children":[]}]}],
         "pageList":[{"page":"xii","href":"OEBPS/ch1.xhtml","anchor":"p12"},{"page":3,"href":"OEBPS/ch2.xhtml"}]}
        """#)).api(token: "t").epubManifest(documentID: "d")
        #expect(manifest.spine.count == 2)
        #expect(manifest.toc.first?.children.first?.anchor == "s1")
        #expect(manifest.pageList.map(\.page) == ["xii", "3"])
    }

    @Test func groundedAnswerAndChat() async throws {
        let answer = try await StubServer(always: .json(200, #"""
        {"answer":"It correlates two detectors.","citations":[{"chunkId":"64f0c0ffee000000000000c1","page":3,"sectionHeading":"Method","excerpt":"two detectors"},{"excerpt":"no chunk"}],
         "verbatim":["two detectors","no chunk"],"threadId":"d:2026-10-29","mode":"rag","method":"rag","model":"gemini-2.5-flash","provider":"gemini","chunksUsed":8}
        """#)).api(token: "t").ask(documentID: "d", question: "How?", threadID: nil)
        #expect(answer.citations.count == 2)
        #expect(answer.citations[0].page == 3)
        #expect(answer.citations[1].chunkId == nil)
        #expect(answer.threadId == "d:2026-10-29")
        #expect(answer.mode == "rag")
        #expect(answer.chunksUsed == 8)

        let chat = try await StubServer(always: .json(200, #"""
        [{"_id":"m1","userId":"u","documentId":"d","threadId":"d:2026-10-29","role":"user","content":"How?","citations":[],"createdAt":"2026-10-29T09:00:00.000Z","__v":0},
         {"_id":"m2","role":"assistant","content":"It correlates.","citations":[{"chunkId":"c1","page":null,"excerpt":"x","_id":"z"}],"model":"m","tokens":{"total":10},"createdAt":"2026-10-29T09:00:03.000Z"}]
        """#)).api(token: "t").chat(documentID: "d", threadID: nil)
        #expect(chat.map(\.role) == [.user, .assistant])
        #expect(chat[1].citations.first?.chunkId == "c1")
        #expect(chat[1].citations.first?.page == nil)
    }

    @Test func pal() async throws {
        let steps = try await StubServer(always: .json(200, #"{"steps":["Open the file","Read the first line","Stop for water"],"provider":"gemini","model":"g"}"#))
            .api(token: "t").palBreakdown(task: "Read")
        #expect(steps.steps.count == 3)
        let crisis = try await StubServer(always: .json(200, #"{"reply":"I’m really glad you told me.","crisis":true}"#))
            .api(token: "t").palChat(message: "x", context: nil)
        #expect(crisis.crisis)
        #expect(crisis.provider == nil)
        let plain = try await StubServer(always: .json(200, #"{"reply":"Okay."}"#)).api(token: "t").palChat(message: "x", context: nil)
        #expect(!plain.crisis)
    }
}
