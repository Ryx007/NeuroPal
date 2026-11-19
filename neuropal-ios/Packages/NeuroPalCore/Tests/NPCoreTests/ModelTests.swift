import Foundation
import Testing
@testable import NPCore

@Test func decodesALeanDocument() throws {
    let json = #"""
    {"_id":"64f0c0ffee00000000000001","userId":"x","title":"A paper","type":"pdf","status":"embedding",
     "progress":0.5,"pageCount":6,"createdAt":"2026-10-29T01:36:00.000Z","readingProgress":0.25,"newField":{"a":1}}
    """#
    let d = try JSONDecoder.neuropal.decode(NPDocument.self, from: Data(json.utf8))
    #expect(d.id == "64f0c0ffee00000000000001")
    #expect(d.status == .embedding)
    #expect(d.status.isProcessing)
    #expect(d.readingProgress == 0.25)
    #expect(d.createdAt != nil)
}

@Test func unknownEnumValuesDoNotBreakDecoding() throws {
    let json = #"{"_id":"1","title":"t","type":"hologram","status":"teleporting"}"#
    let d = try JSONDecoder.neuropal.decode(NPDocument.self, from: Data(json.utf8))
    #expect(d.type == .unknown)
    #expect(d.status == .unknown)
}

@Test func deepLinks() {
    #expect(DeepLink.route(for: URL(string: "neuropal://calm")!) == .calm)
    #expect(DeepLink.route(for: URL(string: "neuropal://pal?tool=talk")!) == .pal(.talk))
    #expect(DeepLink.route(for: URL(string: "neuropal://read?doc=64f0c0ffee00000000000001")!)
        == .reader(documentID: "64f0c0ffee00000000000001"))
    #expect(DeepLink.route(for: URL(string: "neuropal://read?doc=../../etc")!) == nil)
    #expect(DeepLink.route(for: URL(string: "https://calm")!) == nil)
}

@Test func sessionIsBoundToItsHost() {
    let store = MemorySessionStore(StoredSession(host: "https://api.ryx007.work", token: "t"))
    #expect(store.load(host: URL(string: "https://api.ryx007.work")!)?.token == "t")
    #expect(store.load(host: URL(string: "https://evil.example")!) == nil)
    #expect(store.load(host: URL(string: "http://api.ryx007.work")!) == nil)
}

@MainActor
@Test func bootWithASavedSessionSignsIn() async {
    let host = URL(string: "https://mock.neuropal.invalid")!
    let store = MemorySessionStore(StoredSession(host: AppSession.origin(host), token: "mock-token"))
    let session = AppSession(host: host, store: store, makeAPI: { h in MockNeuroPalAPI(host: h, token: nil, latency: .zero) })
    await session.boot()
    #expect(session.phase == .signedIn)
    #expect(session.user?.email == MockFixtures.user.email)
}

@MainActor
@Test func bootWithoutASessionAsksToSignIn() async {
    let session = AppSession(store: MemorySessionStore(), makeAPI: { h in MockNeuroPalAPI(host: h, token: nil, latency: .zero) })
    await session.boot()
    #expect(session.phase == .signedOut)
}
